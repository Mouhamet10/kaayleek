# KaayLeek — Restaurant Gastronomique

Site web haut de gamme complet pour un restaurant, en français, devise **FCFA**.

Direction artistique : palette **émeraude profond + or champagne + ivoire**, typographie
**Cormorant Garamond** (display) associée à **Jost** (texte), pré-chargeur élégant,
apparitions au scroll, micro-interactions.

---

## Stack technique

- **Backend** : Node.js + Express
- **Base de données** : SQLite (`better-sqlite3`) — simple à déployer, sans serveur DB
- **Auth** : JWT + `bcryptjs` (mots de passe hachés), routes admin protégées
- **Frontend** : SPA léger (HTML/CSS/JS vanilla), sans build — chargement rapide
- **Validation** : côté client ET côté serveur
- **Emails de confirmation** : `nodemailer` (optionnel, configurable via variables d'env)

## Installation

```bash
npm install
npm run seed     # insère les données de démonstration
npm start        # démarre le serveur sur http://localhost:3000
```

La base SQLite est créée automatiquement dans `db/resto.db`.

## Comptes de démonstration

| Rôle       | Identifiant / Email                | Mot de passe |
|------------|------------------------------------|--------------|
| Admin      | `admin` (ou `admin@kaayleek-resto.ci`)  | `admin123`   |
| Client     | `awa@example.com`                  | `client123`  |

- **Espace client** : `/#/compte` (inscription/connexion, profil, réservations, commandes, avis)
- **Espace admin** : `/#/admin` (dashboard, réservations, commandes, menu, avis, utilisateurs, contenu)

## Pages publiques

- **Accueil** `/#/` — hero plein écran, signatures, citation, appels à l'action
- **Menu** `/#/menu` — catégories filtrables, photos, prix FCFA, notes moyennes
- **À propos** `/#/a-propos` — histoire, chef, valeurs, ambiance
- **Galerie** `/#/galerie` — filtres par tag + lightbox
- **Avis** `/#/avis` — liste avec étoiles, tri (récent, note, ancien)
- **Contact** `/#/contact` — formulaire, adresse, Google Maps, horaires, réseaux
- **Réservation** `/#/reservation` — formulaire complet + confirmation animée
- **Commande en ligne** `/#/commande` — panier (localStorage), livraison / retrait,
  paiement à la livraison / sur place ou Mobile Money (OM / MTN / Wave), suivi des commandes

## Structure du projet

```
├── public/            # frontend (servi statiquement)
│   ├── index.html     # coquille SPA
│   ├── css/style.css  # identité visuelle + responsive
│   └── js/
│       ├── api.js     # client API + gestion tokens (client/admin)
│       ├── components.js  # helpers (étoiles, prix FCFA, toasts...)
│       └── app.js     # routeur + toutes les vues
├── server/
│   ├── index.js       # app Express + routes publiques
│   ├── seed.js        # données de démonstration
│   └── middleware/auth.js
├── routes/            # auth, dishes, reservations, orders, reviews, admin
└── db/database.js     # connexion + schéma SQLite
```

## Fonctionnalités clés

- **Menu** : plats par catégories, édition complète depuis l'admin (image, prix, dispo)
- **Notes / avis** : 1 à 5 étoiles, **moyenne automatique par plat**, une seule note par
  utilisateur et par plat, modération (approuver / masquer / supprimer)
- **Réservations** : statuts (en attente / confirmée / refusée / terminée / annulée),
  annulation et modification côté client, gestion + filtres par statut côté admin
- **Commandes en ligne** : panier côté client, livraison ou retrait, paiement à la
  livraison / sur place (cash) ou Mobile Money, recalcul côté serveur,
  suivi des commandes côté client, gestion + changement de statut côté admin
- **Sécurité** : mots de passe hachés (`bcryptjs`), JWT, protection des routes admin,
  validation des formulaires côté client et serveur, anti-injection XSS (`esc`)
- **Back-office** : tableau de bord (réservations du jour, avis à modérer, stats),
  gestion menu, modération avis, gestion utilisateurs (désactivation), contenu du site

## Configuration email (optionnel)

Variables d'environnement pour l'envoi des confirmations de réservation :

```bash
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
JWT_SECRET=...   # secret pour signer les tokens (OBLIGATOIRE)
```

Sans configuration SMTP, le site fonctionne parfaitement (l'envoi est simplement ignoré).

## Performances & accessibilité

- Images optimisées et chargées en `lazy`
- `prefers-reduced-motion` respecté (désactive les animations)
- Design 100 % responsive (mobile, tablette, desktop)
