function sanitizeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function isRestaurantOpen() {
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    if (day === 1) return false;
    if (day === 0 || day === 6) return hour >= 11 && hour < 24;
    return hour >= 12 && hour < 23;
}

const NAV_ITEMS = [
    { label: 'Accueil', href: 'index.html', id: 'accueil' },
    { label: 'Menu', href: 'menu.html', id: 'menu' },
    { label: 'À propos', href: 'apropos.html', id: 'apropos' },
    { label: 'Galerie', href: 'galerie.html', id: 'galerie' },
    { label: 'Réservation', href: 'reservation.html', id: 'reservation' },
    { label: 'Contact', href: 'contact.html', id: 'contact' }
];

let MENU_DATA = [];
let CART = JSON.parse(localStorage.getItem('kaayleek_cart') || '[]');

function saveCart() {
    localStorage.setItem('kaayleek_cart', JSON.stringify(CART));
    renderCartBadge();
    renderCartSidebar();
}

function addToCart(item) {
    const existing = CART.find(c => c.id === item.id);
    if (existing) {
        existing.qty++;
    } else {
        CART.push({ id: item.id, name: item.name, price: item.priceNum, img: item.img || '', qty: 1 });
    }
    saveCart();
    showToast(item.name + ' ajouté au panier');
}

function removeFromCart(id) {
    CART = CART.filter(c => c.id !== id);
    saveCart();
}

function changeQty(id, delta) {
    const item = CART.find(c => c.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) return removeFromCart(id);
    saveCart();
}

function getCartTotal() {
    return CART.reduce((sum, c) => sum + c.price * c.qty, 0);
}

function renderCartBadge() {
    const badge = document.getElementById('cartBadge');
    if (!badge) return;
    const count = CART.reduce((s, c) => s + c.qty, 0);
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
}

function toggleCart() {
    const sidebar = document.getElementById('cartSidebar');
    const overlay = document.getElementById('cartOverlay');
    if (!sidebar) return;
    const isOpen = sidebar.classList.contains('open');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
    document.body.style.overflow = isOpen ? '' : 'hidden';
    renderCartSidebar();
}

