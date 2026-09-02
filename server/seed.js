// server/seed.js
// Remplit la base avec des données de démonstration réalistes.
// Usage : npm run seed

const bcrypt = require('bcryptjs');
const { db } = require('../db/database');

const password = bcrypt.hashSync('admin123', 10);
const userPass = bcrypt.hashSync('client123', 10);

// ---------------------------------------------------------------
// Nettoyage : rend le seed idempotent (re-exécutable sans doublons)
// On vide les tables de données de démonstration avant ré-insertion.
// ---------------------------------------------------------------
db.prepare('DELETE FROM orders').run();
db.prepare('DELETE FROM reviews').run();
db.prepare('DELETE FROM reservations').run();

// ---------------------------------------------------------------
// Utilisateurs
// ---------------------------------------------------------------
const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (firstname, lastname, email, password, phone, role, active)
  VALUES (@firstname, @lastname, @email, @password, @phone, @role, @active)
`);

insertUser.run({ firstname: 'Admin', lastname: 'KaayLeek', email: 'admin@kaayleek-resto.com', password, phone: '+221760000000', role: 'admin', active: 1 });
insertUser.run({ firstname: 'Awa', lastname: 'Ndiaye', email: 'awa@example.com', password: userPass, phone: '+221761111111', role: 'user', active: 1 });
insertUser.run({ firstname: 'Jean', lastname: 'Diop', email: 'jean@example.com', password: userPass, phone: '+221762222222', role: 'user', active: 1 });
insertUser.run({ firstname: 'Fatou', lastname: 'Diallo', email: 'fatou@example.com', password: userPass, phone: '+221763333333', role: 'user', active: 1 });

// ---------------------------------------------------------------
// Menu
// ---------------------------------------------------------------
const upsertDish = db.prepare(`
  INSERT OR REPLACE INTO dishes (id, name, category, price, description, image, available)
  VALUES (@id, @name, @category, @price, @description, @image, @available)
`);

const dishes = [
  // Entrées
  { id: 1, name: 'Carpaccio de thon rouge', category: 'entree', price: 8500, description: 'Thon rouge frais mariné aux agrumes, huile d\'olive vierge, copeaux de parmesan et jeunes pousses.', image: 'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351', available: 1 },
  { id: 2, name: 'Velouté de butternut', category: 'entree', price: 6500, description: 'Velouté onctueux de courge butternut, crème de coco, graines de courge torréfiées et huile de truffe.', image: 'https://images.unsplash.com/photo-1547592166-23ac45744acd', available: 1 },
  { id: 3, name: 'Salade croquante de saison', category: 'entree', price: 5500, description: 'Mélange de légumes croquants, avocat, vinaigrette au miel et citron vert, éclats de noix de cajou.', image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd', available: 1 },
  // Plats
  { id: 4, name: 'Thieboudienne de homard rôti', category: 'plat', price: 18500, description: 'Homard rôti au beurre noisette, riz parfumé, légumes glacés et émulsion d'agrumes.', image: 'https://images.unsplash.com/photo-1559339352-11d035aa65de', available: 1 },
  { id: 5, name: 'Filet de bœuf aux baies de cacao', category: 'plat', price: 16500, description: 'Filet de bœuf tendre, sauce aux baies de cacao, purée de patate douce et beurre de café.', image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d', available: 1 },
  { id: 6, name: 'Riz au poisson grillé', category: 'plat', price: 12000, description: 'Riz parfumé, poisson entier grillé, sauce tomate safranée, oignons confits et plantain.', image: 'https://images.unsplash.com/photo-1569058242253-92a9c755a0ec', available: 1 },
  { id: 7, name: 'Risotto aux champignons', category: 'plat', price: 11000, description: 'Risotto crémeux aux champignons sauvages, parmesan affiné 24 mois et herbes fraîches.', image: 'https://images.unsplash.com/photo-1476124369491-e7addf5db371', available: 1 },
  // Desserts
  { id: 8, name: 'Fondant au chocolat grand cru', category: 'dessert', price: 7500, description: 'Cœur coulant au chocolat noir 70%, glace vanille de Madagascar et éclats de cacao caramélisés.', image: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c', available: 1 },
  { id: 9, name: 'Bissap infusé, panna cotta exotique', category: 'dessert', price: 6500, description: 'Panna cotta délicate, gelée de bissap, fruits rouges et tuile croustillante.', image: 'https://images.unsplash.com/photo-1488477181946-6428a0291777', available: 1 },
  { id: 10, name: 'Tarte fine aux fruits exotiques', category: 'dessert', price: 6000, description: 'Pâte sablée croustillante, crème pâtissière à la vanille, mangue, fruit de la passion et ananas.', image: 'https://images.unsplash.com/photo-1464349153735-7db50ed83c84', available: 1 },
  // Boissons
  { id: 11, name: 'Cocktail KaayLeek signature', category: 'boisson', price: 7000, description: 'Notre creation signature : rhum arrangé, bissap, citron vert et une touche de gingembre.', image: 'https://images.unsplash.com/photo-1470337458703-46ad1756a187', available: 1 },
  { id: 12, name: 'Jus de gingembre maison', category: 'boisson', price: 3000, description: 'Gingembre frais pressé, ananas, citron vert et menthe. Fraîcheur garantie.', image: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba', available: 1 },
  { id: 13, name: 'Café de spécialité', category: 'boisson', price: 2500, description: 'Café 100% arabica torréfié en Sénégal, servi en méthode douce.', image: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93', available: 1 },
];

const upsert = db.prepare('INSERT OR IGNORE INTO dishes (id, name, category, price, description, image, available) VALUES (@id, @name, @category, @price, @description, @image, @available)');
dishes.forEach(d => upsert.run(d));

// ---------------------------------------------------------------
// Réservations
// ---------------------------------------------------------------
const insertRes = db.prepare(`
  INSERT OR IGNORE INTO reservations (user_id, name, phone, email, people, date, time, special_requests, status)
  VALUES (@user_id, @name, @phone, @email, @people, @date, @time, @special_requests, @status)
