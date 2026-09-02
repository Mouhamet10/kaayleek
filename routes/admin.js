// routes/admin.js
// Administration : utilisateurs, paramètres du site, galerie, statistiques, avis.

const express = require('express');
const { db } = require('../db/database');
const { requireAdmin } = require('../server/middleware/auth');

const router = express.Router();

router.use(requireAdmin);

// GET /api/admin/stats  — Vue d'ensemble du dashboard
router.get('/stats', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const stats = {
    reservationsToday: db.prepare("SELECT COUNT(*) AS c FROM reservations WHERE date = ? AND status != 'cancelled'").get(today).c,
    reservationsPending: db.prepare("SELECT COUNT(*) AS c FROM reservations WHERE status = 'pending'").get().c,
    reservationsTotal: db.prepare("SELECT COUNT(*) AS c FROM reservations").get().c,
    todayReservations: db.prepare("SELECT COUNT(*) AS c FROM reservations WHERE date = ? AND status != 'cancelled'").get(today).c,
    ordersTotal: db.prepare("SELECT COUNT(*) AS c FROM orders").get().c,
    ordersPending: db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'pending'").get().c,
    ordersToday: db.prepare("SELECT COUNT(*) AS c FROM orders WHERE date(created_at) = ? AND status != 'cancelled'").get(today).c,
    menuCount: db.prepare("SELECT COUNT(*) AS c FROM dishes").get().c,
    dishesAvailable: db.prepare("SELECT COUNT(*) AS c FROM dishes WHERE available = 1").get().c,
    galleryCount: db.prepare("SELECT COUNT(*) AS c FROM gallery").get().c,
    reviewsTotal: db.prepare("SELECT COUNT(*) AS c FROM reviews").get().c,
    reviewsPending: db.prepare("SELECT COUNT(*) AS c FROM reviews WHERE status = 'pending'").get().c,
    reviewsApproved: db.prepare("SELECT COUNT(*) AS c FROM reviews WHERE status = 'approved'").get().c,
    usersTotal: db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'user'").get().c,
    dishesTotal: db.prepare("SELECT COUNT(*) AS c FROM dishes WHERE available = 1").get().c,
    avgRating: db.prepare("SELECT AVG(rating) AS a FROM reviews WHERE status = 'approved'").get().a,
    hourly: db.prepare("SELECT time, COUNT(*) AS c FROM reservations WHERE date = ? AND status != 'cancelled' GROUP BY time ORDER BY time").all(today),
  };
  res.json(stats);
});

// GET /api/admin/users  — Liste des utilisateurs
router.get('/users', (req, res) => {
  res.json(db.prepare("SELECT id, firstname, lastname, email, phone, role, active, created_at FROM users ORDER BY created_at DESC").all());
});

// PUT /api/admin/users/:id/status  — Activer / désactiver un utilisateur
router.put('/users/:id/status', (req, res) => {
  const { active } = req.body;
  if (active != null && ![0, 1, true, false].includes(active)) return res.status(400).json({ error: 'Valeur invalide.' });
  const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  if (target.role === 'admin' && !active) return res.status(400).json({ error: 'Impossible de désactiver un compte administrateur.' });
  if (target.id === req.user.id && !active) return res.status(400).json({ error: 'Impossible de désactiver votre propre compte.' });
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

// GET /api/admin/settings  — Lire tous les paramètres du site
router.get('/settings', (req, res) => {
  res.json(Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map(r => [r.key, r.value])));
});

// PUT /api/admin/settings  — Mettre à jour les paramètres (bulk)
router.put('/settings', (req, res) => {
  const updates = req.body || {};
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const tx = db.transaction((entries) => { for (const [k, v] of entries) stmt.run(k, String(v ?? '')); });
  tx(Object.entries(updates));
  res.json({ ok: true });
});

// GET /api/admin/gallery  — Photos de la galerie
router.get('/gallery', (req, res) => {
  res.json(db.prepare('SELECT * FROM gallery ORDER BY id').all());
});

// POST /api/admin/gallery  — Ajouter une photo
router.post('/gallery', (req, res) => {
  const { image, caption, tag } = req.body;
  if (!image) return res.status(400).json({ error: 'URL d\'image requise.' });
  const info = db.prepare('INSERT INTO gallery (image, caption, tag) VALUES (?, ?, ?)').run(image, caption || null, tag || null);
  res.status(201).json(db.prepare('SELECT * FROM gallery WHERE id = ?').get(info.lastInsertRowid));
});

// DELETE /api/admin/gallery/:id  — Supprimer une photo
router.delete('/gallery/:id', (req, res) => {
  db.prepare('DELETE FROM gallery WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
