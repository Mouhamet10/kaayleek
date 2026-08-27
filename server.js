const express = require('express');
const { createClient } = require('@libsql/client');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const TURSO_URL = process.env.TURSO_URL || process.env.LIBSQL_URL || '';
const TURSO_TOKEN = process.env.TURSO_TOKEN || process.env.LIBSQL_AUTH_TOKEN || '';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'kaayleek.db');
const isProduction = process.env.NODE_ENV === 'production';

// Security headers
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
}));

// Rate limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Trop de requêtes, réessayez plus tard.' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Trop de tentatives de connexion.' }
});

const contactLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: { error: 'Trop de messages envoyés.' }
});

app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

// Upload config
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Seules les images sont acceptées'));
    }
});

// ========== DB HELPERS ==========
let db;
let saveTimeout = null;
let useRemote = false;

function _rowsToObjects(result) {
    return (result.rows || []).map(r => r.toJSON ? r.toJSON() : r);
}

function scheduleSave() {
    if (useRemote) return;
    if (saveTimeout) return;
    saveTimeout = setTimeout(() => {
        saveDb();
        saveTimeout = null;
    }, 100);
}

function saveDb() {
    if (useRemote) return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

async function dbAll(sql, params = []) {
    if (useRemote) {
        const res = await db.execute({ sql, args: params.map(p => p === undefined ? null : p) });
        return _rowsToObjects(res);
    }
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
}

async function dbGet(sql, params = []) {
    if (useRemote) {
        const res = await db.execute({ sql, args: params.map(p => p === undefined ? null : p) });
        const rows = _rowsToObjects(res);
        return rows[0] || null;
    }
    const stmt = db.prepare(sql);
    stmt.bind(params);
    let row = null;
    if (stmt.step()) row = stmt.getAsObject();
    stmt.free();
    return row;
}

async function dbRun(sql, params = []) {
    if (useRemote) {
        const res = await db.execute({ sql, args: params.map(p => p === undefined ? null : p) });
        return { lastInsertRowid: Number(res.lastInsertRowid) || 0, changes: res.rowsAffected || 0 };
    }
    const safeParams = params.map(p => p === undefined ? null : p);
    db.run(sql, safeParams);
    const changes = db.getRowsModified();
    const rowId = db.exec("SELECT last_insert_rowid() as id");
    scheduleSave();
    return { lastInsertRowid: rowId[0]?.values[0][0] || 0, changes };
}

async function dbExec(sql) {
    if (useRemote) {
        await db.execute({ sql });
        return;
    }
    db.exec(sql);
    scheduleSave();
}

// ========== VALIDATION HELPERS ==========
function sanitize(str) {
    if (typeof str !== 'string') return '';
    return str.trim().replace(/[<>]/g, '');
}

function validateEmail(email) {
    if (!email) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone) {
    if (!phone) return false;
    return /^[\d\s+\-()]{7,20}$/.test(phone);
}

function requireFields(body, fields) {
    const missing = fields.filter(f => !body[f] || (typeof body[f] === 'string' && !body[f].trim()));
    if (missing.length > 0) {
        return `Champs requis manquants: ${missing.join(', ')}`;
    }
    return null;
}

// ========== AUTH MIDDLEWARE ==========
function auth(req, res, next) {
    const token = req.cookies.token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Non autorisé' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Token invalide' });
    }
}

