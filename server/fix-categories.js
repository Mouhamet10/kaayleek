const { db } = require('../db/database');

const updates = [
  // => boisson
  ['banana shake', 'boisson', 4000],
  ['Banana-strawberry-smoothie', 'boisson', 4000],
  ['jus mango', 'boisson', 4000],
  ['smoothie-fraise', 'boisson', 4000],
  ['jus ananas', 'boisson', 4000],
  ['jus bissap', 'boisson', 4000],
  ['jus bouye', 'boisson', 4000],
  ['jus d\'orange', 'boisson', 4000],
  ['jus-passion', 'boisson', 4000],
  ['vin-et-jus', 'boisson', 4000],
  // => plat (classés entrée à tort)
  ['brochette au mouton', 'plat', 12000],
  ['buffet', 'plat', 12000],
  ['kebab', 'plat', 12000],
  ['crepe salee', 'plat', 12000],
  ['croque monsieur', 'plat', 12000],
  ['sandwich Yapp', 'plat', 12000],
  ['Sandwich francais', 'plat', 12000],
  ['tacos au poulet curry', 'plat', 12000],
  ['Tacos mexicaine', 'plat', 12000],
  ['tacos', 'plat', 12000],
  ['wrap', 'plat', 12000],
  ['domoda boulette', 'plat', 12000],
  ['Domada-boulette', 'plat', 12000],
  ['Thiou-boulettes', 'plat', 12000],
  ['fataye', 'plat', 12000],
  ['Fataya', 'plat', 12000],
  ['Burger royal', 'plat', 12000],
  ['hamburger', 'plat', 12000],
  // => dessert (le Poulet-Miel... est mal nommé mais c'est un plat, le fichier montre un poulet)
  ['Poulet-Miel-Moutarde-Glace-avec-Legumes-Rotis', 'plat', 12000],
];

const upd = db.prepare('UPDATE dishes SET category=@cat, price=@price WHERE name=@name');
let n = 0;
for (const [name, cat, price] of updates) {
  const r = upd.run({ name, cat, price });
  n += r.changes;
}
console.log(`${n} plats corrigés.`);