function closeCart() {
    const sidebar = document.getElementById('cartSidebar');
    const overlay = document.getElementById('cartOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
}

function renderCartSidebar() {
    const body = document.getElementById('cartItems');
    const footer = document.getElementById('cartFooter');
    if (!body) return;

    if (CART.length === 0) {
        body.innerHTML = '<div class="cart-empty"><i class="fas fa-shopping-bag"></i><p>Votre panier est vide</p></div>';
        footer.innerHTML = '';
        return;
    }

    body.innerHTML = CART.map(c => {
        if (!c.img) {
            const match = MENU_DATA.find(m => m.id === c.id);
            if (match) c.img = match.img;
        }
        const safeImg = c.img ? encodeURI(c.img) : '';
        const safeName = c.name.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        return `
        <div class="cart-item">
            ${safeImg ? `<img src="${safeImg}" alt="${safeName}" class="cart-item-img">` : `<div class="cart-item-img cart-item-img-placeholder"><i class="fas fa-utensils"></i></div>`}
            <div class="cart-item-details">
                <div class="cart-item-info">
                    <span class="cart-item-name">${safeName}</span>
                    <span class="cart-item-price">${c.price.toLocaleString('fr-FR')} FCFA</span>
                </div>
                <div class="cart-item-controls">
                    <button onclick="changeQty(${parseInt(c.id)}, -1)"><i class="fas fa-minus"></i></button>
                    <span>${parseInt(c.qty) || 1}</span>
                    <button onclick="changeQty(${parseInt(c.id)}, 1)"><i class="fas fa-plus"></i></button>
                    <button class="cart-item-remove" onclick="removeFromCart(${parseInt(c.id)})"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        </div>
    `}).join('');

    const total = getCartTotal();
    footer.innerHTML = `
        <div class="cart-total">
            <span>Total</span>
            <strong>${total.toLocaleString('fr-FR')} FCFA</strong>
        </div>
        <button class="btn btn-primary btn-full" onclick="showOrderModal()">
            <i class="fas fa-check"></i> Commander
        </button>
    `;
}

function renderCartHTML() {
    const cart = document.createElement('div');
    cart.id = 'cartSidebar';
    cart.className = 'cart-sidebar';
    cart.innerHTML = `
        <div class="cart-sidebar-header">
            <h3><i class="fas fa-shopping-bag"></i> Mon Panier</h3>
            <button onclick="closeCart()"><i class="fas fa-times"></i></button>
        </div>
        <div class="cart-sidebar-body" id="cartItems"></div>
        <div class="cart-sidebar-footer" id="cartFooter"></div>
    `;
    document.body.appendChild(cart);

    const overlay = document.createElement('div');
    overlay.className = 'cart-overlay';
    overlay.id = 'cartOverlay';
    overlay.onclick = closeCart;
    document.body.appendChild(overlay);
}

function showOrderModal() {
    if (CART.length === 0) return showToast('Panier vide');
    const total = getCartTotal();
    const overlay = document.createElement('div');
    overlay.className = 'cart-overlay active';
    overlay.id = 'orderOverlay';
    overlay.innerHTML = `
        <div class="order-modal">
            <div class="order-modal-header">
                <h3><i class="fas fa-shopping-bag"></i> Finaliser la commande</h3>
                <button onclick="closeOrderModal()"><i class="fas fa-times"></i></button>
            </div>
            <div class="order-modal-body">
                <div class="order-summary">
                    ${CART.map(c => `
                        <div class="order-summary-item">
                            <span>${c.name} x${c.qty}</span>
                            <strong>${(c.price * c.qty).toLocaleString('fr-FR')} FCFA</strong>
                        </div>
                    `).join('')}
                    <div class="order-summary-total">
                        <span>Total</span>
                        <strong>${total.toLocaleString('fr-FR')} FCFA</strong>
                    </div>
                </div>
                <form id="orderForm" class="order-form">
                    <div class="form-row">
                        <div class="form-group">
                            <label>Nom complet *</label>
                            <input type="text" id="orderName" placeholder="Votre nom" required>
                        </div>
                        <div class="form-group">
                            <label>Téléphone *</label>
                            <input type="tel" id="orderPhone" placeholder="+221 7X XXX XX XX" required>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" id="orderEmail" placeholder="votre@email.com">
                    </div>
                    <div class="form-group">
                        <label>Notes / Instructions</label>
                        <textarea id="orderNotes" rows="2" placeholder="Allergies, préférences..."></textarea>
                    </div>
                    <button type="submit" class="btn btn-primary btn-full" id="orderSubmit">
                        <i class="fas fa-paper-plane"></i> Confirmer la commande
                    </button>
                </form>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('orderForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('orderSubmit');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi...';

        try {
            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customer_name: document.getElementById('orderName').value,
                    customer_phone: document.getElementById('orderPhone').value,
                    customer_email: document.getElementById('orderEmail').value,
                    items: CART.map(c => ({ id: c.id, name: c.name, price: c.price, qty: c.qty })),
                    total: total,
                    notes: document.getElementById('orderNotes').value
                })
            });
            const data = await res.json();
            if (data.success) {
                CART = [];
                saveCart();
                closeOrderModal();
                showOrderSuccess(data.id);
            } else {
                showToast('Erreur lors de la commande', 'error');
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-paper-plane"></i> Confirmer la commande';
            }
        } catch {
            showToast('Erreur réseau', 'error');
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> Confirmer la commande';
        }
    });
}

function closeOrderModal() {
    const o = document.getElementById('orderOverlay');
    if (o) o.remove();
}

function showOrderSuccess(orderId) {
    const overlay = document.createElement('div');
    overlay.className = 'cart-overlay active';
    overlay.id = 'orderOverlay';
    overlay.innerHTML = `
        <div class="order-modal order-success">
            <div class="order-success-icon">
                <i class="fas fa-check"></i>
            </div>
            <h3>Commande confirmée !</h3>
            <p>Votre commande <strong>#${orderId}</strong> a été enregistrée.</p>
            <p style="color:var(--gray-500);font-size:0.9rem">Nous vous contacterons bientôt pour confirmer.</p>
            <button class="btn btn-primary" onclick="closeOrderModal()" style="margin-top:20px">
                <i class="fas fa-arrow-left"></i> Retour au menu
            </button>
        </div>
    `;
    document.body.appendChild(overlay);
}

const REVIEWS_DATA = [
    { name: 'Aminata Fall', location: 'Paris, France', initials: 'AF', stars: 5, text: 'En tant que Sénégalaise vivant à Paris, je cherchais un endroit qui me rappelle les saveurs de chez moi. Le Thiéboudienne de KaayLeek m\'a fait pleurer de joie — c\'est exactement comme au pays, avec une touche française qui sublime le tout. Un vrai coup de cœur.' },
    { name: 'Moussa Sow', location: 'Dakar, Sénégal', initials: 'MS', stars: 5, text: 'J\'y vais au moins deux fois par mois avec ma famille. Les enfants adorent les brochettes et moi je suis fan du mafé. Le personnel nous accueille toujours avec le sourire, on se sent comme à la maison.' },
    { name: 'Sophie Dubois', location: 'Lyon, France', initials: 'SD', stars: 4, text: 'Découverte lors d\'un voyage au Sénégal et je ne m\'y attendais pas du tout ! Le concept de fusion est vraiment original. Le Baobab Givré est incroyable — un dessert qu\'on ne trouve nulle part ailleurs. Je recommande vivement.' },
    { name: 'Ibrahima Diop', location: 'Dakar, Sénégal', initials: 'ID', stars: 5, text: 'J\'ai organisé l\'anniversaire de ma femme ici et c\'était parfait. Le chef a préparé un menu sur mesure, le service était aux petits soins. Tout le monde était conquis, même ma belle-mère !' },
    { name: 'Marie-Claire Baptiste', location: 'Bordeaux, France', initials: 'MB', stars: 5, text: 'Ce qui m\'a surpris, c\'est la fraîcheur des ingrédients. On sent que tout est fait maison, avec passion. Le poisson braisé avec le thiakry est une combinaison que je n\'aurais jamais imaginée et qui fonctionne à merveille.' },
    { name: 'Abdoulaye Ndiaye', location: 'Thiès, Sénégal', initials: 'AN', stars: 4.5, text: 'Un restaurant qui manquait à Dakar. Enfin un endroit où l\'on peut manger sénégalais dans un cadre moderne sans que ça perde en authenticité. Le cocktail au gingembre est mon préféré, je recommande à tous mes amis.' }
];

const GALLERY_DATA_DEFAULT = [];

const TEAM_DATA = [
    { name: 'Amadou Diallo', role: 'Chef Principal', desc: 'Formé à Paris et passionné de cuisine sénégalaise, Amadou crée des plats uniques depuis 15 ans.', icon: 'fa-hat-wizard', img: 'images/chef principal.jpg' },
    { name: 'Marie Lefèvre', role: 'Sous-Chef', desc: 'Spécialiste de la pâtisserie française, Marie apporte son savoir-faire et sa créativité.', icon: 'fa-cookie-bite', img: 'images/sous chef.jpg' },
    { name: 'Ousmane Fall', role: 'Maître d\'hôtel', desc: 'Ousmane assure un service impeccable et une ambiance chaleureuse pour tous nos clients.', icon: 'fa-concierge-bell', img: "images/maitre d'hotel.jpg" }
];

// ========== API FETCH ==========
async function fetchMenuData() {
    try {
        const res = await fetch('/api/menu?available=1');
        const data = await res.json();
        MENU_DATA = data.map(item => ({
            id: item.id,
            name: item.name,
            price: item.price.toLocaleString('fr-FR') + ' FCFA',
            priceNum: item.price,
            desc: item.description,
            category: item.category,
            type: item.type,
            icon: getCategoryIcon(item.category),
            img: item.image ? encodeURI(item.image) : '',
            allergens: item.allergens || ''
        }));
    } catch {
        MENU_DATA = [];
    }
}

async function fetchGalleryData() {
    try {
        const res = await fetch('/api/gallery');
        const data = await res.json();
        return data.map(item => ({
            id: item.id,
            title: item.title,
            icon: getCategoryIcon(item.category),
            category: item.category,
            img: item.image ? encodeURI(item.image) : ''
        }));
    } catch {
        return GALLERY_DATA_DEFAULT;
    }
}

function getCategoryIcon(category) {
    const icons = {
        'entrees': 'fa-leaf',
        'plats-occidentaux': 'fa-utensils',
        'plats-senegalais': 'fa-fire-burner',
        'desserts': 'fa-ice-cream',
        'boissons': 'fa-wine-glass',
        'plat': 'fa-utensils',
        'ambiance': 'fa-wine-glass',
        'equipe': 'fa-users',
        'cuisine': 'fa-mortar-pestle',
        'evenement': 'fa-calendar'
    };
    return icons[category] || 'fa-image';
}

// ========== RESERVATION ==========
async function submitReservation(formData) {
    const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
    });
    return await res.json();
}

function getCurrentPage() {
    const path = window.location.pathname;
    const file = path.split('/').pop() || 'index.html';
    return file;
}

function getBasePath() {
    const path = window.location.pathname;
    if (path.includes('/pages/')) return '';
    return '';
}

function renderNavbar() {
    const currentPage = getCurrentPage();
    const basePath = getBasePath();
    const isIndex = currentPage === 'index.html' || currentPage === '' || currentPage === '/';

    const nav = document.createElement('nav');
    nav.className = 'navbar';
    nav.id = 'navbar';

    nav.innerHTML = `
        <div class="nav-container">
            <a href="${basePath}index.html" class="nav-logo">
                <span class="logo-icon">K</span>
                <span class="logo-text">KaayLeek</span>
            </a>
            <button class="nav-toggle" id="navToggle" aria-label="Menu">
                <span></span><span></span><span></span>
            </button>
            <ul class="nav-menu" id="navMenu">
                ${NAV_ITEMS.map(item => `
                    <li>
                        <a href="${basePath}${item.href}" class="nav-link ${currentPage === item.href ? 'active' : ''}">
                            ${item.label}
                        </a>
                    </li>
                `).join('')}
            </ul>
            <div class="nav-actions">
                <button class="nav-search" id="navSearchBtn" onclick="openSearch()" aria-label="Rechercher">
                    <i class="fas fa-search"></i>
                </button>
                <button class="nav-cart" id="navCartBtn" onclick="toggleCart()">
                    <i class="fas fa-shopping-bag"></i>
                    <span class="cart-badge" id="cartBadge">0</span>
                </button>
            </div>
        </div>
    `;

    document.body.prepend(nav);

    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');
    navToggle.addEventListener('click', () => {
        navMenu.classList.toggle('open');
        navToggle.classList.toggle('active');
    });

    navMenu.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            if (href && href !== '#' && !href.startsWith('http')) {
                e.preventDefault();
                navigateTo(href);
            }
            navMenu.classList.remove('open');
            navToggle.classList.remove('active');
        });
    });

    window.addEventListener('scroll', () => {
        nav.classList.toggle('scrolled', window.scrollY > 50);
    });
    window.dispatchEvent(new Event('scroll'));
}

function renderFooter() {
    const basePath = getBasePath();
    const footer = document.createElement('footer');
    footer.className = 'footer';
    footer.innerHTML = `
        <div class="container">
            <div class="footer-grid">
                <div class="footer-brand">
                    <div class="footer-logo">
                        <span class="logo-icon">K</span>
                        <span class="logo-text">KaayLeek</span>
                    </div>
                    <p>La bonne nourriture à la croisée des saveurs occidentales et sénégalaises.</p>
                    <div class="footer-socials">
                        <a href="https://www.facebook.com/kaayleek" target="_blank" aria-label="Facebook"><i class="fab fa-facebook-f"></i></a>
                        <a href="https://www.instagram.com/kaayleek" target="_blank" aria-label="Instagram"><i class="fab fa-instagram"></i></a>
                        <a href="https://wa.me/221762967919" target="_blank" aria-label="WhatsApp"><i class="fab fa-whatsapp"></i></a>
                    </div>
                </div>
                <div class="footer-links">
                    <h4>Navigation</h4>
                    <ul>
                        ${NAV_ITEMS.map(item => `<li><a href="${basePath}${item.href}">${item.label}</a></li>`).join('')}
                    </ul>
                </div>
                <div class="footer-links">
                    <h4>Services</h4>
                    <ul>
                        <li><a href="reservation.html">Réservation</a></li>
                        <li><a href="contact.html?subject=traiteur">Service traiteur</a></li>
                        <li><a href="menu.html">Click & Collect</a></li>
                        <li><a href="contact.html">Nous contacter</a></li>
                    </ul>
                </div>
                <div class="footer-newsletter">
                    <h4>Newsletter</h4>
                    <p>Recevez nos offres et actualités</p>
                    <form class="newsletter-form" id="newsletterForm">
                        <input type="email" placeholder="Votre email" required>
                        <button type="submit"><i class="fas fa-paper-plane"></i></button>
                    </form>
                </div>
            </div>
            <div class="footer-bottom">
                <p>&copy; 2026 KaayLeek. Tous droits réservés.</p>
                <div class="footer-bottom-links">
                    <a href="contact.html">Contact</a>
                    <a href="reservation.html">Réservation</a>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(footer);

    document.getElementById('newsletterForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = e.target.querySelector('input').value;
        try {
            await fetch('/api/newsletter', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email }) });
            showToast('Merci ! Vous êtes inscrit à notre newsletter');
            e.target.reset();
        } catch { showToast('Erreur, réessayez.', 'error'); }
    });

    const scrollTopBtn = document.createElement('button');
    scrollTopBtn.id = 'scrollTopBtn';
    scrollTopBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
    scrollTopBtn.className = 'scroll-top-btn';
    scrollTopBtn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
    document.body.appendChild(scrollTopBtn);
    window.addEventListener('scroll', () => {
        scrollTopBtn.classList.toggle('visible', window.scrollY > 400);
    });
}

