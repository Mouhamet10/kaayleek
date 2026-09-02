// server/index.js
// Point d'entrée du serveur Express.

require('dotenv').config();

const path = require('path');
const express = require('express');
const { db } = require('../db/database');
const { requireAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------
// Middlewares globaux
// ---------------------------------------------------------------
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Rendre les paramètres du site disponibles dans toutes les requêtes
app.use((req, res, next) => {
  req.settings = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map(r => [r.key, r.value]));
  next();
});

// ---------------------------------------------------------------
// Routes API
// ---------------------------------------------------------------
app.use('/api/auth', require('../routes/auth'));
app.use('/api/dishes', require('../routes/dishes'));
app.use('/api/reservations', require('../routes/reservations'));
app.use('/api/orders', require('../routes/orders'));
app.use('/api/reviews', require('../routes/reviews'));
app.use('/api/admin', require('../routes/admin'));
app.use('/api/upload', require('../routes/upload'));

// ---------------------------------------------------------------
// Espace administration (fichiers statiques dans /admin)
// ---------------------------------------------------------------
const ADMIN_DIR = path.join(__dirname, '..', 'admin');
// Page de connexion admin : sert login.html (et non le dashboard)
app.get(['/admin/login', '/admin/login/'], (req, res) => {
  res.sendFile(path.join(ADMIN_DIR, 'login.html'));
});
app.use('/admin', express.static(ADMIN_DIR));

// Récupérer l'utilisateur connecté (pour le frontend, si token valide)
app.get('/api/me', requireAuth, (req, res) => {
  res.json(req.user);
});

// GET /api/settings/public  — Paramètres publics pour le frontend
app.get('/api/settings/public', (req, res) => {
  const pub = Object.fromEntries(
    Object.entries(req.settings).filter(([k]) => k !== 'map.embed' && !k.startsWith('social'))
  );
  pub['social'] = ['facebook', 'instagram', 'twitter'].reduce((o, s) => (o[s] = req.settings[`social.${s}`], o), {});
  res.json(pub);
});

// GET /api/gallery/public  — Photos de la galerie (public)
app.get('/api/gallery/public', (req, res) => {
  res.json(db.prepare('SELECT * FROM gallery ORDER BY id').all());
});

// POST /api/contact  — Formulaire de contact (envoi simple + log)
app.post('/api/contact', (req, res) => {
  const { name, email, message } = req.body || {};
  if (!name || !email || !message) return res.status(400).json({ error: 'Tous les champs sont requis.' });
  if (message.trim().length < 10) return res.status(400).json({ error: 'Message trop court.' });
  // En production, envoi via nodemailer. Ici on confirme simplement.
  console.log(`📩 Message de ${name} <${email}> : ${message.slice(0, 50)}...`);
  res.status(201).json({ ok: true, message: 'Merci ! Votre message a bien été transmis. Nous vous répondrons rapidement.' });
});

// Espace admin : les pages imbriquées (/admin/dashboard, /admin/menu, ...)
// renvoient toujours le SPA index.html de l'admin.
app.get('/admin/:page', (req, res) => {
  res.sendFile(path.join(ADMIN_DIR, 'index.html'));
});

// Catch-all : renvoie l'index.html pour le SPA multi-pages
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Gestion centralisée des erreurs
app.use((err, req, res, next) => {
  console.error('Erreur serveur :', err);
  res.status(500).json({ error: 'Erreur interne du serveur.', detail: err.message });
});

app.listen(PORT, () => {
  console.log(`🍽️  KaayLeek restaurant — serveur démarré sur http://localhost:${PORT}`);
});