`);

const today = new Date();
const fmt = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

insertRes.run({ user_id: 2, name: 'Awa Ndiaye', phone: '+221761111111', email: 'awa@example.com', people: 2, date: fmt(today), time: '19:30', special_requests: 'Table près de la fenêtre', status: 'confirmed' });
insertRes.run({ user_id: 2, name: 'Awa Ndiaye', phone: '+221761111111', email: 'awa@example.com', people: 4, date: fmt(addDays(today, 3)), time: '20:00', special_requests: '', status: 'pending' });
insertRes.run({ user_id: 3, name: 'Jean Diop', phone: '+221762222222', email: 'jean@example.com', people: 5, date: fmt(addDays(today, -1)), time: '19:00', special_requests: 'Anniversaire - gâteau à prévoir', status: 'completed' });
insertRes.run({ user_id: 4, name: 'Fatou Diallo', phone: '+221763333333', email: 'fatou@example.com', people: 2, date: fmt(addDays(today, -7)), time: '20:30', special_requests: '', status: 'refused' });

// ---------------------------------------------------------------
// Avis
// ---------------------------------------------------------------
const insertRev = db.prepare('INSERT OR IGNORE INTO reviews (user_id, dish_id, rating, comment, status) VALUES (?, ?, ?, ?, ?)');
insertRev.run(2, 4, 5, 'Le homard était divin, cuisson parfaite et u une saveur exceptionnelle. Mention spéciale à la texture du riz.', 'approved');
insertRev.run(2, 5, 4, 'Un très bon filet de bœuf, la sauce aux baies de cacao est une trouvaille. Un peu cher mais ça vaut le coup.', 'approved');
insertRev.run(3, 8, 5, 'Le meilleur fondant au chocolat que j\'ai goûté. Fondant à souhait, un vrai délice.', 'approved');
insertRev.run(3, 1, 4, 'Carpaccio frais et délicat, les agrumes apportent une belle fraîcheur.', 'approved');
insertRev.run(4, 6, 5, 'Le riz au poisson est un classique revisité avec talent. Les saveurs sont authentiques.', 'approved');
insertRev.run(4, 12, 3, 'Bon jus de gingembre mais je l\'aurais préféré un peu moins sucré.', 'approved');
insertRev.run(2, 9, 5, 'La panna cotta au bissap est originale et délicieuse. Les fruits rouges relèvent parfaitement l\'ensemble.', 'pending');

// ---------------------------------------------------------------
// Galerie
// ---------------------------------------------------------------
const insertGal = db.prepare('INSERT OR IGNORE INTO gallery (id, image, caption, tag) VALUES (?, ?, ?, ?)');
const gallery = [
  [1, 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0', 'Notre salle principale', 'salle'],
  [2, 'https://images.unsplash.com/photo-1552566626-52f8b828add9', 'Ambiance du soir', 'salle'],
  [3, 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5', 'Table dressée', 'salle'],
  [4, 'https://images.unsplash.com/photo-1559339352-11d035aa65de', 'Homard rôti', 'plat'],
  [5, 'https://images.unsplash.com/photo-1546833999-b9f581a1996d', 'Filet de bœuf', 'plat'],
  [6, 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c', 'Fondant chocolat', 'dessert'],
  [7, 'https://images.unsplash.com/photo-1470337458703-46ad1756a187', 'Cocktail signature', 'boisson'],
  [8, 'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c', 'Le Chef à l\'œuvre', 'chef'],
];
gallery.forEach(g => insertGal.run(...g));

// ---------------------------------------------------------------
// Commandes en ligne
// ---------------------------------------------------------------
const insertOrd = db.prepare(`
  INSERT OR IGNORE INTO orders
    (id, user_id, customer_name, phone, email, type, address, payment, mobile_money, items, subtotal, delivery_fee, total, note, status)
  VALUES (@id, @user_id, @customer_name, @phone, @email, @type, @address, @payment, @mobile_money, @items, @subtotal, @delivery_fee, @total, @note, @status)
