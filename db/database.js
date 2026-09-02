// db/database.js
// Connexion à la base de données SQLite et définition du schéma.

const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'resto.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------------------------------------------------------------
// Schéma de la base de données
// ---------------------------------------------------------------

db.exec(`
  -- Utilisateurs (clients)
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    firstname     TEXT NOT NULL,
    lastname      TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password      TEXT NOT NULL,
    phone         TEXT,
    address       TEXT,
    role          TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'admin'
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Menu / plats
  CREATE TABLE IF NOT EXISTS dishes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    category      TEXT NOT NULL,                  -- entree | plat | dessert | boisson
    price         REAL NOT NULL,
    description   TEXT,
    image         TEXT,
    available     INTEGER NOT NULL DEFAULT 1,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Réservations
  CREATE TABLE IF NOT EXISTS reservations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER,
    name          TEXT NOT NULL,
    phone         TEXT NOT NULL,
    email         TEXT,
    people        INTEGER NOT NULL,
    date          TEXT NOT NULL,
    time          TEXT NOT NULL,
    special_requests TEXT,
    status        TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | refused | completed | cancelled
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  -- Commandes en ligne
  CREATE TABLE IF NOT EXISTS orders (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER,
    customer_name TEXT NOT NULL,
    phone         TEXT NOT NULL,
    email         TEXT,
    type          TEXT NOT NULL DEFAULT 'delivery', -- delivery | pickup
    address       TEXT,
    payment       TEXT NOT NULL DEFAULT 'cash',     -- cash | mobile_money
    mobile_money  TEXT,
    items         TEXT NOT NULL,                    -- JSON [{dish_id,name,price,qty}]
    subtotal      REAL NOT NULL DEFAULT 0,
    delivery_fee  REAL NOT NULL DEFAULT 0,
    total         REAL NOT NULL DEFAULT 0,
    note          TEXT,
    status        TEXT NOT NULL DEFAULT 'pending',  -- pending | confirmed | preparing | delivered | completed | cancelled
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  -- Avis sur les plats
  CREATE TABLE IF NOT EXISTS reviews (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL,
    dish_id       INTEGER NOT NULL,
    rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment       TEXT,
    status        TEXT NOT NULL DEFAULT 'pending', -- pending | approved | hidden
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (dish_id) REFERENCES dishes(id) ON DELETE CASCADE,
    UNIQUE (user_id, dish_id)
  );

  -- Paramètres du site (horaires, contact, réseaux sociaux)
  CREATE TABLE IF NOT EXISTS settings (
    key           TEXT PRIMARY KEY,
    value         TEXT
  );

  -- Galerie photos
  CREATE TABLE IF NOT EXISTS gallery (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    image         TEXT NOT NULL,
    caption       TEXT,
    tag           TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ---------------------------------------------------------------
// Données par défaut (paramètres du site)
// ---------------------------------------------------------------
const defaults = {
  'site.name': 'KaayLeek Le Restaurant',
  'site.slogan': 'L\'art de la table, sublimé',
  'site.address': 'Dakar',
  'site.city': 'SENEGAL',
  'site.phone': '+221 76 29 67 919',
  'site.email': 'contact@kaayleek-resto.com',
  'hours.lundi': '12:00 - 23:00',
  'hours.mardi': '12:00 - 23:00',
  'hours.mercredi': '12:00 - 23:00',
  'hours.jeudi': '12:00 - 23:00',
  'hours.vendredi': '12:00 - 23:30',
  'hours.samedi': '12:00 - 23:30',
  'hours.dimanche': 'Fermé',
  'social.facebook': 'https://facebook.com/kaayleek',
  'social.instagram': 'https://instagram.com/kaayleek',
  'social.twitter': 'https://twitter.com/kaayleek',
  'map.embed': 'https://www.google.com/maps/embed?pb='
};

// Correction one-time des anciennes valeurs (ne touche jamais aux valeurs
// modifiées par l'administrateur via le panneau de réglages).
const migrateSettings = [
  { key: 'site.address', old: 'Avenue du Président Lamine Guèye, Plateau', neu: 'Dakar' },
  { key: 'site.address', old: 'Dakar, SENEGAL', neu: 'Dakar' },
  { key: 'site.city', old: 'Dakar, Sénégal', neu: 'SENEGAL' },
  { key: 'site.city', old: 'Dakar, SENEGAL', neu: 'SENEGAL' },
  { key: 'site.phone', old: '+221 76 296 79 19', neu: '+221 76 29 67 919' },
  { key: 'site.phone', old: '762967919', neu: '+221 76 29 67 919' },
];
const migrateStmt = db.prepare('UPDATE settings SET value = ? WHERE key = ? AND value = ?');
for (const m of migrateSettings) migrateStmt.run(m.neu, m.key, m.old);

// Les défauts ne s'appliquent que si la clé est absente (première initialisation).
// Les modifications faites depuis le panneau admin sont ainsi préservées.
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(defaults)) {
  insertSetting.run(k, v);
}

// ---------------------------------------------------------------
// Photos par défaut de la galerie (insérées uniquement si absentes)
// ---------------------------------------------------------------
const galleryDefaults = [
  { image: '/images/menu/thieboudieune.jpg',    caption: 'Thiéboudiène royal',        tag: 'plat' },
  { image: '/images/menu/yaasa poulet.jpg',     caption: 'Yaasa au poulet',           tag: 'plat' },
  { image: '/images/menu/mafe.jpg',             caption: 'Mafé de bœuf',              tag: 'plat' },
  { image: '/images/menu/dibi.jpg',             caption: 'Dibi d\'agneau',            tag: 'plat' },
  { image: '/images/menu/soupou kandia.jpg',    caption: 'Soupou kandia',             tag: 'plat' },
  { image: '/images/menu/grille-braise.jpg',    caption: 'Grillade-braise',           tag: 'plat' },
  { image: '/images/menu/steak avec frite.jpg', caption: 'Steak frites maison',       tag: 'plat' },
  { image: '/images/menu/tacos.jpg',            caption: 'Tacos maison',              tag: 'plat' },
  { image: '/images/menu/riz-au-poulet.jpg',    caption: 'Riz au poulet',             tag: 'plat' },
  { image: '/images/menu/fondant-au-chocolat.jpg', caption: 'Fondant au chocolat',    tag: 'dessert' },
  { image: '/images/menu/tiramisu.jpg',         caption: 'Tiramisu maison',           tag: 'dessert' },
  { image: '/images/menu/glace triple chocolat.jpg', caption: 'Glace triple chocolat', tag: 'dessert' },
  { image: '/images/menu/lotusbiscoff.jpg',     caption: 'Douceur Lotus Biscoff',     tag: 'dessert' },
  { image: '/images/menu/crepe sucree.jpg',     caption: 'Crêpe sucrée',              tag: 'dessert' },
  { image: '/images/menu/cocktail.jpg',         caption: 'Cocktail maison',           tag: 'boisson' },
  { image: '/images/menu/jus bissap.jpg',       caption: 'Jus de bissap',             tag: 'boisson' },
  { image: '/images/menu/jus bouye.jpg',        caption: 'Jus de bouye',              tag: 'boisson' },
  { image: '/images/menu/jus-passion.jpg',      caption: 'Jus de fruit de la passion', tag: 'boisson' },
  { image: '/images/menu/smoothie-fraise.jpg',  caption: 'Smoothie fraise',           tag: 'boisson' },
  { image: '/images/team/chef-executif.jpg',    caption: 'Chef exécutif Mamadou Sarr', tag: 'chef' },
  { image: '/images/team/chef-principal.jpg',   caption: 'Amadou Diallo — Chef Principal', tag: 'chef' },
  { image: '/images/team/sous-chef.jpg',        caption: 'Marie Lefèvre — Sous-Chef', tag: 'chef' },
  { image: '/images/team/maitre-hotel.jpg',     caption: 'Ousmane Fall — Maître d\'hôtel', tag: 'chef' },
];

const galleryExists = db.prepare('SELECT 1 FROM gallery WHERE image = ?');
const insertGallery = db.prepare('INSERT INTO gallery (image, caption, tag) VALUES (?, ?, ?)');
for (const g of galleryDefaults) {
  if (!galleryExists.get(g.image)) insertGallery.run(g.image, g.caption, g.tag);
}

module.exports = { db };
