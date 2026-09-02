// routes/reservations.js
// Réservations : création (publique/client), gestion (client + admin).

const express = require('express');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const { db } = require('../db/database');
const { requireAuth, requireAdmin, JWT_SECRET } = require('../server/middleware/auth');

const router = express.Router();

// Authentification OPTIONNELLE : rattache la réservation au compte client si un
// token valide est fourni, sans bloquer les visiteurs non connectés.
function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = db.prepare('SELECT id, firstname, lastname, email, role, active FROM users WHERE id = ?').get(decoded.id);
      if (user && user.active) req.user = user;
    } catch { /* token invalide -> invité */ }
  }
  next();
}

// Envoi d'un email de confirmation (optionnel : nécessite des identifiants SMTP valides).
// Important : gère proprement les erreurs async pour ne JAMAIS faire planter le serveur.
async function sendConfirmationEmail(reservation, settings) {
  if (!reservation.email) return;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('Email non envoyé : config SMTP manquante.');
    return;
  }
  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transport.sendMail({
      from: process.env.SMTP_USER,
      to: reservation.email,
      subject: `Votre réservation chez ${settings['site.name']}`,
      html: `<h2>Réservation reçue</h2>
        <p>Bonjour ${reservation.name},</p>
        <p>Nous avons bien reçu votre demande de réservation pour <strong>${reservation.people} personne(s)</strong> le <strong>${reservation.date}</strong> à <strong>${reservation.time}</strong>.</p>
        <p>Notre équipe vous recontactera pour confirmer.</p>
        <p>À très bientôt,<br/>${settings['site.name']}</p>`,
    });
  } catch (e) {
    console.warn('Email non envoyé (erreur SMTP) :', e.message);
  }
}

// Validation serveur des réservations.
function validateReservation(body) {
  const errors = [];
  if (!body.name || body.name.trim().length < 2) errors.push('Votre nom est requis.');
  if (!body.phone || body.phone.trim().length < 8) errors.push('Numéro de téléphone invalide.');
  if (!body.people || Number(body.people) < 1 || Number(body.people) > 30) errors.push('Le nombre de personnes doit être entre 1 et 30.');
  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) errors.push('Date invalide.');
  else if (body.date < new Date().toISOString().slice(0, 10)) errors.push('La date doit être dans le futur.');
  if (!body.time || !/^\d{2}:\d{2}$/.test(body.time)) errors.push('Heure invalide.');
  return errors;
}

// POST /api/reservations  — Créer une réservation
router.post('/', optionalAuth, async (req, res) => {
  const errors = validateReservation(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors[0], details: errors });

  const { name, phone, email, people, date, time, special_requests } = req.body;
  const user_id = req.user?.id || null;
  const info = db.prepare(
    'INSERT INTO reservations (user_id, name, phone, email, people, date, time, special_requests) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(user_id, name.trim(), phone.trim(), email?.trim() || null, Number(people), date, time, special_requests?.trim() || null);

  const reservation = db.prepare('SELECT * FROM reservations WHERE id = ?').get(info.lastInsertRowid);
  const settings = getSettings();
  await sendConfirmationEmail(reservation, settings);

  res.status(201).json(reservation);
});

// GET /api/reservations/mine  — Réservations du client connecté
router.get('/mine', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM reservations WHERE user_id = ? ORDER BY date DESC, time DESC').all(req.user.id);
  res.json(rows);
});

// PUT /api/reservations/:id/cancel  — Annuler sa réservation (client)
router.put('/:id/cancel', requireAuth, (req, res) => {
  const resv = db.prepare('SELECT * FROM reservations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!resv) return res.status(404).json({ error: 'Réservation introuvable' });
  if (resv.status === 'completed') return res.status(400).json({ error: 'Une réservation terminée ne peut plus être annulée.' });
  if (resv.status === 'cancelled') return res.status(400).json({ error: 'Réservation déjà annulée.' });
  db.prepare('UPDATE reservations SET status = \'cancelled\' WHERE id = ?').run(resv.id);
  res.json(db.prepare('SELECT * FROM reservations WHERE id = ?').get(resv.id));
});

// PUT /api/reservations/:id  — Modifier sa réservation (client)
router.put('/:id', requireAuth, (req, res) => {
  const resv = db.prepare('SELECT * FROM reservations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!resv) return res.status(404).json({ error: 'Réservation introuvable' });
  if (resv.status !== 'pending') return res.status(400).json({ error: 'Seules les réservations en attente peuvent être modifiées.' });
  const { people, date, time, special_requests } = req.body;
  const updated = {
    people: people !== undefined ? Number(people) : resv.people,
    date: date !== undefined ? date : resv.date,
    time: time !== undefined ? time : resv.time,
  };
  const errs = validateReservation({ name: resv.name, phone: resv.phone, ...updated });
  if (errs.length) return res.status(400).json({ error: errs[0], details: errs });
  db.prepare('UPDATE reservations SET people = ?, date = ?, time = ?, special_requests = ? WHERE id = ?')
    .run(updated.people, updated.date, updated.time, special_requests !== undefined ? special_requests : resv.special_requests, resv.id);
  res.json(db.prepare('SELECT * FROM reservations WHERE id = ?').get(resv.id));
});

// ---------------------------------------------------------------
// Routes admin
// ---------------------------------------------------------------

// GET /api/reservations  — Toutes les réservations (admin, filtres possibles)
router.get('/', requireAdmin, (req, res) => {
  const { status, date } = req.query;
  let sql = 'SELECT * FROM reservations WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (date) { sql += ' AND date = ?'; params.push(date); }
  sql += ' ORDER BY date DESC, time DESC';
  res.json(db.prepare(sql).all(...params));
});

// PUT /api/reservations/:id/status  — Changer le statut (admin)
router.put('/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  const allowed = ['pending', 'confirmed', 'refused', 'completed', 'cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Statut invalide.' });
  const resv = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id);
  if (!resv) return res.status(404).json({ error: 'Réservation introuvable' });
  db.prepare('UPDATE reservations SET status = ? WHERE id = ?').run(status, resv.id);
  res.json(db.prepare('SELECT * FROM reservations WHERE id = ?').get(resv.id));
});

// DELETE /api/reservations/:id  — Supprimer (admin)
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM reservations WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

module.exports = router;
