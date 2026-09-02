// server/middleware/auth.js
// Middlewares de protection des routes.

const jwt = require('jsonwebtoken');
const { db } = require('../../db/database');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET manquant. Définissez la variable d\'environnement JWT_SECRET.');
  process.exit(1);
}

// Vérifie qu'un token d'utilisateur valide est présent.
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentification requise' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, firstname, lastname, email, role, active FROM users WHERE id = ?').get(decoded.id);
    if (!user || !user.active) return res.status(401).json({ error: 'Compte invalide ou désactivé' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expirée ou invalide' });
  }
}

// Vérifie que l'utilisateur est admin.
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès réservé à l\'administration' });
    next();
  });
}

module.exports = { requireAuth, requireAdmin, JWT_SECRET };
