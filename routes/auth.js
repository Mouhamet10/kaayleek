// routes/auth.js
// Authentification : inscription et connexion.

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db/database');
const { requireAuth, JWT_SECRET } = require('../server/middleware/auth');

const router = express.Router();

const signToken = (user) => jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

// Validation côté serveur.
function validateRegister(body) {
  const errors = [];
  if (!body.firstname || body.firstname.trim().length < 2) errors.push('Le prénom doit contenir au moins 2 caractères.');
  if (!body.lastname || body.lastname.trim().length < 2) errors.push('Le nom doit contenir au moins 2 caractères.');
  if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) errors.push('Adresse email invalide.');
  if (!body.password || body.password.length < 6) errors.push('Le mot de passe doit contenir au moins 6 caractères.');
  return errors;
}

// POST /api/auth/register  — Inscription
router.post('/register', (req, res) => {
  const errors = validateRegister(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors[0], details: errors });

  const { firstname, lastname, email, phone, password } = req.body;
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'Un compte existe déjà avec cette adresse email.' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(
    'INSERT INTO users (firstname, lastname, email, phone, password) VALUES (?, ?, ?, ?, ?)'
  ).run(firstname.trim(), lastname.trim(), email.toLowerCase().trim(), phone || null, hash);

  const user = db.prepare('SELECT id, firstname, lastname, email, role FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ token: signToken(user), user });
});

// POST /api/auth/login  — Connexion
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis.' });

  // Permet de se connecter avec le pseudo "admin" (back-office) ou par email.
  const identifier = email.toLowerCase().trim();
  const adminEmail = db.prepare("SELECT email FROM users WHERE role = 'admin' AND active = 1 ORDER BY id LIMIT 1").get();
  const actualEmail = identifier === 'admin' && adminEmail ? adminEmail.email : identifier;

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(actualEmail);
  if (!user) return res.status(401).json({ error: 'Identifiants incorrects.' });
  if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Identifiants incorrects.' });
  if (!user.active) return res.status(403).json({ error: 'Ce compte a été désactivé. Contactez l\'administration.' });

  res.json({ token: signToken(user), user: { id: user.id, firstname: user.firstname, lastname: user.lastname, email: user.email, role: user.role } });
});

// GET /api/auth/me  — Profil du client connecté
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, firstname, lastname, email, phone, address, role, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// PUT /api/auth/me  — Mise à jour du profil (client connecté)
router.put('/me', requireAuth, (req, res) => {
  const { firstname, lastname, phone, address } = req.body || {};
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!current) return res.status(404).json({ error: 'Compte introuvable.' });

  const fn = firstname && firstname.trim().length >= 2 ? firstname.trim() : current.firstname;
  const ln = lastname && lastname.trim().length >= 2 ? lastname.trim() : current.lastname;
  if (firstname && firstname.trim().length < 2) return res.status(400).json({ error: 'Le prénom doit contenir au moins 2 caractères.' });
  if (lastname && lastname.trim().length < 2) return res.status(400).json({ error: 'Le nom doit contenir au moins 2 caractères.' });

  db.prepare('UPDATE users SET firstname = ?, lastname = ?, phone = ?, address = ? WHERE id = ?')
    .run(fn, ln, phone !== undefined ? (phone || null) : current.phone, address !== undefined ? (address || null) : current.address, current.id);

  const user = db.prepare('SELECT id, firstname, lastname, email, phone, address, role, created_at FROM users WHERE id = ?').get(current.id);
  res.json(user);
});

module.exports = router;
