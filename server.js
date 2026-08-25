const express = require('express');
const initSqlJs = require('sql.js');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'kaayleek-secret-2026';
const DB_PATH = path.join(__dirname, 'kaayleek.db');

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
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ========== DB HELPERS ==========
let db;

function saveDb() {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

function dbAll(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
}

function dbGet(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    let row = null;
    if (stmt.step()) row = stmt.getAsObject();
    stmt.free();
    return row;
}

function dbRun(sql, params = []) {
    const safeParams = params.map(p => p === undefined ? null : p);
    db.run(sql, safeParams);
    const changes = db.getRowsModified();
    const rowId = db.exec("SELECT last_insert_rowid() as id");
    saveDb();
    return { lastInsertRowid: rowId[0]?.values[0][0] || 0, changes };
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
    const SQL = await initSqlJs();

    if (fs.existsSync(DB_PATH)) {
        const buf = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buf);
    } else {
        db = new SQL.Database();
    }

    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS menu_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        price INTEGER NOT NULL,
        category TEXT NOT NULL,
        type TEXT NOT NULL,
        image TEXT,
        available INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS reservations (
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
    db.run(`CREATE TABLE IF NOT EXISTS gallery (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        image TEXT NOT NULL,
        category TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS orders (
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
    db.run(`CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        subject TEXT,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    saveDb();

    // Seed admin
    const admin = dbGet('SELECT id FROM users WHERE username = ?', ['admin']);
    if (!admin) {
        const hash = bcrypt.hashSync('admin123', 10);
        dbRun('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['admin', hash, 'admin']);
    }

    // Seed menu
    const menuCount = dbGet('SELECT COUNT(*) as count FROM menu_items');
    if (menuCount.count === 0) {
        const menuData = [
            ['Tartare de Thiof', 'Thiof frais coupé en dés, avocat, mangue verte, huile d\'arachide grillée', 4500, 'entrees', 'fusion'],
            ['Bruschetta Tomates', 'Pain grillé, tomates concassées, basilic frais, huile d\'olive, mozzarella di bufala', 3500, 'entrees', 'occidental'],
            ['Yassa de Poulet', 'Poulet mariné citronné, oignons caramélisés, moutarde de Dijon', 3800, 'entrees', 'senegalais'],
            ['Salade KaayLeek', 'Salade verte, mangue, noix de cajou grillées, vinaigrette au tamarind', 3200, 'entrees', 'fusion'],
            ['Filet de Boeuf Rossini', 'Filet de boeuf, foie gras poêlé, sauce au poivre, pommes dauphine', 12500, 'plats-occidentaux', 'occidental'],
            ['Saumon en Croûte', 'Saumon frais, feuilletage doré, épinards, sauce bisque de crevettes', 9800, 'plats-occidentaux', 'occidental'],
            ['Risotto aux Crevettes', 'Riz carnaroli crémeux, crevettes royales, parmesan, safran', 7500, 'plats-occidentaux', 'occidental'],
            ['Magret de Canard', 'Magret rosé, sauce à la mangue, purée de patate douce, légumes glacés', 8500, 'plats-occidentaux', 'occidental'],
            ['Thiéboudienne Royale', 'Riz parfumé au tomate, poisson thiof farci, légumes traditionnels, tamarind', 5500, 'plats-senegalais', 'senegalais'],
            ['Mafé Special', 'Boeuf fondant, sauce d\'arachide onctueuse, carottes, patates douces, riz blanc', 6200, 'plats-senegalais', 'senegalais'],
            ['Poulet Yassa Grandiose', 'Poulet fermier mariné, oignons grillés, citron confit, riz ognon', 5800, 'plats-senegalais', 'senegalais'],
            ['Poisson Braisé', 'Thiof entier braisé au feu de bois, yassa de légumes, attiéké, sauce piment', 6500, 'plats-senegalais', 'senegalais'],
            ['Délice au Baobab', 'Mousse au baobab, coulis de mangue, crumble d\'amande, feuille d\'or', 2800, 'desserts', 'fusion'],
            ['Fondant au Chocolat', 'Chocolat noir 70%, coeur coulant, glace vanille de Madagascar', 3200, 'desserts', 'occidental'],
            ['Bissap Givré', 'Sorbet bissap, groseilles, menthe fraîche, sirop de baobab', 2500, 'desserts', 'senegalais'],
            ['Château Margaux 2018', 'Cru classé Bordeaux, arômes de fruits noirs et d\'épices fines', 35000, 'boissons', 'occidental'],
            ['Bouye Maison', 'Jus de baobab frais, lait, vanille, cannelle, servi bien frais', 1500, 'boissons', 'senegalais'],
            ['Cocktail KaayLeek', 'Rhum, jus de passion, sirop de gingembre, Perrier, menthe', 2500, 'boissons', 'fusion']
        ];
        for (const item of menuData) {
            dbRun('INSERT INTO menu_items (name, description, price, category, type) VALUES (?, ?, ?, ?, ?)', item);
        }
    }

    // ========== AUTH ROUTES ==========
    app.post('/api/auth/login', (req, res) => {
        const { username, password } = req.body;
        const user = dbGet('SELECT * FROM users WHERE username = ?', [username]);
        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: 'Identifiants incorrects' });
        }
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        res.cookie('token', token, { httpOnly: true, maxAge: 86400000 });
        res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
    });

    app.post('/api/auth/logout', (req, res) => {
        res.clearCookie('token');
        res.json({ success: true });
    });

    app.get('/api/auth/me', auth, (req, res) => {
        const user = dbGet('SELECT id, username, role FROM users WHERE id = ?', [req.user.id]);
        res.json(user);
    });

    // ========== MENU ROUTES ==========
    app.get('/api/menu', (req, res) => {
        const { category, search, available } = req.query;
        let sql = 'SELECT * FROM menu_items WHERE 1=1';
        const params = [];
        if (category && category !== 'all') { sql += ' AND category = ?'; params.push(category); }
        if (search) { sql += ' AND (name LIKE ? OR description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
        if (available !== undefined) { sql += ' AND available = ?'; params.push(parseInt(available)); }
        sql += ' ORDER BY category, name';
        res.json(dbAll(sql, params));
    });

    app.get('/api/menu/:id', (req, res) => {
        const item = dbGet('SELECT * FROM menu_items WHERE id = ?', [parseInt(req.params.id)]);
        if (!item) return res.status(404).json({ error: 'Plat non trouvé' });
        res.json(item);
    });

    app.post('/api/menu', auth, upload.single('image'), (req, res) => {
        const { name, description, price, category, type, available } = req.body;
        const image = req.file ? `/uploads/${req.file.filename}` : null;
        const result = dbRun('INSERT INTO menu_items (name, description, price, category, type, image, available) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name, description, parseInt(price), category, type || 'occidental', image, available !== undefined ? parseInt(available) : 1]);
        res.json({ id: result.lastInsertRowid, success: true });
    });

    app.put('/api/menu/:id', auth, upload.single('image'), (req, res) => {
        const { name, description, price, category, type, available } = req.body;
        const existing = dbGet('SELECT * FROM menu_items WHERE id = ?', [parseInt(req.params.id)]);
        if (!existing) return res.status(404).json({ error: 'Plat non trouvé' });
        const image = req.file ? `/uploads/${req.file.filename}` : existing.image;
        dbRun('UPDATE menu_items SET name=?, description=?, price=?, category=?, type=?, image=?, available=? WHERE id=?',
            [name, description, parseInt(price), category, type, image, available !== undefined ? parseInt(available) : 1, parseInt(req.params.id)]);
        res.json({ success: true });
    });

    app.delete('/api/menu/:id', auth, (req, res) => {
        dbRun('DELETE FROM menu_items WHERE id = ?', [parseInt(req.params.id)]);
        res.json({ success: true });
    });

    // ========== RESERVATION ROUTES ==========
    app.get('/api/reservations', auth, (req, res) => {
        const { status } = req.query;
        let sql = 'SELECT * FROM reservations';
        const params = [];
        if (status) { sql += ' WHERE status = ?'; params.push(status); }
        sql += ' ORDER BY date DESC, time DESC';
        res.json(dbAll(sql, params));
    });

    app.post('/api/reservations', (req, res) => {
        const { name, phone, email, date, time, guests, occasion, area, notes } = req.body;
        const result = dbRun('INSERT INTO reservations (name, phone, email, date, time, guests, occasion, area, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [name, phone, email, date, time, parseInt(guests), occasion, area, notes]);
        res.json({ id: result.lastInsertRowid, success: true });
    });

    app.put('/api/reservations/:id', auth, (req, res) => {
        const { status } = req.body;
        dbRun('UPDATE reservations SET status = ? WHERE id = ?', [status, parseInt(req.params.id)]);
        res.json({ success: true });
    });

    app.delete('/api/reservations/:id', auth, (req, res) => {
        dbRun('DELETE FROM reservations WHERE id = ?', [parseInt(req.params.id)]);
        res.json({ success: true });
    });

    // ========== GALLERY ROUTES ==========
    app.get('/api/gallery', (req, res) => {
        const { category } = req.query;
        let sql = 'SELECT * FROM gallery';
        const params = [];
        if (category && category !== 'all') { sql += ' WHERE category = ?'; params.push(category); }
        sql += ' ORDER BY created_at DESC';
        res.json(dbAll(sql, params));
    });

    app.post('/api/gallery', auth, upload.single('image'), (req, res) => {
        const { title, category } = req.body;
        if (!req.file) return res.status(400).json({ error: 'Image requise' });
        const image = `/uploads/${req.file.filename}`;
        const result = dbRun('INSERT INTO gallery (title, image, category) VALUES (?, ?, ?)', [title, image, category]);
        res.json({ id: result.lastInsertRowid, success: true });
    });

    app.delete('/api/gallery/:id', auth, (req, res) => {
        const item = dbGet('SELECT * FROM gallery WHERE id = ?', [parseInt(req.params.id)]);
        if (item && item.image) {
            const filePath = path.join(__dirname, item.image);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        dbRun('DELETE FROM gallery WHERE id = ?', [parseInt(req.params.id)]);
        res.json({ success: true });
    });

    // ========== ORDER ROUTES ==========
    app.get('/api/orders', auth, (req, res) => {
        const { status } = req.query;
        let sql = 'SELECT * FROM orders';
        const params = [];
        if (status) { sql += ' WHERE status = ?'; params.push(status); }
        sql += ' ORDER BY created_at DESC';
        res.json(dbAll(sql, params));
    });

    app.post('/api/orders', (req, res) => {
        const { customer_name, customer_phone, customer_email, items, total, notes } = req.body;
        const result = dbRun('INSERT INTO orders (customer_name, customer_phone, customer_email, items, total, notes) VALUES (?, ?, ?, ?, ?, ?)',
            [customer_name, customer_phone, customer_email, JSON.stringify(items), parseInt(total), notes]);
        res.json({ id: result.lastInsertRowid, success: true });
    });

    app.put('/api/orders/:id', auth, (req, res) => {
        const { status } = req.body;
        dbRun('UPDATE orders SET status = ? WHERE id = ?', [status, parseInt(req.params.id)]);
        res.json({ success: true });
    });

    app.delete('/api/orders/:id', auth, (req, res) => {
        dbRun('DELETE FROM orders WHERE id = ?', [parseInt(req.params.id)]);
        res.json({ success: true });
    });

    // ========== CONTACTS ==========
    app.post('/api/contacts', (req, res) => {
        const { name, email, subject, message } = req.body;
        const result = dbRun('INSERT INTO contacts (name, email, subject, message) VALUES (?, ?, ?, ?)',
            [name, email, subject, message]);
        res.json({ id: result.lastInsertRowid, success: true });
    });

    app.get('/api/contacts', auth, (req, res) => {
        res.json(dbAll('SELECT * FROM contacts ORDER BY created_at DESC'));
    });

    app.delete('/api/contacts/:id', auth, (req, res) => {
        dbRun('DELETE FROM contacts WHERE id = ?', [parseInt(req.params.id)]);
        res.json({ success: true });
    });

    // ========== DASHBOARD STATS ==========
    app.get('/api/stats', auth, (req, res) => {
        const menuCount = dbGet('SELECT COUNT(*) as count FROM menu_items').count;
        const reservationsPending = dbGet("SELECT COUNT(*) as count FROM reservations WHERE status = 'pending'").count;
        const reservationsTotal = dbGet('SELECT COUNT(*) as count FROM reservations').count;
        const ordersPending = dbGet("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'").count;
        const ordersTotal = dbGet('SELECT COUNT(*) as count FROM orders').count;
        const galleryCount = dbGet('SELECT COUNT(*) as count FROM gallery').count;
        const todayReservations = dbGet("SELECT COUNT(*) as count FROM reservations WHERE date = date('now')").count;
        const contactsCount = dbGet('SELECT COUNT(*) as count FROM contacts').count;
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

    // ========== START ==========
    app.listen(PORT, () => {
        console.log(`\n  🍽️  KaayLeek Server running on http://localhost:${PORT}`);
        console.log(`  📊 Admin: http://localhost:${PORT}/admin`);
        console.log(`  🔑 Login: admin / admin123\n`);
    });
}

start().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
