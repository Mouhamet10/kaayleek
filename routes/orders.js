// routes/orders.js
// Commandes en ligne : création (public/client), suivi (client), gestion (admin).

const express = require('express');
const { db } = require('../db/database');
const { requireAuth, requireAdmin, JWT_SECRET } = require('../server/middleware/auth');
const jwt = require('jsonwebtoken');

const router = express.Router();

// Middleware d'authentification OPTIONNELLE : rattache la commande au compte client
// si un token valide est fourni, sans bloquer les visiteurs non connectés.
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


// Frais de livraison (tarif fixe, modifiable ici).
const DELIVERY_FEE = 1500;

// Validation serveur d'une commande.
function validateOrder(body) {
  const errors = [];
  if (!body.customer_name || body.customer_name.trim().length < 2) errors.push('Votre nom est requis.');
  if (!body.phone || body.phone.trim().length < 8) errors.push('Numéro de téléphone invalide.');
  if (!['delivery', 'pickup'].includes(body.type)) errors.push('Type de commande invalide.');
  if (body.type === 'delivery' && (!body.address || body.address.trim().length < 5)) errors.push('Adresse de livraison requise.');
  if (!['cash', 'mobile_money'].includes(body.payment)) errors.push('Mode de paiement invalide.');
  if (body.payment === 'mobile_money' && (!body.mobile_money || body.mobile_money.trim().length < 8)) errors.push('Numéro Mobile Money requis.');
  if (!Array.isArray(body.items) || body.items.length === 0) errors.push('Votre panier est vide.');
  return errors;
}

// POST /api/orders  — Créer une commande
router.post('/', optionalAuth, (req, res) => {
  const errors = validateOrder(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors[0], details: errors });

  const b = req.body;
  const user_id = req.user?.id || null;

  // Recalcule les prix depuis la base (ne fait jamais confiance au client).
  let subtotal = 0;
  const items = [];
  const stmt = db.prepare('SELECT id, name, price FROM dishes WHERE id = ? AND available = 1');
  for (const it of b.items) {
    const dish = stmt.get(it.dish_id);
    if (!dish) continue;
    const qty = Math.max(1, Math.min(50, parseInt(it.qty, 10) || 1));
    const lineTotal = Math.round(dish.price * qty);
    subtotal += lineTotal;
    items.push({ dish_id: dish.id, name: dish.name, price: dish.price, qty, line_total: lineTotal });
  }
  if (items.length === 0) return res.status(400).json({ error: 'Aucun plat valide dans votre commande.' });

  const delivery_fee = b.type === 'delivery' ? DELIVERY_FEE : 0;
  const total = subtotal + delivery_fee;

  const info = db.prepare(
    `INSERT INTO orders
      (user_id, customer_name, phone, email, type, address, payment, mobile_money, items, subtotal, delivery_fee, total, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    user_id,
    b.customer_name.trim(),
    b.phone.trim(),
    b.email?.trim() || null,
    b.type,
    b.address?.trim() || null,
    b.payment,
    b.mobile_money?.trim() || null,
    JSON.stringify(items),
    subtotal,
    delivery_fee,
    total,
    b.note?.trim() || null
  );

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(order);
});

// GET /api/orders/mine  — Commandes du client connecté
router.get('/mine', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(rows.map(parseOrder));
});

// ---------------------------------------------------------------
// Routes admin
// ---------------------------------------------------------------

// GET /api/orders  — Toutes les commandes (admin, filtre par statut)
router.get('/', requireAdmin, (req, res) => {
  const { status } = req.query;
  let sql = 'SELECT * FROM orders';
  const params = [];
  if (status) { sql += ' WHERE status = ?'; params.push(status); }
  sql += ' ORDER BY created_at DESC';
  res.json(db.prepare(sql).all(...params).map(parseOrder));
});

// PUT /api/orders/:id/status  — Changer le statut (admin)
router.put('/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  const allowed = ['pending', 'confirmed', 'preparing', 'delivered', 'completed', 'cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Statut invalide.' });
  const order = db.prepare('SELECT id FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable.' });
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, order.id);
  res.json(parseOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id)));
});

// DELETE /api/orders/:id  — Supprimer (admin)
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Parse le champ items (JSON) pour la réponse.
function parseOrder(o) {
  try { o.items = JSON.parse(o.items); } catch { o.items = []; }
  return o;
}

module.exports = router;