function renderSearchModal() {
    const modal = document.createElement('div');
    modal.className = 'search-modal';
    modal.id = 'searchModal';
    modal.innerHTML = `
        <div class="search-overlay" onclick="closeSearch()"></div>
        <div class="search-dialog">
            <div class="search-input-wrap">
                <i class="fas fa-search"></i>
                <input type="text" id="searchInput" placeholder="Rechercher un plat, une boisson..." autocomplete="off">
                <kbd>Échap</kbd>
            </div>
            <div class="search-results" id="searchResults">
                <p class="search-hint"><i class="fas fa-utensils"></i> Tapez pour rechercher dans notre menu</p>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('searchInput').addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        const resultsEl = document.getElementById('searchResults');
        if (!q) {
            resultsEl.innerHTML = '<p class="search-hint"><i class="fas fa-utensils"></i> Tapez pour rechercher dans notre menu</p>';
            return;
        }
        const matches = MENU_DATA.filter(item =>
            item.name.toLowerCase().includes(q) ||
            item.desc.toLowerCase().includes(q) ||
            item.type.toLowerCase().includes(q) ||
            item.category.toLowerCase().includes(q)
        );
        if (!matches.length) {
            resultsEl.innerHTML = '<p class="search-hint"><i class="fas fa-frown"></i> Aucun résultat pour "' + sanitizeHTML(q) + '"</p>';
            return;
        }
        resultsEl.innerHTML = matches.map(item => `
            <div class="search-result-item" onclick="goToMenuSearch('${sanitizeHTML(item.name)}')">
                <div class="search-result-img">
                    ${item.img ? `<img src="${item.img}" alt="${item.name}" onerror="this.style.display='none'">` : `<i class="fas ${item.icon}"></i>`}
                </div>
                <div class="search-result-info">
                    <strong>${item.name}</strong>
                    <span>${item.desc}</span>
                </div>
                <span class="search-result-price">${item.price}</span>
            </div>
        `).join('');
    });
}

function openSearch() {
    const modal = document.getElementById('searchModal');
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('searchInput').focus(), 100);
}

function closeSearch() {
    const modal = document.getElementById('searchModal');
    modal.classList.remove('open');
    document.body.style.overflow = '';
    document.getElementById('searchInput').value = '';
    document.getElementById('searchResults').innerHTML = '<p class="search-hint"><i class="fas fa-utensils"></i> Tapez pour rechercher dans notre menu</p>';
}

function goToMenuSearch(query) {
    closeSearch();
    window.location.href = getBasePath() + 'menu.html?q=' + encodeURIComponent(query);
}

function renderTransitionOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'page-transition-overlay';
    overlay.id = 'pageTransition';
    for (let i = 0; i < 5; i++) {
        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.transitionDelay = `${i * 0.05}s`;
        overlay.appendChild(bar);
    }
    document.body.prepend(overlay);
}

function navigateTo(url) {
    const overlay = document.getElementById('pageTransition');
    overlay.classList.add('active');
    overlay.classList.remove('out');
    setTimeout(() => {
        window.location.href = url;
    }, 500);
}

function initPageTransition() {
    const overlay = document.getElementById('pageTransition');
    if (!overlay) return;
    overlay.classList.remove('active');
    overlay.classList.add('out');
    setTimeout(() => {
        overlay.classList.remove('out');
    }, 600);
}

function showToast(message, type) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        toast.id = 'toast';
        document.body.appendChild(toast);
    }
    const icon = type === 'error' ? 'fa-times-circle' : type === 'warning' ? 'fa-exclamation-circle' : 'fa-check-circle';
    const color = type === 'error' ? '#dc3545' : type === 'warning' ? '#ffc107' : '#28a745';
    toast.innerHTML = `<i class="fas ${icon}" style="color:${color}"></i><span id="toastMessage"></span>`;
    document.getElementById('toastMessage').textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
}

function initScrollReveal() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

function renderStars(rating) {
    let html = '';
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5;
    for (let i = 0; i < full; i++) html += '<i class="fas fa-star"></i>';
    if (half) html += '<i class="fas fa-star-half-alt"></i>';
    for (let i = full + (half ? 1 : 0); i < 5; i++) html += '<i class="far fa-star"></i>';
    return html;
}

function renderMenuCards(items, container) {
    container.innerHTML = items.map((item, i) => `
        <div class="menu-card reveal" data-category="${item.category}" data-type="${item.type}" style="transition-delay: ${i * 0.05}s">
            <div class="menu-card-img">
                ${item.img ? `<img src="${item.img}" alt="${item.name}" class="menu-card-photo" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : ''}
                <div class="menu-img-placeholder" ${item.img ? 'style="display:none"' : ''}><i class="fas ${item.icon}"></i></div>
                <span class="menu-tag ${item.type}">${item.type === 'senegalais' ? 'Sénégalais' : item.type === 'occidental' ? 'Occidental' : 'Fusion'}</span>
            </div>
            <div class="menu-card-content">
                <div class="menu-card-header">
                    <h3>${item.name}</h3>
                    <span class="menu-price">${item.price}</span>
                </div>
                <p>${item.desc}</p>
                ${item.allergens ? `<div class="allergen-badges">${item.allergens.split(',').map(a => `<span class="allergen-badge" title="${a.trim()}">${a.trim()}</span>`).join('')}</div>` : ''}
                <button class="btn-order" data-id="${item.id}" data-name="${item.name}" data-price="${item.priceNum}" data-img="${item.img || ''}">
                    <i class="fas fa-plus"></i> Commander
                </button>
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.btn-order').forEach(btn => {
        btn.addEventListener('click', () => {
            addToCart({
                id: parseInt(btn.dataset.id),
                name: btn.dataset.name,
                priceNum: parseInt(btn.dataset.price),
                img: btn.dataset.img
            });
        });
    });
}

function initMenuFilters(filterSelector, gridSelector) {
    const filterBtns = document.querySelectorAll(filterSelector);
    const grid = document.querySelector(gridSelector);
    if (!filterBtns.length || !grid) return;

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const filter = btn.getAttribute('data-filter');
            grid.querySelectorAll('.menu-card').forEach(card => {
                const cat = card.getAttribute('data-category');
                const show = filter === 'all' || cat === filter;
                card.classList.toggle('hidden', !show);
                if (show) {
                    card.style.animation = 'fadeInUp 0.4s ease both';
                }
            });
        });
    });
}

function initMenuSearch(inputSelector, gridSelector) {
    const input = document.querySelector(inputSelector);
    const grid = document.querySelector(gridSelector);
    if (!input || !grid) return;

    input.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        grid.querySelectorAll('.menu-card').forEach(card => {
            const name = card.querySelector('h3')?.textContent.toLowerCase() || '';
            const desc = card.querySelector('p')?.textContent.toLowerCase() || '';
            const match = !query || name.includes(query) || desc.includes(query);
            card.classList.toggle('hidden', !match);
        });
    });
}

function initGalleryFilters(filterSelector, gridSelector) {
    const filterBtns = document.querySelectorAll(filterSelector);
    const grid = document.querySelector(gridSelector);
    if (!filterBtns.length || !grid) return;

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const filter = btn.getAttribute('data-filter');
            grid.querySelectorAll('.gallery-item').forEach(item => {
                const cat = item.getAttribute('data-category');
                const show = filter === 'all' || cat === filter;
                item.style.display = show ? '' : 'none';
            });
        });
    });
}

function initLightbox() {
    const lightbox = document.createElement('div');
    lightbox.className = 'lightbox';
    lightbox.id = 'lightbox';
    lightbox.innerHTML = `
        <button class="lightbox-close" id="lightboxClose"><i class="fas fa-times"></i></button>
        <div class="lightbox-content" id="lightboxContent"></div>
    `;
    document.body.appendChild(lightbox);

    document.getElementById('lightboxClose').addEventListener('click', () => {
        lightbox.classList.remove('active');
    });
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) lightbox.classList.remove('active');
    });
}

function openLightbox(title, imgSrc) {
    const lightbox = document.getElementById('lightbox');
    const content = document.getElementById('lightboxContent');
    content.innerHTML = imgSrc
        ? `<img src="${imgSrc}" alt="${title}" style="max-width:90vw; max-height:80vh; border-radius:12px; object-fit:contain;">
           <h2 style="font-family:var(--font-display); font-size:1.5rem; margin-top:16px; color:#fff;">${title}</h2>`
        : `<div style="font-size:6rem; margin-bottom:24px; color:rgba(255,255,255,0.3);"><i class="fas fa-image"></i></div>
           <h2 style="font-family:var(--font-display); font-size:2rem; margin-bottom:12px; color:#fff;">${title}</h2>
           <p style="color:rgba(255,255,255,0.6);">Photo du restaurant KaayLeek</p>`;
    lightbox.classList.add('active');
}

document.addEventListener('DOMContentLoaded', () => {
    renderTransitionOverlay();
    initPageTransition();
    renderNavbar();
    renderFooter();
    renderSearchModal();
    renderCartHTML();
    initScrollReveal();
    initLightbox();
    renderCartBadge();

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearch(); }
        if (e.key === 'Escape') closeSearch();
    });

    setTimeout(() => {
        document.querySelectorAll('.page-content').forEach(el => el.classList.add('visible'));
    }, 100);

    document.querySelectorAll('a[href]').forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            if (href && !href.startsWith('#') && !href.startsWith('http') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
                e.preventDefault();
                navigateTo(href);
            }
        });
    });
});