`);
const itemsJson = (arr) => JSON.stringify(arr);

insertOrd.run({ id: 1, user_id: 2, customer_name: 'Awa Ndiaye', phone: '+221761111111', email: 'awa@example.com', type: 'delivery', address: 'Almadies, résidence Les Almadies, villa 12', payment: 'mobile_money', mobile_money: '+221761111111', items: itemsJson([{ dish_id: 4, name: 'Thieboudienne de homard rôti', price: 18500, qty: 1, line_total: 18500 }, { dish_id: 8, name: 'Fondant au chocolat grand cru', price: 7500, qty: 2, line_total: 15000 }]), subtotal: 33500, delivery_fee: 1500, total: 35000, note: 'Sonner à l\'interphone', status: 'pending' });
insertOrd.run({ id: 2, user_id: 3, customer_name: 'Jean Diop', phone: '+221762222222', email: 'jean@example.com', type: 'pickup', address: null, payment: 'cash', mobile_money: null, items: itemsJson([{ dish_id: 5, name: 'Filet de bœuf aux baies de cacao', price: 16500, qty: 1, line_total: 16500 }, { dish_id: 12, name: 'Jus de gingembre maison', price: 3000, qty: 2, line_total: 6000 }]), subtotal: 22500, delivery_fee: 0, total: 22500, note: 'Retrait à 13h', status: 'preparing' });
insertOrd.run({ id: 3, user_id: null, customer_name: 'Marc Sarr', phone: '+221764444444', email: 'marc@example.com', type: 'delivery', address: 'Plateau, avenue Lamine Guèye', payment: 'mobile_money', mobile_money: '+221764444444', items: itemsJson([{ dish_id: 6, name: 'Riz au poisson grillé', price: 12000, qty: 1, line_total: 12000 }, { dish_id: 11, name: 'Cocktail KaayLeek signature', price: 7000, qty: 1, line_total: 7000 }]), subtotal: 19000, delivery_fee: 1500, total: 20500, note: '', status: 'delivered' });
insertOrd.run({ id: 4, user_id: 4, customer_name: 'Fatou Diallo', phone: '+221763333333', email: 'fatou@example.com', type: 'delivery', address: 'Hann Maristes, avenue 12', payment: 'cash', mobile_money: null, items: itemsJson([{ dish_id: 1, name: 'Carpaccio de thon rouge', price: 8500, qty: 1, line_total: 8500 }, { dish_id: 5, name: 'Filet de bœuf aux baies de cacao', price: 16500, qty: 1, line_total: 16500 }, { dish_id: 10, name: 'Tarte fine aux fruits exotiques', price: 6000, qty: 1, line_total: 6000 }]), subtotal: 31000, delivery_fee: 1500, total: 32500, note: 'Allergie aux arachides', status: 'completed' });

console.log('✅ Données de démonstration insérées avec succès.');
console.log('   Admin : admin@kaayleek-resto.com / admin123');
console.log('   Client: awa@example.com / client123');
