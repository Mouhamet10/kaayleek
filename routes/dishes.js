// routes/dishes.js
// Routes publiques et admin pour le menu.

const express = require('express');
const { db } = require('../db/database');
const { requireAuth, requireAdmin } = require('../server/middleware/auth');

const router = express.Router();

// Helper : récupère un plat avec sa note moyenne et le nombre d'avis approuvés.
function getDishWithRating(dish) {
  const stats = db.prepare(
    'SELECT AVG(rating) AS avg, COUNT(*) AS count FROM reviews WHERE dish_id = ? AND status = \'approved\''
  ).get(dish.id);
  return { ...dish, rating: stats.avg ? Math.round(stats.avg * 100) / 100 : null, ratingCount: stats.count };
}

// GET /api/dishes  — Menu public (avec notes)
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM dishes WHERE available = 1 ORDER BY category, name').all();
  res.json(rows.map(getDishWithRating));
});

// GET /api/dishes/all  — Tous les plats, y compris indisponibles (admin)
router.get('/all', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM dishes ORDER BY category, name').all();
  res.json(rows.map(getDishWithRating));
});

// GET /api/dishes/:id  — Détail d'un plat + avis approuvés
router.get('/:id', (req, res) => {
  const dish = db.prepare('SELECT * FROM dishes WHERE id = ? AND available = 1').get(req.params.id);
  if (!dish) return res.status(404).json({ error: 'Plat introuvable' });
  const reviews = db.prepare(
    `SELECT r.*, u.firstname, u.lastname FROM reviews r
     JOIN users u ON u.id = r.user_id
     WHERE r.dish_id = ? AND r.status = 'approved'
     ORDER BY r.created_at DESC`
  ).all(dish.id);
  res.json({ ...getDishWithRating(dish), reviews });
});

// POST /api/dishes  — Ajouter un plat (admin)
router.post('/', requireAdmin, (req, res) => {
  const { name, category, price, description, image, available } = req.body;
  if (!name || !String(name).trim() || !category || !String(category).trim()) return res.status(400).json({ error: 'Nom et catégorie sont requis.' });
  if (price == null || Number(price) < 0) return res.status(400).json({ error: 'Un prix valide est requis.' });
  const info = db.prepare(
    'INSERT INTO dishes (name, category, price, description, image, available) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(String(name).trim(), String(category).trim(), Number(price), description || null, image || null, available != null ? (available ? 1 : 0) : 1);
  res.status(201).json(db.prepare('SELECT * FROM dishes WHERE id = ?').get(info.lastInsertRowid));
});

// PUT /api/dishes/:id  — Modifier un plat (admin)
router.put('/:id', requireAdmin, (req, res) => {
  const dish = db.prepare('SELECT * FROM dishes WHERE id = ?').get(req.params.id);
  if (!dish) return res.status(404).json({ error: 'Plat introuvable' });
  const { name, category, price, description, image, available } = req.body;
  db.prepare('UPDATE dishes SET name = ?, category = ?, price = ?, description = ?, image = ?, available = ? WHERE id = ?')
    .run(name ?? dish.name, category ?? dish.category, price != null ? Number(price) : dish.price, description !== undefined ? description : dish.description, image !== undefined ? image : dish.image, available != null ? (available ? 1 : 0) : dish.available, dish.id);
  res.json(db.prepare('SELECT * FROM dishes WHERE id = ?').get(dish.id));
});

// DELETE /api/dishes/:id  — Supprimer un plat (admin)
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM dishes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