// ========== INIT ==========
async function start() {
    if (TURSO_URL) {
        useRemote = true;
        db = createClient({
            url: TURSO_URL,
            authToken: TURSO_TOKEN || undefined,
        });
        console.log('🗄️  Utilisation de la base de données cloud (Turso/libSQL)');
    } else {
        useRemote = false;
        const initSqlJs = require('sql.js');
        const SQL = await initSqlJs();
        if (fs.existsSync(DB_PATH)) {
            const buf = fs.readFileSync(DB_PATH);
            db = new SQL.Database(buf);
        } else {
            db = new SQL.Database();
        }
        console.log(`🗄️  Utilisation de la base SQLite locale: ${DB_PATH}`);
    }

    await dbExec(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await dbExec(`CREATE TABLE IF NOT EXISTS menu_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        price INTEGER NOT NULL,
        category TEXT NOT NULL,
        type TEXT NOT NULL,
        image TEXT,
        available INTEGER DEFAULT 1,
        allergens TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await dbExec(`CREATE TABLE IF NOT EXISTS reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        guests INTEGER NOT NULL,
        occasion TEXT,
        area TEXT,
        notes TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await dbExec(`CREATE TABLE IF NOT EXISTS gallery (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        image TEXT NOT NULL,
        category TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await dbExec(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_email TEXT,
        items TEXT NOT NULL,
        total INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await dbExec(`CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        subject TEXT,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await dbExec(`CREATE TABLE IF NOT EXISTS newsletter (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    if (!useRemote) saveDb();

    // Migration: add allergens column if missing
    try { await dbRun('ALTER TABLE menu_items ADD COLUMN allergens TEXT DEFAULT \'\''); } catch {}

    // Seed admin
    const admin = await dbGet('SELECT id FROM users WHERE username = ?', [ADMIN_USER]);
    if (!admin) {
        const hash = bcrypt.hashSync(ADMIN_PASS, 10);
        await dbRun('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [ADMIN_USER, hash, 'admin']);
    }

    // Seed menu
    const menuCount = await dbGet('SELECT COUNT(*) as count FROM menu_items');
    if (menuCount.count === 0) {
        const menuData = [
            ['Tartare de Thiof', 'Thiof frais coupé en dés, avocat, mangue verte, huile d\'arachide grillée', 4500, 'entrees', 'fusion', 'images/plats/salade.jpg', 'Poisson'],
            ['Bruschetta Tomates', 'Pain grillé, tomates concassées, basilic frais, huile d\'olive, mozzarella di bufala', 3500, 'entrees', 'occidental', 'images/plats/Bruschetta-Tomates.jpg', 'Gluten, Lait'],
            ['Yassa de Poulet', 'Poulet mariné citronné, oignons caramélisés, moutarde de Dijon', 3800, 'entrees', 'senegalais', 'images/plats/yassa-poulet.jpg', 'Moutarde'],
            ['Salade KaayLeek', 'Salade verte, mangue, noix de cajou grillées, vinaigrette au tamarind', 3200, 'entrees', 'fusion', 'images/plats/salade.jpg', 'Fruits à coque'],
            ['Fataye', 'Beignets farcis au poisson et oignons, sauce tomate pimentée', 2500, 'entrees', 'senegalais', 'images/plats/fataye.jpg', 'Gluten, Poisson'],
            ['Akara', 'Beignets de haricots blancs, épicés, accompagnés de sauce tomate', 2000, 'entrees', 'senegalais', 'images/plats/akara.jpg', ''],
            ['Nems au Poulet', 'Rouleaux de printemps croustillants, poulet, légumes, sauce aigre-douce', 3000, 'entrees', 'occidental', 'images/plats/nems.jpg', 'Gluten, Soja'],
            ['Domada Boulettes', 'Boulettes de poisson en sauce d\'arachide, servi avec du riz', 4200, 'entrees', 'senegalais', 'images/plats/Domada-boulette.jpg', 'Arachide, Poisson'],
            ['Filet de Boeuf Rossini', 'Filet de boeuf, foie gras poêlé, sauce au poivre, pommes dauphine', 12500, 'plats-occidentaux', 'occidental', 'images/plats/Filet-de-Boeuf-Rossini.jpg', 'Lait, Gluten'],
            ['Saumon en Croûte', 'Saumon frais, feuilletage doré, épinards, sauce bisque de crevettes', 9800, 'plats-occidentaux', 'occidental', 'images/plats/Saumon-en-Croute.jpg', 'Poisson, Gluten, Crustacés'],
            ['Risotto aux Crevettes', 'Riz carnaroli crémeux, crevettes royales, parmesan, safran', 7500, 'plats-occidentaux', 'occidental', 'images/plats/Risotto-aux-Crevettes.jpg', 'Crustacés, Lait'],
            ['Magret de Canard', 'Magret rosé, sauce à la mangue, purée de patate douce, légumes glacés', 8500, 'plats-occidentaux', 'occidental', 'images/plats/Magret-de-Canard.jpg', ''],
            ['Steak Frites Maison', 'Entrecôte grillée, frites maison, sauce au poivre ou béarnaise', 8000, 'plats-occidentaux', 'occidental', 'images/plats/Steak-frites-maison-.jpg', 'Lait'],
            ['Surf and Turf', 'Côte de boeuf et crevettes grillées, sauce à l\'ail crémeuse', 14500, 'plats-occidentaux', 'occidental', 'images/plats/Surf-and-Turf-with-Creamy-Garlic-Sauce-delights-every-bite-.jpg', 'Crustacés, Lait'],
            ['Beef Lo Mein', 'Nouilles sautées au boeuf, légumes croquants, sauce soja', 6500, 'plats-occidentaux', 'occidental', 'images/plats/Beef-Lo-Mein-.jpg', 'Gluten, Soja, Œuf'],
            ['Lamb Shank', 'Épaule d\'agneau braisée, purée crémeuse, légumes rôtis', 11000, 'plats-occidentaux', 'occidental', 'images/plats/Lamb-Shank-with-Creamy-Mash-Potatoes.jpg', 'Lait'],
            ['Roulade de Veau', 'Veau roulé aux herbes fraiches, sauce au thym, légumes de saison', 9500, 'plats-occidentaux', 'occidental', 'images/plats/Roulade-de-Veau-Savoureuse-aux-Herbes-Fraiches.jpg', ''],
            ['Thiéboudienne Royale', 'Riz parfumé au tomate, poisson thiof farci, légumes traditionnels, tamarind', 5500, 'plats-senegalais', 'senegalais', 'images/plats/thieboudieune.jpg', 'Poisson'],
            ['Mafé Special', 'Boeuf fondant, sauce d\'arachide onctueuse, carottes, patates douces, riz blanc', 6200, 'plats-senegalais', 'senegalais', 'images/plats/mafe.jpg', 'Arachide'],
            ['Poulet Yassa Grandiose', 'Poulet fermier mariné, oignons grillés, citron confit, riz ognon', 5800, 'plats-senegalais', 'senegalais', 'images/plats/yassa-poulet.jpg', ''],
            ['Poisson Braisé', 'Thiof entier braisé au feu de bois, yassa de légumes, attiéké, sauce piment', 6500, 'plats-senegalais', 'senegalais', 'images/plats/Poisson-Braise.jpg', 'Poisson'],
            ['Thiou Boulettes', 'Boulettes de poisson en sauce tomate épicée, riz blanc', 5000, 'plats-senegalais', 'senegalais', 'images/plats/Thiou-boulettes.jpg', 'Poisson, Gluten'],
            ['Dibi', 'Agneau grillé mariné aux épices, oignons, moutarde', 7500, 'plats-senegalais', 'senegalais', 'images/plats/dibi.jpg', 'Moutarde'],
            ['Riz au Poulet', 'Riz parfumé au poulet braisé, légumes, sauceclair', 4500, 'plats-senegalais', 'senegalais', 'images/plats/riz-au-poulet.jpg', ''],
            ['Riz Cantonnais', 'Riz sauté aux légumes, crevettes, œuf, sauce soja', 4800, 'plats-senegalais', 'senegalais', 'images/plats/riz-cantone.jpg', 'Œuf, Crustacés, Soja, Gluten'],
            ['Poulet Miel Moutarde', 'Poulet rôti au miel et moutarde, légumes rôtis, purée', 6800, 'plats-occidentaux', 'fusion', 'images/plats/Poulet-Miel-Moutarde-Glace-avec-Legumes-Rotis.jpg', 'Moutarde, Lait'],
            ['Poulet Rôti Herbes', 'Poulet rôti aux herbes de Provence au four, pommes de terre', 6000, 'plats-occidentaux', 'occidental', 'images/plats/Poulet-roti-aux-herbes-de-Provence-au-four.jpg', ''],
            ['Mille-feuille Légumes', 'Feuilletage croustillant, légumes variés, viande hachée, sauce béchamel', 5500, 'plats-occidentaux', 'fusion', 'images/plats/Mille-feuille-de-legumes-et-viande-hachee-.jpg', 'Gluten, Lait'],
            ['Hamburger KaayLeek', 'Pain maison, steak boeuf, cheddar, bacon, salade, sauce maison', 5500, 'plats-occidentaux', 'occidental', 'images/plats/hamburger.jpg', 'Gluten, Lait'],
            ['Spaghetti Bolognaise', 'Pâtes fraîches, sauce tomate au boeuf, parmesan râpé', 5000, 'plats-occidentaux', 'occidental', 'images/plats/spaghetti.jpg', 'Gluten, Lait, Œuf'],
            ['Bimbimbap', 'Riz coréen, légumes sautés, œuf, piment gochujang', 5500, 'plats-occidentaux', 'fusion', 'images/plats/Bimbibap.jpg', 'Œuf, Soja'],
            ['Tacos KaayLeek', 'Tortilla maison, poulet épicé, guacamole, crème, cheddar, salade', 4500, 'plats-occidentaux', 'fusion', 'images/plats/tacos.jpg', 'Gluten, Lait'],
            ['Wrap Poulet Caesar', 'Tortilla, poulet grillé, croûtons, parmesan, sauce caesar', 4200, 'plats-occidentaux', 'fusion', 'images/plats/wrap.jpg', 'Gluten, Lait, Œuf, Poisson'],
            ['Délice au Baobab', 'Mousse au baobab, coulis de mangue, crumble d\'amande, feuille d\'or', 2800, 'desserts', 'fusion', 'images/plats/Tiramisu.jpg', 'Fruits à coque, Gluten'],
            ['Fondant au Chocolat', 'Chocolat noir 70%, coeur coulant, glace vanille de Madagascar', 3200, 'desserts', 'occidental', 'images/plats/fondant-au-chocolat.jpg', 'Lait, Gluten, Œuf'],
            ['Bissap Givré', 'Sorbet bissap, groseilles, menthe fraîche, sirop de baobab', 2500, 'desserts', 'senegalais', 'images/plats/bissap.jpg', ''],
            ['Firire', 'Beignets de farine de maïs dorés, servi avec du sucre', 2000, 'desserts', 'senegalais', 'images/plats/Firire.jpg', 'Gluten'],
            ['Norvégienne', 'Glace vanille, meringue italienne, coulis framboise', 3500, 'desserts', 'occidental', 'images/plats/norvegienne.jpg', 'Lait, Œuf'],
            ['Château Margaux 2018', 'Cru classé Bordeaux, arômes de fruits noirs et d\'épices fines', 35000, 'boissons', 'occidental', 'images/plats/chateau-margeaux.jpg', ''],
            ['Bouye Maison', 'Jus de baobab frais, lait, vanille, cannelle, servi bien frais', 1500, 'boissons', 'senegalais', 'images/plats/jus-bouye.jpg', 'Lait'],
            ['Cocktail KaayLeek', 'Rhum, jus de passion, sirop de gingembre, Perrier, menthe', 2500, 'boissons', 'fusion', 'images/plats/cocktail.jpg', ''],
            ['Jus de Passion', 'Jus de fruit de la passion frais, sucré ou nature', 1500, 'boissons', 'senegalais', 'images/plats/jus-passion.jpg', ''],
            ['Jus de Fraise', 'Jus de fraises fraîches, servi bien frais', 1500, 'boissons', 'senegalais', 'images/plats/jus-fraise.jpg', ''],
            ['Jus d\'Ananas', 'Jus d\'ananas frais, touche de menthe', 1500, 'boissons', 'senegalais', 'images/plats/jus-ananas.jpg', ''],
            ['Smoothie Fraise Banane', 'Fraises fraîches, banane, yaourt, miel', 2000, 'boissons', 'fusion', 'images/plats/smoothie-fraise.jpg', 'Lait'],
            ['Ensemble Bleu', 'Cocktail premium, gin, bleu curaçao, tonic, citron', 3500, 'boissons', 'fusion', 'images/plats/ensemble-bleu.jpg', ''],
            ['Bimbimbap Végétarien', 'Riz, tofu mariné, légumes sautés, piment gochujang', 4800, 'plats-senegalais', 'fusion', 'images/plats/vegetarien.jpg', 'Soja, Œuf'],
            ['Grillé Braisé Assorti', 'Assortiment de viandes grillées au feu de bois, yassa de légumes', 8500, 'plats-senegalais', 'senegalais', 'images/plats/grille-braise.jpg', ''],
            ['Frais du Jour', 'Poisson du jour pêché à Saint-Louis, accompagné au choix', 7000, 'plats-senegalais', 'senegalais', 'images/plats/frais-du-jour.jpg', 'Poisson'],
            ['Vin et Jus du Jour', 'Sélection de vins ou jus de fruits selon disponibilité', 3000, 'boissons', 'fusion', 'images/plats/vin-et-jus.jpg', ''],
            ['Petit Pois à la Française', 'Petits pois frais, lait, menthe, beurre, oignons grelots', 3500, 'plats-occidentaux', 'occidental', 'images/plats/petit-pois.jpg', 'Lait']
        ];
        for (const item of menuData) {
            await dbRun('INSERT INTO menu_items (name, description, price, category, type, image, allergens) VALUES (?, ?, ?, ?, ?, ?, ?)', item);
        }
    }

    // ========== AUTH ROUTES ==========
    app.post('/api/auth/login', authLimiter, async (req, res) => {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Identifiants requis' });
        }
        const user = await dbGet('SELECT * FROM users WHERE username = ?', [sanitize(username)]);
        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: 'Identifiants incorrects' });
        }
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        res.cookie('token', token, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'strict' : 'lax',
            maxAge: 86400000
        });
        res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
    });

    app.post('/api/auth/logout', (req, res) => {
        res.clearCookie('token', {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'strict' : 'lax'
        });
        res.json({ success: true });
    });

    app.get('/api/auth/me', auth, async (req, res) => {
        const user = await dbGet('SELECT id, username, role FROM users WHERE id = ?', [req.user.id]);
        res.json(user);
    });

    // ========== MENU ROUTES ==========
    app.get('/api/menu', apiLimiter, async (req, res) => {
        const { category, search, available } = req.query;
        let sql = 'SELECT * FROM menu_items WHERE 1=1';
        const params = [];
        if (category && category !== 'all') {
            const validCategories = ['entrees', 'plats-occidentaux', 'plats-senegalais', 'desserts', 'boissons'];
            if (validCategories.includes(category)) {
                sql += ' AND category = ?';
                params.push(category);
            }
        }
        if (search) {
            const q = sanitize(search);
            sql += ' AND (name LIKE ? OR description LIKE ?)';
            params.push(`%${q}%`, `%${q}%`);
        }
        if (available !== undefined) {
            sql += ' AND available = ?';
            params.push(parseInt(available) || 0);
        }
        sql += ' ORDER BY category, name';
        res.json(await dbAll(sql, params));
    });

    app.get('/api/menu/:id', apiLimiter, async (req, res) => {
        const id = parseInt(req.params.id);
        if (isNaN(id) || id < 1) return res.status(400).json({ error: 'ID invalide' });
        const item = await dbGet('SELECT * FROM menu_items WHERE id = ?', [id]);
        if (!item) return res.status(404).json({ error: 'Plat non trouvé' });
        res.json(item);
    });

    app.post('/api/menu', auth, upload.single('image'), async (req, res) => {
        const { name, description, price, category, type, available, allergens } = req.body;
        const error = requireFields(req.body, ['name', 'price', 'category']);
        if (error) return res.status(400).json({ error });

        const priceNum = parseInt(price);
        if (isNaN(priceNum) || priceNum < 0) return res.status(400).json({ error: 'Prix invalide' });

        const validCategories = ['entrees', 'plats-occidentaux', 'plats-senegalais', 'desserts', 'boissons'];
        if (!validCategories.includes(category)) return res.status(400).json({ error: 'Catégorie invalide' });

        const validTypes = ['occidental', 'senegalais', 'fusion'];
        const itemType = validTypes.includes(type) ? type : 'occidental';

        const image = req.file ? `/uploads/${req.file.filename}` : null;
        const result = await dbRun('INSERT INTO menu_items (name, description, price, category, type, image, available, allergens) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [sanitize(name), sanitize(description || ''), priceNum, category, itemType, image, available !== undefined ? parseInt(available) || 0 : 1, sanitize(allergens || '')]);
        res.json({ id: result.lastInsertRowid, success: true });
    });

    app.put('/api/menu/:id', auth, upload.single('image'), async (req, res) => {
        const id = parseInt(req.params.id);
        if (isNaN(id) || id < 1) return res.status(400).json({ error: 'ID invalide' });

        const { name, description, price, category, type, available, allergens } = req.body;
        const error = requireFields(req.body, ['name', 'price', 'category']);
        if (error) return res.status(400).json({ error });

        const priceNum = parseInt(price);
        if (isNaN(priceNum) || priceNum < 0) return res.status(400).json({ error: 'Prix invalide' });

        const existing = await dbGet('SELECT * FROM menu_items WHERE id = ?', [id]);
        if (!existing) return res.status(404).json({ error: 'Plat non trouvé' });
        const image = req.file ? `/uploads/${req.file.filename}` : existing.image;
        await dbRun('UPDATE menu_items SET name=?, description=?, price=?, category=?, type=?, image=?, available=?, allergens=? WHERE id=?',
            [sanitize(name), sanitize(description || ''), priceNum, category, type, image, available !== undefined ? parseInt(available) || 0 : 1, sanitize(allergens || ''), id]);
        res.json({ success: true });
    });

    app.delete('/api/menu/:id', auth, async (req, res) => {
        const id = parseInt(req.params.id);
        if (isNaN(id) || id < 1) return res.status(400).json({ error: 'ID invalide' });
        await dbRun('DELETE FROM menu_items WHERE id = ?', [id]);
        res.json({ success: true });
    });

    // ========== RESERVATION ROUTES ==========
    app.get('/api/reservations', auth, apiLimiter, async (req, res) => {
        const { status } = req.query;
        let sql = 'SELECT * FROM reservations';
        const params = [];
        if (status) {
            const validStatuses = ['pending', 'confirmed', 'cancelled'];
            if (validStatuses.includes(status)) {
                sql += ' WHERE status = ?';
                params.push(status);
            }
        }
        sql += ' ORDER BY date DESC, time DESC';
        res.json(await dbAll(sql, params));
    });

    app.post('/api/reservations', apiLimiter, async (req, res) => {
        const { name, phone, email, date, time, guests, occasion, area, notes } = req.body;
        const error = requireFields(req.body, ['name', 'phone', 'date', 'time', 'guests']);
        if (error) return res.status(400).json({ error });

        if (!validatePhone(phone)) return res.status(400).json({ error: 'Numéro de téléphone invalide' });
        if (email && !validateEmail(email)) return res.status(400).json({ error: 'Email invalide' });

        const guestsNum = parseInt(guests);
        if (isNaN(guestsNum) || guestsNum < 1 || guestsNum > 50) return res.status(400).json({ error: 'Nombre de convives invalide' });

        const result = await dbRun('INSERT INTO reservations (name, phone, email, date, time, guests, occasion, area, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [sanitize(name), sanitize(phone), sanitize(email || ''), date, time, guestsNum, sanitize(occasion || ''), sanitize(area || ''), sanitize(notes || '')]);
        res.json({ id: result.lastInsertRowid, success: true });
    });

    app.put('/api/reservations/:id', auth, async (req, res) => {
        const id = parseInt(req.params.id);
        if (isNaN(id) || id < 1) return res.status(400).json({ error: 'ID invalide' });
        const { status } = req.body;
        const validStatuses = ['pending', 'confirmed', 'cancelled'];
        if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Statut invalide' });
        await dbRun('UPDATE reservations SET status = ? WHERE id = ?', [status, id]);
        res.json({ success: true });
    });

    app.delete('/api/reservations/:id', auth, async (req, res) => {
        const id = parseInt(req.params.id);
        if (isNaN(id) || id < 1) return res.status(400).json({ error: 'ID invalide' });
        await dbRun('DELETE FROM reservations WHERE id = ?', [id]);
        res.json({ success: true });
    });

    // ========== GALLERY ROUTES ==========
    app.get('/api/gallery', apiLimiter, async (req, res) => {
        const { category } = req.query;
        let sql = 'SELECT * FROM gallery';
        const params = [];
        if (category && category !== 'all') {
            const validCategories = ['plat', 'ambiance', 'equipe', 'cuisine', 'evenement', 'desserts', 'boissons'];
            if (validCategories.includes(category)) {
                sql += ' WHERE category = ?';
                params.push(category);
            }
        }
        sql += ' ORDER BY created_at DESC';
        res.json(await dbAll(sql, params));
    });

    app.post('/api/gallery', auth, upload.single('image'), async (req, res) => {
        const { title, category } = req.body;
        if (!title || !title.trim()) return res.status(400).json({ error: 'Titre requis' });
        if (!req.file) return res.status(400).json({ error: 'Image requise' });
        const validCategories = ['plat', 'ambiance', 'equipe', 'cuisine', 'evenement', 'desserts', 'boissons'];
        const cat = validCategories.includes(category) ? category : 'plat';
        const image = `/uploads/${req.file.filename}`;
        const result = await dbRun('INSERT INTO gallery (title, image, category) VALUES (?, ?, ?)', [sanitize(title), image, cat]);
        res.json({ id: result.lastInsertRowid, success: true });
    });

    app.delete('/api/gallery/:id', auth, async (req, res) => {
        const id = parseInt(req.params.id);
        if (isNaN(id) || id < 1) return res.status(400).json({ error: 'ID invalide' });
        const item = await dbGet('SELECT * FROM gallery WHERE id = ?', [id]);
        if (item && item.image) {
            const filePath = path.join(__dirname, item.image);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        await dbRun('DELETE FROM gallery WHERE id = ?', [id]);
        res.json({ success: true });
    });

    // ========== ORDER ROUTES ==========
    app.get('/api/orders', auth, apiLimiter, async (req, res) => {
        const { status } = req.query;
        let sql = 'SELECT * FROM orders';
        const params = [];
        if (status) {
            const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled'];
            if (validStatuses.includes(status)) {
                sql += ' WHERE status = ?';
                params.push(status);
            }
        }
        sql += ' ORDER BY created_at DESC';
        res.json(await dbAll(sql, params));
    });

    app.post('/api/orders', apiLimiter, async (req, res) => {
        const { customer_name, customer_phone, customer_email, items, total, notes } = req.body;
        const error = requireFields(req.body, ['customer_name', 'customer_phone', 'items', 'total']);
        if (error) return res.status(400).json({ error });

        if (!validatePhone(customer_phone)) return res.status(400).json({ error: 'Numéro de téléphone invalide' });
        if (customer_email && !validateEmail(customer_email)) return res.status(400).json({ error: 'Email invalide' });

        const totalNum = parseInt(total);
        if (isNaN(totalNum) || totalNum < 0) return res.status(400).json({ error: 'Total invalide' });

        if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Articles requis' });

        const result = await dbRun('INSERT INTO orders (customer_name, customer_phone, customer_email, items, total, notes) VALUES (?, ?, ?, ?, ?, ?)',
            [sanitize(customer_name), sanitize(customer_phone), sanitize(customer_email || ''), JSON.stringify(items), totalNum, sanitize(notes || '')]);
        res.json({ id: result.lastInsertRowid, success: true });
    });

    app.put('/api/orders/:id', auth, async (req, res) => {
        const id = parseInt(req.params.id);
        if (isNaN(id) || id < 1) return res.status(400).json({ error: 'ID invalide' });
        const { status } = req.body;
        const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Statut invalide' });
        await dbRun('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
        res.json({ success: true });
    });

    app.delete('/api/orders/:id', auth, async (req, res) => {
        const id = parseInt(req.params.id);
        if (isNaN(id) || id < 1) return res.status(400).json({ error: 'ID invalide' });
        await dbRun('DELETE FROM orders WHERE id = ?', [id]);
        res.json({ success: true });
    });

    // ========== CONTACTS ==========
    app.post('/api/contacts', contactLimiter, async (req, res) => {
        const { name, email, subject, message } = req.body;
        const error = requireFields(req.body, ['name', 'email', 'message']);
        if (error) return res.status(400).json({ error });
        if (!validateEmail(email)) return res.status(400).json({ error: 'Email invalide' });
        const result = await dbRun('INSERT INTO contacts (name, email, subject, message) VALUES (?, ?, ?, ?)',
            [sanitize(name), sanitize(email), sanitize(subject || ''), sanitize(message)]);
        res.json({ id: result.lastInsertRowid, success: true });
    });

    app.get('/api/contacts', auth, apiLimiter, async (req, res) => {
        res.json(await dbAll('SELECT * FROM contacts ORDER BY created_at DESC'));
    });

    app.delete('/api/contacts/:id', auth, async (req, res) => {
        const id = parseInt(req.params.id);
        if (isNaN(id) || id < 1) return res.status(400).json({ error: 'ID invalide' });
        await dbRun('DELETE FROM contacts WHERE id = ?', [id]);
        res.json({ success: true });
    });

    // ========== NEWSLETTER ==========
    app.post('/api/newsletter', contactLimiter, async (req, res) => {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email requis' });
        if (!validateEmail(email)) return res.status(400).json({ error: 'Email invalide' });
        try {
            await dbRun('INSERT INTO newsletter (email) VALUES (?)', [sanitize(email)]);
        } catch {}
        res.json({ success: true });
    });

    // ========== DASHBOARD STATS ==========
    app.get('/api/stats', auth, apiLimiter, async (req, res) => {
        const menuCount = (await dbGet('SELECT COUNT(*) as count FROM menu_items')).count;
        const reservationsPending = (await dbGet("SELECT COUNT(*) as count FROM reservations WHERE status = 'pending'")).count;
        const reservationsTotal = (await dbGet('SELECT COUNT(*) as count FROM reservations')).count;
        const ordersPending = (await dbGet("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'")).count;
        const ordersTotal = (await dbGet('SELECT COUNT(*) as count FROM orders')).count;
        const galleryCount = (await dbGet('SELECT COUNT(*) as count FROM gallery')).count;
        const todayReservations = (await dbGet("SELECT COUNT(*) as count FROM reservations WHERE date = date('now')")).count;
        const contactsCount = (await dbGet('SELECT COUNT(*) as count FROM contacts')).count;
        res.json({ menuCount, reservationsPending, reservationsTotal, ordersPending, ordersTotal, galleryCount, todayReservations, contactsCount });
    });

    // ========== SERVE ADMIN ==========
    app.get('/admin', (req, res) => {
        res.sendFile(path.join(__dirname, 'admin', 'index.html'));
    });
    app.get('/admin/:page', (req, res) => {
        const filePath = path.join(__dirname, 'admin', `${req.params.page}.html`);
        if (fs.existsSync(filePath)) return res.sendFile(filePath);
        res.sendFile(path.join(__dirname, 'admin', 'index.html'));
    });

    // ========== ERROR HANDLING ==========
    app.use((err, req, res, next) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: 'Fichier trop volumineux (max 5 Mo)' });
            }
            return res.status(400).json({ error: 'Erreur upload' });
        }
        if (err.message === 'Seules les images sont acceptées') {
            return res.status(400).json({ error: err.message });
        }
        console.error('Server error:', err);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    });

    // ========== START ==========
    app.listen(PORT, () => {
        console.log(`\n  🍽️  KaayLeek Server running on http://localhost:${PORT}`);
        console.log(`  📊 Admin: http://localhost:${PORT}/admin`);
        console.log(`  🔑 Login: ${ADMIN_USER} / ${isProduction ? '***' : ADMIN_PASS}\n`);
    });
}

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
});

start().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
