const { db } = require('../db/database');

// Sous-catégories = double occurrence d'un plat, on garde celle avec le nom le plus "propre"
// [id à SUPPRIMER, raison]
const toDelete = [
  [74, 'doublon jus-ananas (garder jus ananas)'],
  [75, 'doublon jus-bouye (garder jus bouye)'],
  [23, 'doublon Domada-boulette (garder domoda boulette)'],
  [24, 'doublon Fataya (garder fataye)'],
  [62, 'doublon filet-de-boeuf (garder filet de boeuf)'],
  [100, 'doublon yaasa poulet (garder yassa-poulet)'],
];

const del = db.prepare('DELETE FROM dishes WHERE id = ?');
let n = 0;
for (const [id, reason] of toDelete) {
  const r = del.run(id);
  if (r.changes) { n++; console.log(`❌ supprimé id ${id} — ${reason}`); }
  else console.log(`⚠️  id ${id} introuvable — ${reason}`);
}
const total = db.prepare('SELECT COUNT(*) AS c FROM dishes').get();
console.log(`\n${n} doublon(s) supprimé(s). Total plats en base : ${total.c}`);
