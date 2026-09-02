// routes/upload.js
// Upload d'images (admin) : enregistre un fichier dans public/uploads et
// renvoie son URL publique /uploads/<fichier>.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { requireAdmin } = require('../server/middleware/auth');

const router = express.Router();

// Dossier de destination (public/uploads), créé s'il n'existe pas.
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Types MIME autorisés pour les images.
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase().replace(/[^.\w]/g, '');
    const name = crypto.randomBytes(8).toString('hex') + ext;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3 Mo max
  fileFilter: (req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Seules les images JPG, PNG, WEBP ou GIF sont acceptées.'));
  },
});

// POST /api/upload  — Enregistre une image (admin) et renvoie son URL.
router.post('/', requireAdmin, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Image trop lourde (max 3 Mo).' : (err.message || 'Upload échoué.');
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
  });
});

module.exports = router;
