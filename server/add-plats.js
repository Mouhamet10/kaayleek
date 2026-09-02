const path = require('path');
const fs = require('fs');
const { db } = require('../db/database');

const IMG_DIR = path.join(__dirname, '..', 'public', 'images', 'menu');

function slugName(filename) {
  return filename.replace(/\.(jpe?g|png|gif|webp)$/i, '').trim();
}

function guessCategory(name) {
  const n = name.toLowerCase();
  const entree = [
    'bruschetta', 'salade', 'nems', 'akara', 'croque', 'sandwich', 'tacos',
    'brochette', 'kebab', 'wrap', 'crepe salee', 'fataya', 'fataye',
    'boulette', 'domoda boulette', 'thiou', 'domada', 'mille-feuille',
    'roulade', 'petit-pois', 'bruschetta', 'buffet', 'cou-cou',
  ];
  const dessert = [
    'cake', 'pudding', 'croissant', 'mousse', 'fondant', 'glace', 'tiramisu',
    'crepe sucree', 'oreo', 'cookies', 'tarte', 'mango', 'banana', 'biscoff',
    'lotus',
  ];
  const boisson = [
    'jus', 'smoothie', 'shake', 'cocktail', 'bissap', 'chateau', 'margeaux',
    'vin', 'bouye', 'passion', 'fraise', 'ananas', 'orange', 'mango unfile',
  ];
  if (entree.some(k => n.includes(k))) return 'entree';
  if (dessert.some(k => n.includes(k))) return 'dessert';
  if (boisson.some(k => n.includes(k))) return 'boisson';
  return 'plat';
}

const PRICES = { entree: 6000, plat: 12000, dessert: 6000, boisson: 4000 };

const insert = db.prepare(
  `INSERT INTO dishes (name, category, price, description, image, available)
   VALUES (@name, @category, @price, @description, @image, @available)`
);

const files = fs.readdirSync(IMG_DIR).filter(f => /\.(jpe?g|png|gif|webp)$/i.test(f)).sort();

let added = 0;
for (const f of files) {
  const name = slugName(f);
  const category = guessCategory(name);
  const price = PRICES[category];
  const dup = db.prepare('SELECT 1 FROM dishes WHERE name = ?').get(name);
  if (dup) continue;
  insert.run({
    name,
    category,
    price,
    description: '',
    image: `/images/menu/${f}`,
    available: 1,
  });
  added++;
}

console.log(`✅ ${added} plats ajoutés (${files.length} images dans le dossier).`);
const total = db.prepare('SELECT COUNT(*) AS c FROM dishes').get();
console.log(`Total plats en base : ${total.c}`);
