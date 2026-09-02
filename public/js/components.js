// public/js/components.js
// Helpers de rendu réutilisables : étoiles, prix, toasts, icônes.

// Formate un prix en FCFA
function formatFCFA(n) {
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA';
}

// Rend une note en étoiles (1-5). full = bool, n = nombre d'étoiles
function renderStars(rating, opts = {}) {
  const r = Math.round((rating || 0) * 2) / 2; // arrondi au demi
  const full = Math.floor(r);
  const half = r - full >= 0.5;
  let html = '<span class="stars">';
  for (let i = 1; i <= 5; i++) {
    if (i <= full) html += '<span class="star-star">★</span>';
    else if (half && i === full + 1) html += '<span class="star-half" style="color:var(--gold)">★</span>';
    else html += '<span class="star-empty">★</span>';
  }
  html += '</span>';
  if (opts.showNum && rating) html += `<span class="rating-num">${Number(rating).toFixed(1)}</span>`;
  return html;
}

// Toast de notification
function toast(message, type = 'info', duration = 4200) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = type === 'error' ? '✕' : type === 'success' ? '✓' : '✦';
  el.innerHTML = `<span style="flex-shrink:0">${icon}</span><span>${message}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 500);
  }, duration);
}

// Affiche une erreur dans un élément. Retourne false (pour les form en ligne).
function showFormError(input, container, message) {
  if (container) container.textContent = message || '';
  if (input) input.classList.toggle('input-error', !!message);
  return false;
}

// Helper : échappe HTML pour éviter les injections XSS
function esc(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// Chargeur élégant (spinner)
function loader(text = 'Chargement...') {
  return `<div class="loader-wrap" style="padding:60px 0;text-align:center;color:rgba(43,43,38,.6)">
    <div style="border:2px solid rgba(193,154,91,.3);border-top-color:var(--gold);width:44px;height:44px;border-radius:50%;margin:0 auto 16px;animation:spin 1s linear infinite"></div>
    <div style="font-size:.85rem;letter-spacing:.12em;text-transform:uppercase">${esc(text)}</div>
  </div>`;
}

// Objet SVG des icônes utilisées
const ICONS = {
  phone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z"/></svg>',
  mail: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 6 10 7L22 6"/></svg>',
  pin: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 22s8-4 8-11a8 8 0 1 0-16 0c0 7 8 11 8 11z"/><circle cx="12" cy="11" r="3"/></svg>',
  clock: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  caret: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>',
  cart: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="9" cy="21" r="1.5"/><circle cx="19" cy="21" r="1.5"/><path d="M2 3h2l2.4 12.2a1.5 1.5 0 0 0 1.5 1.2h8.9a1.5 1.5 0 0 0 1.5-1.2L21 7H6"/></svg>',
};

// =========================================================
// PANIER (commandes en ligne) — stocké dans localStorage
// =========================================================
const Cart = {
  KEY: 'kaayleek_cart',
  get() { try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch { return []; } },
  save(items) { localStorage.setItem(this.KEY, JSON.stringify(items)); },
  count() { return this.get().reduce((s, i) => s + i.qty, 0); },
  subtotal() { return this.get().reduce((s, i) => s + i.price * i.qty, 0); },
  add(dish, qty = 1) {
    const items = this.get();
    const found = items.find(i => i.dish_id === dish.id);
    if (found) found.qty += qty;
    else items.push({ dish_id: dish.id, name: dish.name, price: dish.price, image: dish.image, qty });
    this.save(items);
    Cart.refreshBadge();
    Cart.refreshDrawer();
    return items;
  },
  remove(dishId) { this.save(this.get().filter(i => i.dish_id !== dishId)); Cart.refreshBadge(); Cart.refreshDrawer(); },
  setQty(dishId, qty) {
    const items = this.get();
    const it = items.find(i => i.dish_id === dishId);
    if (it) { it.qty = Math.max(1, Math.min(50, qty)); }
    this.save(items); Cart.refreshBadge(); Cart.refreshDrawer();
  },
  clear() { localStorage.removeItem(this.KEY); Cart.refreshBadge(); Cart.refreshDrawer(); },

  // Met à jour le compteur dans l'en-tête
  refreshBadge() {
    const badge = document.getElementById('cartBadge');
    const count = this.count();
    if (badge) { badge.textContent = count; badge.classList.toggle('show', count > 0); }
  },
  // Re-rend le tiroir panier
  refreshDrawer() {
    const itemsList = document.getElementById('cartItems');
    if (!itemsList) return;
    const items = this.get();
    if (!items.length) {
      itemsList.innerHTML = '<div class="cart-empty"><div class="big">🛒</div><p>Votre panier est vide.</p><p style="font-size:.85rem;margin-top:6px">Parcourez le menu pour ajouter vos plats.</p></div>';
    } else {
      itemsList.innerHTML = items.map(it => `
        <div class="cart-item">
          ${it.image ? `<img src="${it.image}" alt="${esc(it.name)}" loading="lazy">` : ''}
          <div class="cart-item-info">
            <h4>${esc(it.name)}</h4>
            <div class="cart-item-price">${formatFCFA(it.price)}</div>
            <div class="qty-control">
              <button onclick="Cart.setQty(${it.dish_id},${it.qty - 1})">−</button>
              <span>${it.qty}</span>
              <button onclick="Cart.setQty(${it.dish_id},${it.qty + 1})">+</button>
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:600;color:var(--emerald-900)">${formatFCFA(it.price * it.qty)}</div>
            <button class="cart-item-remove" onclick="Cart.remove(${it.dish_id})">✕</button>
          </div>
        </div>`).join('');
    }
    const foot = document.getElementById('cartFoot');
    if (foot) {
      const subtotal = this.subtotal();
      foot.innerHTML = `
        <div class="cart-total-row"><span>Sous-total</span><span>${formatFCFA(subtotal)}</span></div>
        <div class="cart-total-row total"><span>Total</span><span>${formatFCFA(subtotal)}</span></div>
        <a href="#/commande" class="btn btn-gold btn-block" style="margin-top:14px" onclick="Cart.toggle(false)">Passer la commande</a>
        <button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="Cart.clear()">Vider le panier</button>
      `;
    }
  },

  // Injecte le tiroir panier dans le DOM (une seule fois)
  init() {
    if (document.getElementById('cartDrawer')) return;
    const drawer = document.createElement('div');
    drawer.className = 'cart-drawer';
    drawer.id = 'cartDrawer';
    drawer.innerHTML = `
      <div class="cart-drawer-head">
        <h3>Votre panier</h3>
        <button class="cart-close" onclick="Cart.toggle(false)" aria-label="Fermer">✕</button>
      </div>
      <div class="cart-drawer-items" id="cartItems"></div>
      <div class="cart-drawer-foot" id="cartFoot"></div>
    `;
    document.body.appendChild(drawer);
    const overlay = document.createElement('div');
    overlay.className = 'mobile-overlay';
    overlay.id = 'cartOverlay';
    overlay.addEventListener('click', () => Cart.toggle(false));
    document.body.appendChild(overlay);
    this.refreshDrawer();
    this.refreshBadge();
  },
  toggle(open) {
    const drawer = document.getElementById('cartDrawer');
    const overlay = document.getElementById('cartOverlay');
    const willOpen = open === undefined ? !drawer.classList.contains('open') : open;
    drawer.classList.toggle('open', willOpen);
    overlay.classList.toggle('open', willOpen);
    document.body.style.overflow = willOpen ? 'hidden' : '';
    if (willOpen) this.refreshDrawer();
  },
};

// Expose Cart globalement
window.Cart = Cart;
