// routes/reviews.js
// Avis clients : publication (client connecté), modération (admin).

const express = require('express');
const { db } = require('../db/database');
const { requireAuth, requireAdmin } = require('../server/middleware/auth');

const router = express.Router();

// GET /api/reviews  — Avis approuvés (public), avec filtre/tri
router.get('/', (req, res) => {
  const { dish_id, sort } = req.query;
  let sql = `SELECT r.*, u.firstname, u.lastname, d.name AS dish_name
             FROM reviews r
             JOIN users u ON u.id = r.user_id
             JOIN dishes d ON d.id = r.dish_id
             WHERE r.status = 'approved'`;
  const params = [];
  if (dish_id) { sql += ' AND r.dish_id = ?'; params.push(dish_id); }
  if (sort === 'rating_asc') sql += ' ORDER BY r.rating ASC, r.created_at DESC';
  else if (sort === 'rating_desc') sql += ' ORDER BY r.rating DESC, r.created_at DESC';
  else if (sort === 'oldest') sql += ' ORDER BY r.created_at ASC';
  else sql += ' ORDER BY r.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

// POST /api/reviews  — Laisser un avis (client connecté, une seule note par plat)
router.post('/', requireAuth, (req, res) => {
  const { dish_id, rating, comment } = req.body;
  if (!dish_id) return res.status(400).json({ error: 'Plat requis.' });
  const dish = db.prepare('SELECT id FROM dishes WHERE id = ?').get(dish_id);
  if (!dish) return res.status(404).json({ error: 'Plat introuvable.' });
  const r = Number(rating);
  if (!r || r < 1 || r > 5) return res.status(400).json({ error: 'La note doit être comprise entre 1 et 5.' });
  if (!comment || comment.trim().length < 5) return res.status(400).json({ error: 'Veuillez écrire un commentaire (au moins 5 caractères).' });

  const existing = db.prepare('SELECT id FROM reviews WHERE user_id = ? AND dish_id = ?').get(req.user.id, dish_id);
  if (existing) {
    return res.status(409).json({ error: 'Vous avez déjà donné votre avis sur ce plat. Vous pouvez le modifier depuis votre espace.' });
  }

  db.prepare('INSERT INTO reviews (user_id, dish_id, rating, comment) VALUES (?, ?, ?, ?)')
    .run(req.user.id, dish_id, r, comment.trim());
  res.status(201).json({ ok: true, message: 'Merci ! Votre avis sera publié après modération.', rating: r });
});

// GET /api/reviews/mine  — Mes avis (client connecté)
router.get('/mine', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, d.name AS dish_name, d.image AS dish_image
    FROM reviews r JOIN dishes d ON d.id = r.dish_id
    WHERE r.user_id = ? ORDER BY r.created_at DESC`
  ).all(req.user.id);
  res.json(rows);
});

// PUT /api/reviews/mine/:id  — Modifier son avis (client connecté)
router.put('/mine/:id', requireAuth, (req, res) => {
  const rev = db.prepare('SELECT * FROM reviews WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!rev) return res.status(404).json({ error: 'Avis introuvable.' });
  const { rating, comment } = req.body;
  const r = Number(rating);
  if (!r || r < 1 || r > 5) return res.status(400).json({ error: 'Note invalide.' });
  if (!comment || comment.trim().length < 5) return res.status(400).json({ error: 'Commentaire trop court.' });
  db.prepare('UPDATE reviews SET rating = ?, comment = ?, status = \'pending\' WHERE id = ?').run(r, comment.trim(), rev.id);
  res.json({ ok: true, message: 'Avis modifié. Il sera de nouveau modéré.' });
});

// DELETE /api/reviews/mine/:id  — Supprimer son avis (client connecté)
router.delete('/mine/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM reviews WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------
// Modération (admin)
// ---------------------------------------------------------------

// GET /api/reviews/all  — Tous les avis avec tous statuts (admin)
router.get('/all', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, u.firstname, u.lastname, u.email, d.name AS dish_name
    FROM reviews r
    JOIN users u ON u.id = r.user_id
    JOIN dishes d ON d.id = r.dish_id
    ORDER BY r.created_at DESC`).all();
  res.json(rows);
});

// PUT /api/reviews/:id/status  — Approuver / masquer (admin)
router.put('/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  if (!['pending', 'approved', 'hidden'].includes(status)) return res.status(400).json({ error: 'Statut invalide.' });
  const rev = db.prepare('SELECT id FROM reviews WHERE id = ?').get(req.params.id);
  if (!rev) return res.status(404).json({ error: 'Avis introuvable.' });
  db.prepare('UPDATE reviews SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true });
});

// DELETE /api/reviews/:id  — Supprimer (admin)
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM reviews WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
