// public/js/app.js
// Routage, rendu des vues, interactions globales.

(() => {
  const app = document.getElementById('app');
  const siteHeader = document.getElementById('siteHeader');

  // ---------------------------------------------------------
  // État global
  // ---------------------------------------------------------
  const state = {
    settings: null,
    currentUser: User.get(),
  };

  // Image de secours pour les plats sans photo
  const FALLBACK_IMG = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect width="120" height="80" fill="#e9e2d3"/><text x="60" y="45" text-anchor="middle" font-size="12" fill="#b08d5a">KaayLeek</text></svg>'
  );

  // ---------------------------------------------------------
  // Helpers généraux
  // ---------------------------------------------------------
  function debounce(fn, ms = 100) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  // Nettoie et rend une vue
  function render(html) {
    app.innerHTML = html;
    initReveal();
    initForms(app);
    initParallax();
    Cart.refreshBadge();
    if (Date.now() > 2000) window.scrollTo(0, 0);
  }

  // Chaque vue retourne une fonction async
  const views = {};

  // ---------------------------------------------------------
  // Routeur
  // ---------------------------------------------------------
  async function router() {
    const hash = location.hash.replace(/^#/, '') || '/';
    const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
    const clean = hash.split('?')[0] || '/';
    const [path, ...rest] = clean.split('/').filter(Boolean);
    const full = '/' + path;
    const param = rest.join('/');

    // Navigation admin séparée
    if (full.startsWith('/admin')) {
      await renderAdmin(param);
      setActiveNav(null);
      return;
    }

    const viewFn = views[full] || views['/'];
    await viewFn(param, rest, query);
    setActiveNav(full);
  }

  function setActiveNav(path) {
    document.querySelectorAll('[data-nav]').forEach(a => {
      const href = a.getAttribute('href');
      a.classList.toggle('active', href === ('#' + path));
    });
  }

  // ---------------------------------------------------------
  // Initialisation des animations au scroll
  // ---------------------------------------------------------
  function initReveal() {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
  }

  // ---------------------------------------------------------
  // Parallaxe légère sur les images de fond
  // ---------------------------------------------------------
  function initParallax() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const els = document.querySelectorAll('[data-parallax]');
    els.forEach(el => {
      const speed = parseFloat(el.dataset.parallax || '0.2');
      const update = () => {
        const rect = el.getBoundingClientRect();
        const center = (rect.top + rect.height / 2) - window.innerHeight / 2;
        el.style.transform = `translate3d(0, ${center * speed}px, 0) scale(1.08)`;
      };
      window.addEventListener('scroll', debounce(update, 8), { passive: true });
      update();
    });
  }

  // ---------------------------------------------------------
  // Header scroll + progression
  // ---------------------------------------------------------
  function initScrollEffects() {
    const progress = document.querySelector('.scroll-progress');
    const onScroll = () => {
      siteHeader.classList.toggle('scrolled', window.scrollY > 40);
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      const p = max > 0 ? (h.scrollTop / max) * 100 : 0;
      if (progress) progress.style.width = p + '%';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ---------------------------------------------------------
  // Formulaire : validation + gestion erreurs
  // ---------------------------------------------------------
  function initForms(root) {
    // Gestion générique des soumissions via data-attributes
  }

  // Injecte les événements de formulaire globaux une seule fois
  function bindGlobalHandlers() {
    // Menu mobile
    const burger = document.getElementById('navHamburger');
    const navLinks = document.getElementById('navLinks');
    const overlay = document.createElement('div');
    overlay.className = 'mobile-overlay';
    document.body.appendChild(overlay);
    burger.addEventListener('click', () => {
      navLinks.classList.add('mobile');
      const open = navLinks.classList.toggle('open');
      burger.classList.toggle('open', open);
      overlay.classList.toggle('open', open);
      document.body.style.overflow = open ? 'hidden' : '';
    });
    document.addEventListener('click', (e) => {
      if (e.target.closest('.nav-links a') || e.target === overlay) {
        navLinks.classList.remove('open');
        burger.classList.remove('open');
        overlay.classList.remove('open');
        document.body.style.overflow = '';
      }
    });

    // Ajout au panier : délégation d'événement (résout aussi l'échappement
    // des guillemets dans les attributs onclick)
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.add-to-cart');
      if (!btn) return;
      let dish = null;
      try { dish = JSON.parse(btn.dataset.dish); } catch { return; }
      if (!dish || dish.id == null) return;
      Cart.add({ id: dish.id, name: dish.name, price: dish.price, image: dish.image });
      toast(`<strong>${esc(dish.name)}</strong> ajouté au panier`, 'success');
      btn.blur();
    });

    // Admin — modifier / supprimer un plat (délégation robuste, pas d'attribut onclick inline)
    document.addEventListener('click', (e) => {
      const editBtn = e.target.closest('.btn-edit-dish');
      if (editBtn) {
        let dish = null;
        try { dish = JSON.parse(editBtn.dataset.edit); } catch { return; }
        openDishForm(dish);
        return;
      }
      const delBtn = e.target.closest('.btn-del-dish');
      if (delBtn) {
        delDish(parseInt(delBtn.dataset.id, 10));
        return;
      }
    });

    // Formulaire "Contenu du site" (admin) — délégation : fiable quel que soit le timing d'injection
    document.addEventListener('submit', async (e) => {
      if (e.target && e.target.id === 'settingsForm') {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const prev = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement...'; }
        const fd = new FormData(e.target);
        const payload = {};
        fd.forEach((v, k) => { payload[k] = v; });
        try {
          await API.admin.saveSettings(payload);
          toast('Paramètres enregistrés.', 'success');
          await initFooter();
        } catch (ex) { toast(ex.message, 'error'); }
        if (btn) { btn.disabled = false; btn.textContent = prev; }
        return;
      }
      if (e.target && e.target.id === 'dishForm') {
        e.preventDefault();
        const errEl = document.getElementById('dfErr');
        if (errEl) errEl.textContent = '';
        const name = (document.getElementById('dfName').value || '').trim();
        const price = Number(document.getElementById('dfPrice').value);
        if (!name) { if (errEl) errEl.textContent = 'Le nom est requis.'; return; }
        if (!price || price < 0) { if (errEl) errEl.textContent = 'Prix invalide.'; return; }
        const btn = e.target.querySelector('button[type="submit"]');
        const prevTxt = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement...'; }
        try {
          let image = (document.getElementById('dfImg').value || '').trim() || null;
          const file = document.getElementById('dfImgFile').files[0];
          if (file) image = await API.admin.uploadImage(file);
          const payload = {
            name,
            category: document.getElementById('dfCat').value,
            price,
            description: (document.getElementById('dfDesc').value || '').trim() || null,
            image,
            available: document.getElementById('dfAvail').checked ? 1 : 0
          };
          if (editingDish && editingDish.id) await API.admin.updateDish(editingDish.id, payload);
          else await API.admin.addDish(payload);
          toast('Plat enregistré.', 'success');
          setTimeout(() => location.reload(), 500);
        } catch (ex) {
          if (errEl) errEl.textContent = ex.message;
          if (btn) { btn.disabled = false; btn.textContent = prevTxt; }
        }
      }
    });
  }

  // ---------------------------------------------------------
  // Rendu du pied de page avec les paramètres
  // ---------------------------------------------------------
  async function initFooter() {
    try { state.settings = await API.getPublicSettings(); } catch { return; }
    const s = state.settings;
    const d = document;
    const set = (sel, txt) => { const el = d.querySelector(sel); if (el) el.innerHTML = txt; };

    set('.footer-address', `${s['site.address']}, ${s['site.city']}`);
    set('.footer-phone', s['site.phone']);
    set('.footer-email', `<a href="mailto:${s['site.email']}">${s['site.email']}</a>`);

    const hours = d.getElementById('footerHours');
    if (hours) {
      hours.innerHTML = Object.entries(s)
        .filter(([k]) => k.startsWith('hours.'))
        .map(([k, v]) => `<li><div class="hours-row"><span class="day">${k.split('.')[1]}</span><span class="time">${esc(v)}</span></div></li>`)
        .join('');
    }

    const social = s.social || {};
    const socialIcons = { facebook: 'f', instagram: '✳', twitter: '𝕏' };
    const socialEl = d.getElementById('footerSocial');
    if (socialEl) {
      socialEl.innerHTML = ['facebook', 'instagram', 'twitter']
        .filter(k => social[k])
        .map(k => `<a href="${social[k]}" target="_blank" rel="noopener" aria-label="${k}">${socialIcons[k] || '●'}</a>`)
        .join('');
    }
    set('#footerYear', new Date().getFullYear());
  }

  // ---------------------------------------------------------
  // TOUR d'accueil
  // ---------------------------------------------------------
  views['/'] = async () => {
    const { settings } = state;
    const heroImg = 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4';
    let signature = '';
    try {
      const dishes = await API.getDishes();
      const featured = dishes.filter(d => d.rating && d.rating >= 4.5).slice(0, 3);
      const picks = featured.length >= 3 ? featured : dishes.slice(0, 3);
      signature = `
        <section class="section" id="signature">
          <div class="container">
            <div class="accent center">
              <span class="eyebrow center">Nos signatures</span>
              <h2 class="section-title reveal">Les créations qui font <span class="accent">notre réputation</span></h2>
            </div>
            <div class="signature-grid">
              ${picks.map((d, i) => `
                <article class="dish-card reveal" data-delay="${i + 1}" style="--i:${i}" onclick="location.hash='#/menu'">
                  <img src="${d.image || FALLBACK_IMG}" alt="${esc(d.name)}" loading="lazy">
                  <div class="dish-card-overlay">
                    <span class="dish-cat">${esc(catLabel(d.category))}</span>
                    <h3 class="dish-name">${esc(d.name)}</h3>
                    <p class="dish-more">${esc(d.description)}</p>
                    <div style="margin-top:12px;color:var(--gold-light);font-weight:600">${formatFCFA(d.price)}</div>
                  </div>
                </article>`).join('')}
            </div>
            <div style="text-align:center;margin-top:50px">
              <a href="#/menu" class="btn btn-ghost reveal">Découvrir tout le menu</a>
            </div>
          </div>
        </section>`;
    } catch {
      signature = '';
    }

    render(`
      <!-- HERO -->
      <section class="hero">
        <div class="hero-media"><img src="${heroImg}" alt="" data-parallax="0.25" /></div>
        <div class="hero-overlay"></div>
        <div class="hero-content">
          <p class="hero-kicker">Restaurant Gastronomique · Dakar</p>
          <h1 class="hero-title">L'excellence<br>a le goût <span class="italic">d'KaayLeek</span></h1>
          <p class="hero-subtitle">Une cuisine sénégalaise d'exception, sublimée par des techniques modernes — dans un écrin de lumière dorée et d'épices.</p>
          <div class="hero-cta">
            <a href="#/reservation" class="btn btn-gold">Réserver une table</a>
            <a href="#/menu" class="btn btn-outline">Explorer le menu</a>
          </div>
        </div>
        <div class="hero-scroll"><span>Défiler</span><div class="mouse"></div></div>
      </section>

      <!-- INTRO -->
      <section class="intro-band">
        <div class="container">
          <span class="eyebrow center reveal">Bienvenue chez KaayLeek</span>
          <h2 class="section-title reveal">Là où la tradition sénégalaise<br>rencontre la haute gastronomie</h2>
          <p class="reveal">Depuis 2015, notre chef et son équipe composent des assiettes sincères, entièrement pensées autour des trésors du terroir sénégalais : thiéboudienne, yassa, épices de la Casamance et poissons de l'Atlantique.</p>
          <a href="#/a-propos" class="btn btn-dark reveal">Notre histoire</a>

          <div class="stats">
            <div class="stat reveal" data-delay="1"><div class="stat-number">10+</div><div class="stat-label">Années d'excellence</div></div>
            <div class="stat reveal" data-delay="2"><div class="stat-number">4.8<span style="font-size:1.2rem;color:var(--gold)">★</span></div><div class="stat-label">Note moyenne</div></div>
            <div class="stat reveal" data-delay="3"><div class="stat-number">60k</div><div class="stat-label">Gourmets servis</div></div>
            <div class="stat reveal" data-delay="4"><div class="stat-number">15</div><div class="stat-label">Plats signature</div></div>
          </div>
        </div>
      </section>

      ${signature}

      <!-- CITATION -->
      <section class="quote-section section-dark">
        <div class="quote-bg"><img src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0" alt="" data-parallax="0.15"></div>
        <div class="container quote-content">
          <span class="eyebrow center reveal" style="color:var(--gold-light)">L'art de la table</span>
          <blockquote class="blockquote reveal">« Un grand restaurant n'est pas seulement un lieu où l'on mange. C'est une émotion que l'on choisit, une parenthèse où chaque détail — la lumière, la porcelaine, le geste — nous transporte. »</blockquote>
          <p class="quote-author reveal">— Le Chef exécutif</p>
        </div>
      </section>

      <!-- APPEL RÉSERVATION -->
      <section class="section" style="text-align:center">
        <div class="container">
          <span class="eyebrow center reveal">Réservez votre table</span>
          <h2 class="section-title reveal" style="max-width:700px;margin:0 auto">Offrez-vous une soirée <span class="accent">inoubliable</span></h2>
          <p class="section-sub reveal" style="margin:20px auto 40px">Rejoignez-nous pour une expérience culinaire complète. Nos tables sont limitées pour préserver l'intimité de chaque dîner.</p>
          <a href="#/reservation" class="btn btn-gold reveal" style="font-size:1rem;padding:20px 46px">Réserver une table →</a>
        </div>
      </section>
    `);
  };

  // ---------------------------------------------------------
  // Helper catégorie
  // ---------------------------------------------------------
  function catLabel(c) {
    return ({ entree: 'Entrée', plat: 'Plat', dessert: 'Dessert', boisson: 'Boisson', })[c] || c;
  }

  // =========================================================
  // PAGE MENU
  // =========================================================
  views['/menu'] = async (param) => {
    const activeCat = param || 'all';
    let dishes = [];
    try { dishes = await API.getDishes(); } catch (e) { toast(e.message, 'error'); }

    const order = ['plat', 'entree', 'dessert', 'boisson'];
    const cats = ['all', ...order];
    const counts = { all: dishes.length };
    order.forEach(c => counts[c] = dishes.filter(d => d.category === c).length);
    const catRank = { plat: 0, entree: 1, dessert: 2, boisson: 3 };
    const filter = (activeCat === 'all' ? [...dishes] : dishes.filter(d => d.category === activeCat))
      .sort((a, b) => (catRank[a.category] ?? 9) - (catRank[b.category] ?? 9));

    render(`
      <section class="page-hero">
        <img class="page-hero-bg" src="https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c" alt="">
        <div class="container">
          <span class="eyebrow">Notre carte</span>
          <h1>Le Menu</h1>
          <p>Une sélection évolutive au gré des saisons, composée par notre chef et ses équipes.</p>
        </div>
      </section>

      <div class="container">
        <div class="menu-categories">
          ${cats.map(c => `
            <button class="cat-btn ${activeCat === c ? 'active' : ''}" data-cat="${c}"
              onclick="location.hash='#/menu/${c}';event.preventDefault()">
              ${catLabel(c)} <span style="opacity:.6">(${counts[c]})</span>
            </button>`).join('')}
        </div>

        <div class="menu-grid" id="menuGrid">
          ${filter.map((d, i) => `
            <article class="menu-item" style="--i:${i % 9}">
              <div class="menu-item-img">
                <img src="${d.image || FALLBACK_IMG}" alt="${esc(d.name)}" loading="lazy">
                <span class="menu-item-badge">${catLabel(d.category)}</span>
                <span class="menu-item-price">${formatFCFA(d.price)}</span>
              </div>
              <div class="menu-item-body">
                <div class="menu-item-head"><h3>${esc(d.name)}</h3></div>
                <p class="menu-item-desc">${esc(d.description || '')}</p>
                <div class="menu-item-rating">
                  ${d.rating ? renderStars(d.rating, { showNum: true }) + `<span class="rating-num">(${d.ratingCount} avis)</span>` : '<span class="rating-num" style="color:rgba(43,43,38,.45)">Aucun avis pour le moment</span>'}
                  <a href="#/avis" class="btn-rate">Voir les avis →</a>
                </div>
                <div class="menu-item-actions">
                  <button class="btn btn-gold add-to-cart" type="button" data-dish="${JSON.stringify({ id: d.id, name: d.name, price: d.price, image: d.image }).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                    Ajouter au panier
                  </button>
                </div>
              </div>
            </article>`).join('')}
        </div>
      </div>
    `);
  };

  // =========================================================
  // PAGE À PROPOS
  // =========================================================
  views['/a-propos'] = async () => {
    render(`
      <section class="page-hero">
        <img class="page-hero-bg" src="https://images.unsplash.com/photo-1552566626-52f8b828add9" alt="">
        <div class="container">
          <span class="eyebrow">Notre histoire</span>
          <h1>À Propos</h1>
          <p>Une maison née d'une passion pour la gastronomie sénégalaise et l'art de recevoir.</p>
        </div>
      </section>

      <section class="section">
        <div class="container about-grid">
          <div class="about-images reveal reveal-right">
            <div class="main-img"><img src="https://images.unsplash.com/photo-1555396273-367ea4eb4db5" alt="La salle du restaurant"></div>
            <div class="float-img"><img src="https://images.unsplash.com/photo-1481833761820-0509d3217039" alt="Table dressée"></div>
          </div>
          <div class="about-text reveal reveal-left">
            <span class="eyebrow">Depuis 2015</span>
            <h2 class="section-title">Une maison, <span class="accent">une signature</span></h2>
            <p>KaayLeek est né en 2015 d'un constat simple : la cuisine sénégalaise, riche et généreuse, méritait un écrin à la hauteur de sa palette de saveurs. Nous avons imaginé un lieu où les grands classiques du terroir rencontrent les techniques les plus précises de la haute gastronomie.</p>
            <p>Chaque jour, nous sélectionnons avec soin nos produits auprès de producteurs locaux et de maraîchers partenaires. Le marché matinal guide la carte du soir : ici, la fraîcheur n'est pas un argument — c'est une discipline.</p>
            <div class="about-values">
              <div class="value-item reveal" data-delay="1"><div class="icon">✦</div><h4>Sincérité</h4><p>Des produits bruts, jamais trahis.</p></div>
              <div class="value-item reveal" data-delay="2"><div class="icon">◈</div><h4>Précision</h4><p>Des gestes maîtrisés au millimètre.</p></div>
              <div class="value-item reveal" data-delay="3"><div class="icon">❖</div><h4>Hospitalité</h4><p>Vous recevoir comme des invités d'honneur.</p></div>
            </div>
          </div>
        </div>
      </section>

      <section class="chef-section section">
        <div class="container chef-grid">
          <div class="chef-info reveal reveal-right">
            <span class="eyebrow">Le chef exécutif</span>
            <h2 class="section-title">Chef <span class="accent">Mamadou Sarr</span></h2>
            <p class="chef-role">Chef exécutif · MOF du Sénégal</p>
            <p>Formé dans les plus grandes maisons de Paris avant de revenir à ses racines, le chef Mamadou Sarr sublime les produits du terroir sénégalais avec une exigence toute française. Son thieboudienne de homard rôti a fait sa renommée.</p>
            <p>Pour lui, la cuisine est un langage : celui de la générosité, de la mémoire et du vivant. Il compose chaque assiette comme une partition, où la texture répond au parfum et où chaque élément a une raison d'être.</p>
            <div class="chef-sign">« Donner du goût à l'émotion. »</div>
          </div>
          <div class="chef-photo reveal reveal-left">
            <img src="/images/chef.jpg" alt="Le chef en cuisine">
          </div>
        </div>
      </section>

      <section class="section-dark section" style="text-align:center">
        <div class="container">
          <span class="eyebrow center reveal" style="color:var(--gold-light)">Notre philosophie</span>
          <h2 class="section-title reveal">Ambiance & Émotion</h2>
          <p class="section-sub reveal" style="margin:0 auto 40px;max-width:700px">Une lumière tamisée, une salle aux tons émeraude et or, une table dressée comme un tableau. Chez KaayLeek, l'ambiance est une seconde cuisine : elle prépare le palais avant même la première bouchée.</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px;max-width:900px;margin:0 auto">
            ${['Salle panoramique', 'Cave à vins & spiritueux', 'Terrasse ombragée', 'Événements privés'].map((t, i) => `<div class="reveal" data-delay="${i+1}" style="border:1px solid rgba(193,154,91,.3);border-radius:var(--radius);padding:24px;font-family:var(--font-display);font-size:1.15rem">${t}</div>`).join('')}
          </div>
        </div>
      </section>
    `);
  };

  // =========================================================
  // PAGE GALERIE
  // =========================================================
  views['/galerie'] = async () => {
    let photos = [];
    try { photos = await API.getGallery(); } catch {
      photos = fallbackGallery();
    }
    const tags = ['all', ...new Set(photos.map(p => p.tag).filter(Boolean))];

    render(`
      <section class="page-hero">
        <img class="page-hero-bg" src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0" alt="">
        <div class="container">
          <span class="eyebrow">Instantanés</span>
          <h1>Galerie</h1>
          <p>Un aperçu de nos assiettes, de notre salle et de nos coulisses.</p>
        </div>
      </section>

      <div class="container">
        <div class="gallery-filters">
          ${tags.map(t => `<button class="cat-btn ${t==='all'?'active':''}" onclick="filterGallery('${t}', this)">${t==='all'?'Tout':esc(t)}</button>`).join('')}
        </div>
        <div class="gallery-grid" id="galleryGrid">
          ${photos.map((p, i) => `
            <div class="gallery-item ${p.tag && p.tag !== 'boisson' && i % 4 === 0 ? 'wide' : ''}" style="--i:${i%8}" data-tag="${p.tag||'all'}" data-img="${p.image}" data-cap="${esc(p.caption||'')}">
              <img src="${p.image}" alt="${esc(p.caption||'')}" loading="lazy">
              <div class="gallery-caption"><span>${esc(p.caption || '')}</span></div>
            </div>`).join('')}
        </div>
      </div>

      <div class="lightbox" id="lightbox">
        <button class="lightbox-close" aria-label="Fermer">✕</button>
        <img id="lightboxImg" src="" alt="">
        <div class="lightbox-caption" id="lightboxCap"></div>
      </div>
    `);

    // Lightbox
    const lb = document.getElementById('lightbox');
    const lbImg = document.getElementById('lightboxImg');
    const lbCap = document.getElementById('lightboxCap');
    document.querySelectorAll('.gallery-item').forEach(item => {
      item.addEventListener('click', () => {
        lbImg.src = item.dataset.img;
        lbCap.textContent = item.dataset.cap;
        lb.classList.add('open');
        document.body.style.overflow = 'hidden';
      });
    });
    lb.querySelector('.lightbox-close').addEventListener('click', closeLb);
    lb.addEventListener('click', closeLb);
    function closeLb() { lb.classList.remove('open'); document.body.style.overflow = ''; }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLb(); });
  };

  function fallbackGallery() {
    return [
      { image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0', caption: 'Notre salle principale', tag: 'salle' },
      { image: 'https://images.unsplash.com/photo-1552566626-52f8b828add9', caption: 'Ambiance du soir', tag: 'salle' },
      { image: 'https://images.unsplash.com/photo-1559339352-11d035aa65de', caption: 'Homard rôti', tag: 'plat' },
      { image: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c', caption: 'Fondant chocolat', tag: 'dessert' },
      { image: 'https://images.unsplash.com/photo-1470337458703-46ad1756a187', caption: 'Cocktail signature', tag: 'boisson' },
    ];
  }

  // =========================================================
  // PAGE AVIS
  // =========================================================
  views['/avis'] = async (param, rest, query) => {
    const sort = (new URLSearchParams(query).get('sort') || 'recent').toLowerCase();
    let reviews = [];
    try {
      const params = {};
      if (sort !== 'recent') params.sort = sort;
      reviews = await API.getReviews(params);
    } catch (e) { toast(e.message, 'error'); }

    render(`
      <section class="page-hero">
        <img class="page-hero-bg" src="https://images.unsplash.com/photo-1556910103-1c02745aae4d" alt="">
        <div class="container">
          <span class="eyebrow">La voix de nos clients</span>
          <h1>Avis clients</h1>
          <p>Découvrez ce que nos gourmets pensent de l'expérience KaayLeek.</p>
        </div>
      </section>

      <div class="container">
        <div class="reviews-toolbar reveal">
          <div style="display:flex;gap:12px;align-items:center">
            <h2 style="font-size:1.8rem;color:var(--emerald-900)">${reviews.length > 0 ? avgStars(reviews) : ''}</h2>
            <div>
              <div>${starsBlock(avgRating(reviews))}</div>
              <div style="font-size:.8rem;color:rgba(43,43,38,.55)">Basé sur ${reviews.length} avis</div>
            </div>
          </div>
          <div style="display:flex;gap:12px">
            <select class="sort-select" id="sortSelect" onchange="location.hash='#/avis?sort='+this.value">
              <option value="recent" ${sort==='recent'?'selected':''}>Les plus récents</option>
              <option value="rating_desc" ${sort==='rating_desc'?'selected':''}>Meilleures notes</option>
              <option value="rating_asc" ${sort==='rating_asc'?'selected':''}>Notes croissantes</option>
              <option value="oldest" ${sort==='oldest'?'selected':''}>Les plus anciens</option>
            </select>
          </div>
        </div>

        <div id="reviewsList">
          ${reviews.length ? reviews.map(r => `
            <article class="review-card" style="--i:0">
              <div class="review-avatar">${esc((r.firstname || '?')[0])}</div>
              <div class="review-body">
                <div class="review-head">
                  <div>
                    <span class="review-name">${esc(r.firstname)} ${esc(r.lastname || '')}</span>
                    <span style="color:rgba(43,43,38,.5);font-size:.85rem"> · ${esc(r.dish_name)}</span>
                  </div>
                  <span class="review-date">${new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                </div>
                <div style="margin-bottom:8px">${starsBlock(r.rating)}</div>
                <p class="review-text">« ${esc(r.comment)} »</p>
              </div>
            </article>`).join('')
          : `<div class="review-empty"><div class="big">✦</div><p>Aucun avis publié pour le moment.</p></div>`}
        </div>
      </div>
    `);
  };

  function avgRating(reviews) { return reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : 0; }
  function avgStars(reviews) { const a = avgRating(reviews); return `<span style="color:var(--gold-dark)">${a.toFixed(1)}</span>/5`; }
  function starsBlock(n) { let s = ''; for (let i = 1; i <= 5; i++) s += `<span style="color:${i <= Math.round(n) ? 'var(--gold)' : 'rgba(43,43,38,.2)'}">★</span>`; return s; }

  // =========================================================
  // PAGE CONTACT
  // =========================================================
  views['/contact'] = async () => {
    const s = state.settings || {};
    render(`
      <section class="page-hero">
        <img class="page-hero-bg" src="https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c" alt="">
        <div class="container">
          <span class="eyebrow">Prenons contact</span>
          <h1>Contact</h1>
          <p>Une question, un événement privé, une réservation de groupe ? Écrivez-nous.</p>
        </div>
      </section>

      <section class="section">
        <div class="container">
          <div class="contact-grid">
            <div class="contact-info">
              <div class="contact-card reveal"><div class="icon">${ICONS.pin}</div><div><h4>Adresse</h4><p>${esc(s['site.address'])},<br>${esc(s['site.city'])}</p></div></div>
              <div class="contact-card reveal" data-delay="1"><div class="icon">${ICONS.phone}</div><div><h4>Téléphone</h4><p>${esc(s['site.phone'])}</p></div></div>
              <div class="contact-card reveal" data-delay="2"><div class="icon">${ICONS.mail}</div><div><h4>Email</h4><p>${esc(s['site.email'])}</p></div></div>
              <div class="contact-card reveal" data-delay="3"><div class="icon">${ICONS.clock}</div><div><h4>Horaires</h4>
                <div class="hours-list" style="margin-top:8px">
                  ${Object.entries(s).filter(([k]) => k.startsWith('hours.')).map(([k, v]) => `<div class="hours-row"><span class="day">${k.split('.')[1]}</span><span class="time">${esc(v)}</span></div>`).join('')}
                </div>
              </div></div>
            </div>
            <div>
              <div class="form-card reveal reveal-right">
                <h2 style="font-size:1.7rem;color:var(--emerald-900);margin-bottom:20px">Envoyez-nous un message</h2>
                <form id="contactForm" novalidate>
                  <div class="form-row">
                    <div class="form-group"><label class="form-label" for="cname">Nom complet</label><input class="form-input" id="cname" name="name" placeholder="Votre nom" /></div>
                    <div class="form-group"><label class="form-label" for="cemail">Email</label><input class="form-input" id="cemail" type="email" name="email" placeholder="vous@exemple.com" /></div>
                  </div>
                  <div class="form-group"><label class="form-label" for="cmsg">Message</label><textarea class="form-textarea" id="cmsg" name="message" placeholder="Votre message..."></textarea><small class="error-hint" id="cmsgErr"></small></div>
                  <button type="submit" class="btn btn-dark btn-block" id="contactSubmit">Envoyer le message</button>
                </form>
              </div>
            </div>
          </div>

          <div class="map-embed reveal" style="margin-top:50px">
            <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3859.6!2d-17.4404!3d14.6928!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTTCsDQxJzM0LjEiTiAxN8KwMjYnMTcuMiJX!5e0!3m2!1sfr!2ssn!4v1700000000000" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Localisation KaayLeek"></iframe>
          </div>
        </div>
      </section>
    `);

    document.getElementById('contactForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const name = f.name.value.trim(), email = f.email.value.trim(), message = f.message.value.trim();
      const err = document.getElementById('cmsgErr');
      if (!name || name.length < 2) return showFormError(f.name, err, 'Veuillez entrer votre nom.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showFormError(f.email, err, 'Email invalide.');
      if (message.length < 10) return showFormError(f.message, err, 'Votre message doit contenir au moins 10 caractères.');
      f.name.classList.remove('input-error'); f.email.classList.remove('input-error'); f.message.classList.remove('input-error'); err.textContent = '';
      const btn = document.getElementById('contactSubmit');
      btn.disabled = true; btn.textContent = 'Envoi...';
      try {
        const r = await API.sendContact({ name, email, message });
        toast(r.message, 'success');
        f.reset();
      } catch (ex) { toast(ex.message, 'error'); }
      btn.disabled = false; btn.textContent = 'Envoyer le message';
    });
  };

  // =========================================================
  // PAGE RÉSERVATION
  // =========================================================
  views['/reservation'] = async () => {
    const user = User.get();
    const today = new Date().toISOString().slice(0, 10);
    render(`
      <section class="page-hero">
        <img class="page-hero-bg" src="https://images.unsplash.com/photo-1552566626-52f8b828add9" alt="">
        <div class="container">
          <span class="eyebrow">Votre soirée</span>
          <h1>Réserver une table</h1>
          <p>Composez votre réservation en quelques instants. Confirmation par notre équipe sous 24h.</p>
        </div>
      </section>

      <section class="section">
        <div class="container booking-layout">
          <div>
            <div class="form-card reveal reveal-left" id="resvFormWrap">
              <h2 style="font-size:1.8rem;color:var(--emerald-900);margin-bottom:6px">Renseignez vos informations</h2>
              <p style="color:rgba(43,43,38,.6);margin-bottom:24px">Les champs marqués * sont obligatoires.</p>
              <form id="resvForm" novalidate>
                <div class="form-row">
                  <div class="form-group"><label class="form-label">Nom complet *</label><input class="form-input" id="rName" value="${user ? esc(user.firstname + ' ' + user.lastname) : ''}" placeholder="Votre nom" /><small style="color:#d05a45" id="rNameErr"></small></div>
                  <div class="form-group"><label class="form-label">Téléphone *</label><input class="form-input" id="rPhone" placeholder="+221 76 000 00 00" /><small style="color:#d05a45" id="rPhoneErr"></small></div>
                </div>
                <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="rEmail" type="email" value="${user ? esc(user.email) : ''}" placeholder="pour recevoir la confirmation" /></div>
                <div class="form-row">
                  <div class="form-group"><label class="form-label">Date *</label><input class="form-input" id="rDate" type="date" min="${today}" /><small style="color:#d05a45" id="rDateErr"></small></div>
                  <div class="form-group"><label class="form-label">Heure *</label><input class="form-input" id="rTime" type="time" min="11:30" max="23:30" /><small style="color:#d05a45" id="rTimeErr"></small></div>
                </div>
                <div class="form-row">
                  <div class="form-group"><label class="form-label">Nombre de personnes *</label><select class="form-select" id="rPeople">${Array.from({length:20},(_,i)=>`<option value="${i+1}">${i+1} ${i===0?'personne':'personnes'}</option>`).join('')}</select></div>
                </div>
                <div class="form-group"><label class="form-label">Demandes spéciales</label><textarea class="form-textarea" id="rSpecial" placeholder="Allergies, occasion spéciale, table à côté de la fenêtre..."></textarea></div>
                <small style="color:#d05a45;display:block;margin-bottom:12px" id="rGlobalErr"></small>
                <button type="submit" class="btn btn-gold btn-block" id="resvSubmit">Confirmer la réservation</button>
              </form>
            </div>

            <div class="confirmation" id="resvConfirm" style="display:none">
              <div class="check">✓</div>
              <h3>Réservation enregistrée !</h3>
              <p id="cfMsg">Votre demande a bien été reçue.</p>
              <p>Notre équipe vous enverra une confirmation sous 24h.</p>
              <p class="ref" id="cfRef"></p>
              <a href="#/" class="btn btn-outline">Retour à l'accueil</a>
              ${user ? '<a href="#/compte" class="btn btn-dark" style="margin-left:10px">Voir mes réservations</a>' : ''}
            </div>
          </div>

          <div class="booking-side">
            <div class="form-card reveal reveal-right" style="background:var(--emerald-950);color:var(--ivory)">
              <h2 style="font-size:1.6rem;color:var(--ivory);margin-bottom:14px">Informations pratiques</h2>
              <p style="opacity:.75;font-size:.92rem;margin-bottom:22px">Pour un service optimal, nous vous recommandons de réserver au moins 24h à l'avance.</p>
              <div style="display:grid;gap:16px">
                <div style="border-top:1px solid rgba(255,255,255,.15);padding-top:16px"><div style="color:var(--gold);font-size:.72rem;letter-spacing:.18em;text-transform:uppercase;margin-bottom:6px">Horaires d'ouverture</div>
                  <div class="hours-list">
                    ${Object.entries(state.settings || {}).filter(([k]) => k.startsWith('hours.')).map(([k, v]) => `<div class="hours-row"><span class="day" style="color:rgba(246,241,231,.7)">${k.split('.')[1]}</span><span class="time">${esc(v)}</span></div>`).join('')}
                  </div>
                </div>
                <div style="border-top:1px solid rgba(255,255,255,.15);padding-top:16px"><div style="color:var(--gold);font-size:.72rem;letter-spacing:.18em;text-transform:uppercase;margin-bottom:6px">Tenue</div><p style="opacity:.75;font-size:.9rem">Tenue chic recommandée.</p></div>
                <div style="border-top:1px solid rgba(255,255,255,.15);padding-top:16px"><div style="color:var(--gold);font-size:.72rem;letter-spacing:.18em;text-transform:uppercase;margin-bottom:6px">Annulation</div><p style="opacity:.75;font-size:.9rem">Annulation gratuite jusqu'à 6h avant.</p></div>
              </div>
            </div>
          </div>
        </div>
      </section>
    `);

    document.getElementById('resvForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('rName').value.trim();
      const phone = document.getElementById('rPhone').value.trim();
      const email = document.getElementById('rEmail').value.trim();
      const date = document.getElementById('rDate').value;
      const time = document.getElementById('rTime').value;
      const people = document.getElementById('rPeople').value;
      const special = document.getElementById('rSpecial').value.trim();
      const global = document.getElementById('rGlobalErr');
      ['rNameErr','rPhoneErr','rDateErr','rTimeErr'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ''; });
      global.textContent = '';
      [['rName', 'rNameErr'], ['rPhone', 'rPhoneErr']].forEach(([inp, err]) => { const el = document.getElementById(inp); if (el) el.classList.remove('input-error'); });
      if (name.length < 2) return showFormError(document.getElementById('rName'), document.getElementById('rNameErr'), 'Nom requis.');
      if (phone.length < 8) return showFormError(document.getElementById('rPhone'), document.getElementById('rPhoneErr'), 'Téléphone requis.');
      if (!date) return showFormError(document.getElementById('rDate'), document.getElementById('rDateErr'), 'Choisissez une date.');
      if (date < new Date().toISOString().slice(0,10)) return showFormError(document.getElementById('rDate'), document.getElementById('rDateErr'), 'Date non valide.');
      if (!time) return showFormError(document.getElementById('rTime'), document.getElementById('rTimeErr'), 'Choisissez une heure.');
      const btn = document.getElementById('resvSubmit');
      btn.disabled = true; btn.textContent = 'Traitement...';
      try {
        const r = await API.createReservation({ name, phone, email: email || undefined, people: Number(people), date, time, special_requests: special || undefined });
        document.getElementById('resvFormWrap').style.display = 'none';
        const cf = document.getElementById('resvConfirm');
        cf.style.display = 'block';
        document.getElementById('cfMsg').innerHTML = `Merci <strong>${esc(name)}</strong> ! Votre demande pour <strong>${people} ${Number(people)>1?'personnes':'personne'}</strong> le <strong>${esc(date)}</strong> à <strong>${esc(time)}</strong> a bien été reçue.`;
        document.getElementById('cfRef').textContent = `Référence : R-${r.id.toString().padStart(4,'0')}`;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (ex) { toast(ex.message, 'error'); }
      btn.disabled = false; btn.textContent = 'Confirmer la réservation';
    });
  };

  // =========================================================
  // PAGE COMMANDE EN LIGNE (checkout)
  // =========================================================
  views['/commande'] = async (param, rest) => {
    const items = Cart.get();
    const user = User.get();
    const today = new Date().toISOString().slice(0, 10);

    if (!items.length) {
      render(`
        <section class="page-hero"><img class="page-hero-bg" src="https://images.unsplash.com/photo-1504674900247-0877df9cc836" alt=""><div class="container"><span class="eyebrow">Commande en ligne</span><h1>Votre commande</h1></div></section>
        <section class="section"><div class="container">
          <div class="review-empty" style="background:#fff;border-radius:var(--radius-lg);box-shadow:var(--shadow-card);padding:50px">
            <div class="big">🛒</div>
            <h3 style="font-family:var(--font-display);font-size:1.6rem;color:var(--emerald-900);margin-bottom:8px">Votre panier est vide</h3>
            <p>Parcourez notre carte et ajoutez vos plats préférés avant de passer commande.</p>
            <a href="#/menu" class="btn btn-gold" style="margin-top:20px">Voir le menu</a>
          </div>
        </div></section>
      `);
      return;
    }

    const subtotal = Cart.subtotal();
    const DELIVERY_FEE = 1500;

    render(`
      <section class="page-hero">
        <img class="page-hero-bg" src="https://images.unsplash.com/photo-1504674900247-0877df9cc836" alt="">
        <div class="container">
          <span class="eyebrow">Commande en ligne</span>
          <h1>Finaliser ma commande</h1>
          <p>Choisissez la livraison ou le retrait, puis votre mode de paiement.</p>
        </div>
      </section>

      <section class="section">
        <div class="container checkout-layout">
          <div>
            <div class="form-card reveal reveal-left">
              <h2 style="font-size:1.7rem;color:var(--emerald-900);margin-bottom:6px">Vos informations</h2>
              <p style="color:rgba(43,43,38,.6);margin-bottom:22px">Champs marqués * obligatoires.</p>
              <form id="orderForm" novalidate>
                <div class="form-row">
                  <div class="form-group"><label class="form-label">Nom complet *</label><input class="form-input" id="oName" value="${user ? esc(user.firstname + ' ' + user.lastname) : ''}" placeholder="Votre nom" /></div>
                  <div class="form-group"><label class="form-label">Téléphone *</label><input class="form-input" id="oPhone" placeholder="+221 76 000 00 00" /></div>
                </div>
                <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="oEmail" type="email" value="${user ? esc(user.email) : ''}" placeholder="pour le suivi de commande" /></div>

                <div class="form-group">
                  <label class="form-label">Type de commande *</label>
                  <div class="pay-types" id="orderType">
                    <label class="pay-option active"><input type="radio" name="otype" value="delivery" checked> 🛵 Livraison à domicile</label>
                    <label class="pay-option"><input type="radio" name="otype" value="pickup"> 🏪 Retrait au restaurant</label>
                  </div>
                </div>

                <div class="form-group" id="addrGroup">
                  <label class="form-label">Adresse de livraison *</label>
                  <input class="form-input" id="oAddr" placeholder="Quartier, rue, repère..." />
                  <small style="color:#d05a45" id="oAddrErr"></small>
                </div>

                <div class="form-group">
                  <label class="form-label">Mode de paiement *</label>
                  <div class="pay-types" id="payTypes">
                    <label class="pay-option"><input type="radio" name="opay" value="cash" checked> 💵 Paiement à la livraison / sur place</label>
                    <label class="pay-option"><input type="radio" name="opay" value="mobile_money"> 📱 Mobile Money (OM / MTN / Wave)</label>
                  </div>
                </div>

                <div class="form-group" id="mmGroup" style="display:none">
                  <label class="form-label">Numéro Mobile Money *</label>
                  <input class="form-input" id="oMM" placeholder="+221 76 XX XX XX XX" />
                  <small class="form-hint">Le paiement sera confirmé par notre équipe avant préparation.</small>
                </div>

                <div class="form-group"><label class="form-label">Note pour le restaurant</label><textarea class="form-textarea" id="oNote" placeholder="Allergies, instructions de livraison..."></textarea></div>

                <small style="color:#d05a45;display:block;margin-bottom:12px" id="oErr"></small>
                <button type="submit" class="btn btn-gold btn-block" id="orderSubmit" style="padding:18px">Confirmer la commande — ${formatFCFA(subtotal + DELIVERY_FEE)}</button>
              </form>
            </div>
          </div>

          <aside>
            <div class="order-summary reveal reveal-right" id="orderSummary">
              <h3>Récapitulatif</h3>
              ${items.map(it => `<div class="order-sum-item"><span><span class="q">${it.qty}×</span>${esc(it.name)}</span><span>${formatFCFA(it.price * it.qty)}</span></div>`).join('')}
              <div class="order-sum-item"><span>Sous-total</span><span>${formatFCFA(subtotal)}</span></div>
              <div class="order-sum-item" id="feeRow"><span>Livraison</span><span>${formatFCFA(DELIVERY_FEE)}</span></div>
              <div class="order-sum-total"><span>Total</span><span>${formatFCFA(subtotal + DELIVERY_FEE)}</span></div>
              <a href="#/menu" class="btn btn-outline btn-block" style="margin-top:20px">Ajouter d'autres plats</a>
            </div>
          </aside>
        </div>

        <div class="confirmation" id="orderConfirm" style="display:none;max-width:640px;margin:0 auto">
          <div class="check">✓</div>
          <h3>Commande enregistrée !</h3>
          <p id="orderConfirmMsg"></p>
          <p>Notre équipe vous contactera par téléphone pour confirmer la préparation et le paiement.</p>
          <p class="ref" id="orderRef"></p>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
            <a href="#/" class="btn btn-outline">Accueil</a>
            ${user ? '<a href="#/compte/commandes" class="btn btn-dark">Suivre ma commande</a>' : ''}
          </div>
        </div>
      </section>
    `);

    // Logique type commande (livraison / retrait)
    document.querySelectorAll('input[name="otype"]').forEach(r => r.addEventListener('change', () => {
      const isDelivery = document.querySelector('input[name="otype"]:checked').value === 'delivery';
      document.getElementById('addrGroup').style.display = isDelivery ? '' : 'none';
      document.getElementById('feeRow').style.display = isDelivery ? '' : 'none';
      updateOrderButton();
    }));

    // Logique paiement
    document.querySelectorAll('input[name="opay"]').forEach(r => r.addEventListener('change', () => {
      const isMM = document.querySelector('input[name="opay"]:checked').value === 'mobile_money';
      document.getElementById('mmGroup').style.display = isMM ? '' : 'none';
    }));

    function updateOrderButton() {
      const isDelivery = document.querySelector('input[name="otype"]:checked').value === 'delivery';
      const total = subtotal + (isDelivery ? DELIVERY_FEE : 0);
      const btn = document.getElementById('orderSubmit');
      if (btn) btn.textContent = `Confirmer la commande — ${formatFCFA(total)}`;
      const sumTotal = document.querySelector('.order-sum-total span:last-child');
      if (sumTotal) sumTotal.textContent = formatFCFA(total);
    }

    document.getElementById('orderForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      document.getElementById('oErr').textContent = '';
      const name = document.getElementById('oName').value.trim();
      const phone = document.getElementById('oPhone').value.trim();
      const email = document.getElementById('oEmail').value.trim();
      const type = document.querySelector('input[name="otype"]:checked').value;
      const address = document.getElementById('oAddr').value.trim();
      const payment = document.querySelector('input[name="opay"]:checked').value;
      const mm = document.getElementById('oMM').value.trim();
      const note = document.getElementById('oNote').value.trim();

      if (name.length < 2) return showFormError(document.getElementById('oName'), document.getElementById('oErr'), 'Nom requis.');
      if (phone.length < 8) return showFormError(null, document.getElementById('oErr'), 'Téléphone invalide.');
      if (type === 'delivery' && address.length < 5) return showFormError(document.getElementById('oAddr'), document.getElementById('oAddrErr'), 'Adresse de livraison requise.');
      if (payment === 'mobile_money' && mm.length < 8) return showFormError(null, document.getElementById('oErr'), 'Numéro Mobile Money requis.');

      const btn = document.getElementById('orderSubmit');
      btn.disabled = true; btn.textContent = 'Traitement...';
      try {
        const order = await API.createOrder({
          customer_name: name, phone, email: email || undefined, type, address,
          payment, mobile_money: mm || undefined, items, note: note || undefined,
        });
        Cart.clear();
        document.querySelector('.checkout-layout').style.display = 'none';
        const cf = document.getElementById('orderConfirm');
        cf.style.display = 'block';
        const isDeliv = order.type === 'delivery';
        document.getElementById('orderConfirmMsg').innerHTML = `Merci <strong>${esc(name)}</strong> ! Votre commande de <strong>${formatFCFA(order.total)}</strong> a bien été enregistrée${isDeliv ? ' et sera livrée à : ' + esc(order.address || '') : ' et vous attend au restaurant'}.`;
        document.getElementById('orderRef').textContent = `Référence : C-${order.id.toString().padStart(4, '0')}`;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (ex) { showFormError(null, document.getElementById('oErr'), ex.message); }
      btn.disabled = false;
      btn.textContent = 'Confirmer la commande';
      updateOrderButton();
    });
  };

  // Espace client / compte
  views['/compte'] = async (param, rest) => {
    // Rest[0] = sous-onglet (profil | reservations | avis)
    const subArg = rest && rest.length ? rest[0] : (param || '');
    const sub = ['profil', 'reservations', 'avis', 'commandes'].includes(subArg) ? subArg : 'accueil';
    await renderAccount(sub);
  };

  async function renderAccount(sub = 'accueil') {
    if (!User.isLogged()) { renderAuth(); return; }
    let me = null;
    try { me = await API.me(); } catch { User.clear(); renderAuth(); return; }

    let reservations = [], reviews = [], orders = [];
    try { reservations = await API.myReservations(); } catch {}
    try { reviews = await API.myReviews(); } catch {}
    try { orders = await API.myOrders(); } catch {}

    const upcoming = reservations.filter(r => !['cancelled','refused','completed'].includes(r.status));
    const past = reservations.filter(r => ['cancelled','refused','completed'].includes(r.status));

    let body = '';
    if (sub === 'profil' || sub === 'accueil') {
      body = `
        <div class="admin-panel">
          <h2>Mon profil</h2>
          <div class="profile-stats">
            <div class="stat-card"><div class="num">${upcoming.length}</div><div class="lbl">À venir</div></div>
            <div class="stat-card"><div class="num">${past.length}</div><div class="lbl">Passées</div></div>
            <div class="stat-card"><div class="num">${reviews.length}</div><div class="lbl">Avis laissés</div></div>
          </div>
          <form id="profileForm">
            <div class="form-row">
              <div class="form-group"><label class="form-label">Prénom</label><input class="form-input" id="pfName" value="${esc(me.firstname)}" /></div>
              <div class="form-group"><label class="form-label">Nom</label><input class="form-input" id="pfLast" value="${esc(me.lastname)}" /></div>
            </div>
            <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="pfEmail" type="email" value="${esc(me.email)}" disabled style="opacity:.6" /></div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Téléphone</label><input class="form-input" id="pfPhone" value="${esc(me.phone || '')}" placeholder="+221..." /></div>
              <div class="form-group"><label class="form-label">Adresse</label><input class="form-input" id="pfAddr" value="${esc(me.address || '')}" placeholder="Adresse" /></div>
            </div>
            <button class="btn btn-gold">Enregistrer</button>
          </form>
        </div>`;
    } else if (sub === 'reservations') {
      body = `
        <div class="admin-panel">
          <h2>Mes réservations</h2>
          ${renderResvList(upcoming, 'À venir')}
          ${renderResvList(past, 'Passées / terminées')}
        </div>`;
    } else if (sub === 'avis') {
      body = `
        <div class="admin-panel">
          <h2>Mes avis</h2>
          ${reviews.length ? reviews.map(r => `
            <div class="resv-card confirmed" style="justify-content:flex-start">
              <div style="flex:1">
                <h4>${esc(r.dish_name)}</h4>
                <div style="margin:6px 0">${starsBlock(r.rating)}</div>
                <p style="color:rgba(43,43,38,.7)">« ${esc(r.comment)} »</p>
                <small style="color:${statusColorRev(r.status)}">${r.status === 'approved' ? 'Publié' : r.status === 'hidden' ? 'Masqué par la modération' : 'En attente de modération'}</small>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="action-btn gold" onclick="openEditReview(${r.id})">Modifier</button>
                <button class="action-btn danger" onclick="deleteMyReview(${r.id})">Supprimer</button>
              </div>
            </div>`).join('') : `<div class="review-empty"><div class="big">✦</div><p>Vous n'avez pas encore laissé d'avis.</p><p>Rendez-vous sur la page Menu pour noter vos plats préférés.</p></div>`}
        </div>`;
    } else if (sub === 'commandes') {
      body = `
        <div class="admin-panel">
          <h2>Mes commandes</h2>
          ${orders.length ? orders.map(o => `
            <div class="resv-card ${o.status === 'cancelled' ? 'cancelled' : (o.status === 'delivered' || o.status === 'completed' ? 'confirmed' : 'pending')}" style="justify-content:flex-start">
              <div style="flex:1">
                <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center">
                  <h4>Commande C-${String(o.id).padStart(4, '0')} · ${formatFCFA(o.total)}</h4>
                  <span class="status-badge ${o.status === 'cancelled' ? 'cancelled' : (o.status === 'delivered' || o.status === 'completed' ? 'confirmed' : 'pending')}">${orderStatusLabel(o.status)}</span>
                </div>
                <div style="margin:8px 0 4px;font-size:.88rem;color:rgba(43,43,38,.65)">
                  ${o.items.map(it => `${it.name} ×${it.qty}`).join(', ')}
                </div>
                <p style="font-size:.8rem;color:rgba(43,43,38,.5)">
                  ${new Date(o.created_at).toLocaleString('fr-FR')} · ${o.type === 'delivery' ? 'Livraison' : 'Retrait'}
                  ${o.payment === 'mobile_money' ? ' · Mobile Money' : ''}
                </p>
                ${o.note ? `<p style="font-size:.85rem;color:var(--gold-dark)">✎ ${esc(o.note)}</p>` : ''}
              </div>
            </div>`).join('') : `<div class="review-empty"><div class="big">🛒</div><p>Vous n'avez pas encore passé de commande en ligne.</p><a href="#/menu" class="btn btn-gold" style="margin-top:16px">Commander maintenant</a></div>`}
        </div>`;
    }

    window.renderAccountHTML = () => {};
    const tabs = [
      { k: 'accueil', l: 'Mon profil' },
      { k: 'reservations', l: 'Mes réservations' },
      { k: 'commandes', l: 'Mes commandes' },
      { k: 'avis', l: 'Mes avis' },
    ];

    render(`
      <section class="page-hero" style="padding-bottom:60px">
        <img class="page-hero-bg" src="https://images.unsplash.com/photo-1552566626-52f8b828add9" alt="">
        <div class="container" style="text-align:left">
          <span class="eyebrow">Mon espace client</span>
          <h1>Bonjour, <span style="color:var(--gold-light)">${esc(me.firstname)}</span></h1>
        </div>
      </section>
      <section class="section" style="padding-top:50px">
        <div class="container account-layout">
          <aside class="account-nav">
            <div class="user-greet"><h4>${esc(me.firstname)} ${esc(me.lastname)}</h4><span>${esc(me.email)}</span></div>
            ${tabs.map(t => `<button class="${sub===t.k?'active':''}" onclick="location.hash='#/compte/${t.k}';event.preventDefault()">${t.l}</button>`).join('')}
            <button class="logout" onclick="logoutClient()">Se déconnecter</button>
          </aside>
          <div>${body}</div>
        </div>
      </section>
    `);

    // Bind profil form
    const pf = document.getElementById('profileForm');
    if (pf) pf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type=submit]');
      const firstname = document.getElementById('pfName').value.trim();
      const lastname = document.getElementById('pfLast').value.trim();
      const phone = document.getElementById('pfPhone').value.trim();
      const addr = document.getElementById('pfAddr').value.trim();
      btn.disabled = true; btn.textContent = 'Enregistrement...';
      try {
        const updated = await API.updateProfile({ firstname, lastname, phone: phone || undefined, address: addr || undefined });
        const stored = User.get();
        User.set(localStorage.getItem('kaayleek_token'), { ...(stored || {}), firstname: updated.firstname, lastname: updated.lastname });
        toast('Profil mis à jour avec succès.', 'success');
      } catch (ex) { toast(ex.message, 'error'); }
      btn.disabled = false; btn.textContent = 'Enregistrer';
    });

    // expose review edit/delete (avis dispos dans state.myReviews)
    state.myReviews = reviews;
    window.openEditReview = (id) => {
      const rv = (state.myReviews || []).find(r => r.id === id);
      if (!rv) return;
      const modal = document.createElement('div');
      modal.className = 'modal open';
      modal.innerHTML = `
        <div class="modal-card">
          <div class="modal-head"><h3>Modifier mon avis sur « ${esc(rv.dish_name)} »</h3><button class="modal-close" onclick="this.closest('.modal').remove()">✕</button></div>
          <form id="editReviewForm">
            <div class="form-group">
              <label class="form-label">Note</label>
              <div id="editStars" style="display:flex;gap:6px;font-size:1.8rem;color:var(--gold);cursor:pointer">
                ${[1,2,3,4,5].map(i => `<span data-v="${i}" style="color:${i <= rv.rating ? 'var(--gold)' : 'rgba(43,43,38,.2)'}">★</span>`).join('')}
              </div>
            </div>
            <div class="form-group"><label class="form-label">Commentaire</label><textarea class="form-textarea" id="erComment">${esc(rv.comment||'')}</textarea></div>
            <small style="color:#d05a45;display:block;margin-bottom:10px" id="erErr"></small>
            <button class="btn btn-gold btn-block">Enregistrer</button>
          </form>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
      let newRating = rv.rating;
      const stars = modal.querySelectorAll('#editStars span');
      stars.forEach(s => s.addEventListener('click', () => {
        newRating = Number(s.dataset.v);
        stars.forEach(x => x.style.color = Number(x.dataset.v) <= newRating ? 'var(--gold)' : 'rgba(43,43,38,.2)');
      }));
      document.getElementById('editReviewForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        document.getElementById('erErr').textContent = '';
        const comment = document.getElementById('erComment').value.trim();
        if (comment.length < 5) return showFormError(null, document.getElementById('erErr'), 'Commentaire trop court.');
        try {
          await API.updateMyReview(id, { rating: newRating, comment });
          toast('Avis modifié. Il sera à nouveau modéré.', 'success');
          setTimeout(() => location.reload(), 600);
        } catch (ex) { showFormError(null, document.getElementById('erErr'), ex.message); }
      });
    };
    window.deleteMyReview = async (id) => {
      if (!confirm('Supprimer définitivement cet avis ?')) return;
      try { await API.deleteMyReview(id); toast('Avis supprimé.', 'success'); setTimeout(() => location.reload(), 600); }
      catch (ex) { toast(ex.message, 'error'); }
    };
    // expose logout
    window.logoutClient = () => { User.clear(); toast('Vous êtes déconnecté.', 'info'); location.hash = '#/'; location.reload(); };
  }

  function renderResvList(list, title) {
    if (!list.length) return `<div style="margin:20px 0 30px;color:rgba(43,43,38,.5)"><h3 style="font-size:1.2rem;color:var(--emerald-900);margin-bottom:6px">${title}</h3><p>Aucune réservation.</p></div>`;
    return `<div style="margin:20px 0 30px"><h3 style="font-size:1.2rem;color:var(--emerald-900);margin-bottom:14px">${title}</h3>${list.map(r => `
      <div class="resv-card ${r.status}">
        <div class="resv-main">
          <h4>${r.people} personne${r.people>1?'s':''} · ${esc(r.date)} à ${esc(r.time)}</h4>
          ${r.special_requests ? `<p>✎ ${esc(r.special_requests)}</p>` : ''}
          <p style="font-size:.8rem;color:rgba(43,43,38,.5)">Réf R-${String(r.id).padStart(4,'0')} · ${esc(r.name)}</p>
        </div>
        <div class="resv-meta">
          <span class="status-badge ${r.status}">${statusLabel(r.status)}</span>
          <div style="margin-top:12px;display:flex;gap:8px">
            ${['pending','confirmed'].includes(r.status) ? `<button class="action-btn danger" onclick="cancelResv(${r.id})">Annuler</button>` : ''}
          </div>
        </div>
      </div>`).join('')}</div>`;
  }

  function statusLabel(s) { return ({ pending:'En attente', confirmed:'Confirmée', refused:'Refusée', completed:'Terminée', cancelled:'Annulée' })[s] || s; }
  function orderStatusLabel(s) { return ({ pending:'En attente', confirmed:'Confirmée', preparing:'En préparation', delivered:'En livraison', completed:'Terminée', cancelled:'Annulée' })[s] || s; }

  // ----------------- AUTH -----------------
  function renderAuth() {
    render(`
      <section class="page-hero">
        <img class="page-hero-bg" src="https://images.unsplash.com/photo-1552566626-52f8b828add9" alt="">
        <div class="container" style="text-align:left"><span class="eyebrow">Espace client</span><h1>Connexion</h1></div>
      </section>
      <section style="padding:60px 0 100px">
        <div class="container">
          <div class="auth-card">
            <div class="auth-tabs">
              <button class="auth-tab active" id="tabLogin" onclick="switchAuth('login')">Connexion</button>
              <button class="auth-tab" id="tabRegister" onclick="switchAuth('register')">Inscription</button>
            </div>
            <div id="loginForm">
              <form id="authFormLogin" novalidate>
                <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="lgEmail" type="email" placeholder="vous@exemple.com" /></div>
                <div class="form-group"><label class="form-label">Mot de passe</label><input class="form-input" id="lgPass" type="password" placeholder="••••••••" /></div>
                <small style="color:#d05a45;display:block;margin-bottom:12px" id="lgErr"></small>
                <button class="btn btn-gold btn-block">Se connecter</button>
              </form>
              <p style="margin-top:18px;font-size:.85rem;color:rgba(43,43,38,.55);text-align:center">Pas encore de compte ? <a href="javascript:void(0)" onclick="switchAuth('register')" style="color:var(--gold-dark)">Inscrivez-vous</a></p>
            </div>
            <div id="registerForm" style="display:none">
              <form id="authFormRegister" novalidate>
                <div class="form-row">
                  <div class="form-group"><label class="form-label">Prénom</label><input class="form-input" id="rgFirst" placeholder="Prénom" /></div>
                  <div class="form-group"><label class="form-label">Nom</label><input class="form-input" id="rgLast" placeholder="Nom" /></div>
                </div>
                <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="rgEmail" type="email" placeholder="vous@exemple.com" /></div>
                <div class="form-group"><label class="form-label">Téléphone</label><input class="form-input" id="rgPhone" placeholder="+221..." /></div>
                <div class="form-group"><label class="form-label">Mot de passe</label><input class="form-input" id="rgPass" type="password" placeholder="6 caractères min." /></div>
                <small style="color:#d05a45;display:block;margin-bottom:12px" id="rgErr"></small>
                <button class="btn btn-dark btn-block">Créer mon compte</button>
              </form>
            </div>
          </div>
        </div>
      </section>
    `);

    window.switchAuth = (mode) => {
      const isLogin = mode === 'login';
      document.getElementById('loginForm').style.display = isLogin ? '' : 'none';
      document.getElementById('registerForm').style.display = isLogin ? 'none' : '';
      document.getElementById('tabLogin').classList.toggle('active', isLogin);
      document.getElementById('tabRegister').classList.toggle('active', !isLogin);
    };

    document.getElementById('authFormLogin').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('lgEmail').value.trim();
      const pass = document.getElementById('lgPass').value;
      document.getElementById('lgErr').textContent = '';
      if (!email || !pass) return showFormError(null, document.getElementById('lgErr'), 'Remplissez tous les champs.');
      try {
        const r = await API.login(email, pass);
        if (r.user.role === 'admin') { toast('Compte administrateur : utilisez l\'espace admin.', 'info'); }
        User.set(r.token, r.user); toast('Connexion réussie. Bienvenue !', 'success'); location.hash = '#/compte'; location.reload();
      } catch (ex) { showFormError(null, document.getElementById('lgErr'), ex.message); }
    });

    document.getElementById('authFormRegister').addEventListener('submit', async (e) => {
      e.preventDefault();
      const g = () => document.getElementById('rgErr');
      g().textContent = '';
      const first = document.getElementById('rgFirst').value.trim();
      const last = document.getElementById('rgLast').value.trim();
      const email = document.getElementById('rgEmail').value.trim();
      const phone = document.getElementById('rgPhone').value.trim();
      const pass = document.getElementById('rgPass').value;
      if (first.length < 2 || last.length < 2) return showFormError(null, g(), 'Prénom et nom requis.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showFormError(null, g(), 'Email invalide.');
      if (pass.length < 6) return showFormError(null, g(), 'Mot de passe : 6 caractères min.');
      try {
        const r = await API.register({ firstname: first, lastname: last, email, phone, password: pass });
        User.set(r.token, r.user); toast('Compte créé ! Bienvenue.', 'success'); location.hash = '#/compte'; location.reload();
      } catch (ex) { showFormError(null, g(), ex.message); }
    });
  }

  function statusColorRev(s) { return s==='approved' ? '#4d7a3a' : s==='hidden' ? '#b04430' : 'var(--gold-dark)'; }

  // =========================================================
  // ADMIN
  // =========================================================
  let adminToken = Admin.getToken();

  async function renderAdmin(sub) {
    if (!adminToken) { renderAdminLogin(); return; }
    try { await API.admin.stats(); } catch { Admin.clear(); adminToken = null; renderAdminLogin(); return; }

    const section = sub || 'dashboard';
    let body = '';
    try {
      if (section === 'dashboard') body = await adminDashboard();
      else if (section === 'reservations') body = await adminReservations();
      else if (section === 'commandes') body = await adminOrders();
      else if (section === 'menu') body = await adminMenu();
      else if (section === 'avis') body = await adminReviews();
      else if (section === 'users') body = await adminUsers();
      else if (section === 'settings') body = await adminSettings();
      else body = await adminDashboard();
    } catch (e) { body = `<div class="admin-panel"><p style="color:#d05a45">${esc(e.message)}</p></div>`; }

    const items = [
      { k: 'dashboard', l: 'Tableau de bord' },
      { k: 'reservations', l: 'Réservations' },
      { k: 'commandes', l: 'Commandes' },
      { k: 'menu', l: 'Menu & Plats' },
      { k: 'avis', l: 'Modération des avis' },
      { k: 'users', l: 'Utilisateurs' },
      { k: 'settings', l: 'Contenu du site' },
    ];

    render(`
      <section class="page-hero" style="padding-bottom:50px">
        <img class="page-hero-bg" src="https://images.unsplash.com/photo-1552566626-52f8b828add9" alt="">
        <div class="container" style="text-align:left">
          <span class="eyebrow">Espace administrateur</span>
          <h1>Tableau de bord</h1>
        </div>
      </section>
      <section class="section" style="padding-top:40px">
        <div class="container admin-layout">
          <aside class="admin-nav">
            <div class="admin-title">KaayLeek Admin</div>
            ${items.map(i => `<button class="${section===i.k?'active':''}" onclick="location.hash='#/admin/${i.k}';event.preventDefault()">${i.l}</button>`).join('')}
            <button onclick="logoutAdmin()" style="color:#e0856f;margin-top:14px;border-top:1px solid rgba(255,255,255,.1);padding-top:16px">Déconnexion</button>
          </aside>
          <div>${body}</div>
        </div>
      </section>
    `);
    window.logoutAdmin = () => { Admin.clear(); adminToken = null; toast('Déconnecté.', 'info'); location.hash = '#/admin'; location.reload(); };
  }

  function renderAdminLogin() {
    render(`
      <section class="page-hero"><img class="page-hero-bg" src="https://images.unsplash.com/photo-1552566626-52f8b828add9" alt=""><div class="container" style="text-align:left"><span class="eyebrow">Administration</span><h1>Accès Admin</h1></div></section>
      <section style="padding:60px 0 100px"><div class="container">
        <div class="auth-card">
          <h2 style="font-size:1.6rem;color:var(--emerald-900);margin-bottom:20px">Connexion administrateur</h2>
          <form id="adminLoginForm">
            <div class="form-group"><label class="form-label">Identifiant (admin)</label><input class="form-input" id="adEmail" type="text" value="admin" placeholder="admin" /></div>
            <div class="form-group"><label class="form-label">Mot de passe</label><input class="form-input" id="adPass" type="password" placeholder="••••••••" /></div>
            <small style="color:#d05a45;display:block;margin-bottom:12px" id="adErr"></small>
            <button class="btn btn-gold btn-block">Accéder au back-office</button>
          </form>
        </div>
      </div></section>
    `);
    document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      document.getElementById('adErr').textContent = '';
      try {
        const r = await API.admin.login(document.getElementById('adEmail').value.trim(), document.getElementById('adPass').value);
        if (r.user.role !== 'admin') { document.getElementById('adErr').textContent = 'Ce compte n\'a pas les droits administrateur.'; return; }
        Admin.setToken(r.token); adminToken = r.token; toast('Bienvenue, admin.', 'success'); location.hash = '#/admin/dashboard'; location.reload();
      } catch (ex) { document.getElementById('adErr').textContent = ex.message; }
    });
  }

  async function adminDashboard() {
    const s = await API.admin.stats();
    return `
      <div class="admin-panel">
        <h2>Vue d'ensemble</h2>
        <div class="dash-cards">
          <div class="dash-card"><div class="dash-num">${s.reservationsToday}</div><div class="dash-lbl">Réservations aujourd'hui</div></div>
          <div class="dash-card gold"><div class="dash-num">${s.reservationsPending}</div><div class="dash-lbl">Réservations en attente</div></div>
          <div class="dash-card"><div class="dash-num">${s.reviewsPending}</div><div class="dash-lbl">Avis à modérer</div></div>
        </div>
        <div class="dash-cards" style="grid-template-columns:repeat(4,1fr)">
          <div class="stat-card"><div class="num">${s.usersTotal}</div><div class="lbl">Clients</div></div>
          <div class="stat-card"><div class="num">${s.dishesTotal}</div><div class="lbl">Plats actifs</div></div>
          <div class="stat-card"><div class="num">${s.reviewsApproved}</div><div class="lbl">Avis publiés</div></div>
          <div class="stat-card"><div class="num">${s.avgRating ? s.avgRating.toFixed(1) : '—'}</div><div class="lbl">Note moyenne</div></div>
        </div>
        <h2 style="font-size:1.3rem;margin-top:10px">Réservations du jour par heure</h2>
        ${s.hourly.length ? `<div class="admin-table" style="overflow-x:auto"><table><thead><tr><th>Heure</th><th>Nombre</th></tr></thead><tbody>${s.hourly.map(h => `<tr><td>${esc(h.time)}</td><td>${h.c}</td></tr>`).join('')}</tbody></table></div>` : '<p style="color:rgba(43,43,38,.5)">Aucune réservation prévue aujourd\'hui.</p>'}
      </div>`;
  }

  async function adminReservations() {
    const res = await API.admin.allReservations();
    const statFilters = ['pending', 'confirmed', 'refused', 'completed', 'cancelled'];
    return `
      <div class="admin-panel">
        <h2>Gestion des réservations</h2>
        <div class="pill-tabs" id="resvTabs">
          <button class="active" data-st="all">Toutes (${res.length})</button>
          ${statFilters.map(st => `<button data-st="${st}">${statusLabel(st)} (${res.filter(r=>r.status===st).length})</button>`).join('')}
        </div>
        <div style="overflow-x:auto">
        <table class="admin-table" id="resvTable">
          <thead><tr><th>Date</th><th>Heure</th><th>Nom</th><th>Tel</th><th>Pers.</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>${renderResvRows(res)}</tbody>
        </table>
        </div>
      </div>`;
    function renderResvRows(list) {
      return list.map(r => `<tr>
        <td>${esc(r.date)}</td><td>${esc(r.time)}</td>
        <td>${esc(r.name)}${r.user_id ? ' <span style="font-size:.7rem;color:var(--gold-dark)">✓ compte</span>' : ''}</td>
        <td>${esc(r.phone)}</td><td>${r.people}</td>
        <td><span class="status-badge ${r.status}">${statusLabel(r.status)}</span></td>
        <td style="white-space:nowrap">
          <button class="action-btn" onclick="setResvStatus(${r.id},'confirmed')">Confirmer</button>
          <button class="action-btn gold" onclick="setResvStatus(${r.id},'refused')">Refuser</button>
          <button class="action-btn gold" onclick="setResvStatus(${r.id},'completed')">Terminée</button>
          <button class="action-btn danger" onclick="delResv(${r.id})">Suppr.</button>
        </td></tr>`).join('');
    }
    // bind filters after injection
    setTimeout(() => {
      document.getElementById('resvTabs').querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#resvTabs button').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const st = btn.dataset.st;
          const rows = document.querySelectorAll('#resvTable tbody tr');
          rows.forEach(row => {
            const badge = row.querySelector('.status-badge');
            row.style.display = (st === 'all' || (badge && badge.classList.contains(st))) ? '' : 'none';
          });
        });
      });
    }, 0);
    window.setResvStatus = async (id, st) => { try { await API.admin.setReservationStatus(id, st); toast('Statut mis à jour.', 'success'); setTimeout(() => location.reload(), 500); } catch (e) { toast(e.message, 'error'); } };
    window.delResv = async (id) => { if (confirm('Supprimer cette réservation ?')) { try { await API.admin.deleteReservation(id); toast('Supprimée.', 'success'); setTimeout(() => location.reload(), 500); } catch (e) { toast(e.message, 'error'); } } };
  }

  async function adminOrders() {
    const orders = await API.admin.allOrders();
    const statFilters = ['pending', 'confirmed', 'preparing', 'delivered', 'completed', 'cancelled'];
    return `
      <div class="admin-panel">
        <h2>Gestion des commandes en ligne</h2>
        <div class="pill-tabs" id="ordTabs">
          <button class="active" data-st="all">Toutes (${orders.length})</button>
          ${statFilters.map(st => `<button data-st="${st}">${orderStatusLabel(st)} (${orders.filter(o=>o.status===st).length})</button>`).join('')}
        </div>
        <div style="overflow-x:auto">
        <table class="admin-table" id="ordTable">
          <thead><tr><th>Réf</th><th>Date</th><th>Client</th><th>Tel</th><th>Type</th><th>Total</th><th>Paiement</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>${orders.map(renderOrderRow).join('')}</tbody>
        </table>
        </div>
      </div>`;

    function renderOrderRow(o) {
      return `<tr>
        <td><strong>C-${String(o.id).padStart(4,'0')}</strong></td>
        <td>${new Date(o.created_at).toLocaleDateString('fr-FR')} ${new Date(o.created_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</td>
        <td>${esc(o.customer_name)}${o.email ? '<br><small>'+esc(o.email)+'</small>' : ''}</td>
        <td>${esc(o.phone)}</td>
        <td>${o.type === 'delivery' ? '🛵 Livraison' : '🏪 Retrait'}${o.address ? '<br><small>'+esc(o.address)+'</small>' : ''}</td>
        <td style="white-space:nowrap"><strong>${formatFCFA(o.total)}</strong></td>
        <td>${o.payment === 'mobile_money' ? '📱 MM<br><small>'+esc(o.mobile_money||'')+'</small>' : '💵 Cash'}</td>
        <td><span class="status-badge ${o.status}">${orderStatusLabel(o.status)}</span></td>
        <td style="white-space:nowrap">
          <button class="action-btn" onclick="setOrderStatus(${o.id},'confirmed')">Confirmer</button>
          <button class="action-btn gold" onclick="setOrderStatus(${o.id},'preparing')">Prépar.</button>
          ${o.type==='delivery' ? `<button class="action-btn gold" onclick="setOrderStatus(${o.id},'delivered')">Livré</button>` : `<button class="action-btn gold" onclick="setOrderStatus(${o.id},'completed')">Terminé</button>`}
          <button class="action-btn danger" onclick="setOrderStatus(${o.id},'cancelled')">Annuler</button>
        </td></tr>`;
    }
    // bind filters after injection
    setTimeout(() => {
      const tabsEl = document.getElementById('ordTabs');
      if (tabsEl) tabsEl.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#ordTabs button').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const st = btn.dataset.st;
          document.querySelectorAll('#ordTable tbody tr').forEach(row => {
            const badge = row.querySelector('.status-badge');
            row.style.display = (st === 'all' || (badge && badge.classList.contains(st))) ? '' : 'none';
          });
        });
      });
    }, 0);
    window.setOrderStatus = async (id, st) => { try { await API.admin.setOrderStatus(id, st); toast('Statut mis à jour.', 'success'); setTimeout(() => location.reload(), 500); } catch (e) { toast(e.message, 'error'); } };
    window.delOrder = async (id) => { if (confirm('Supprimer cette commande ?')) { try { await API.admin.deleteOrder(id); toast('Supprimée.', 'success'); setTimeout(() => location.reload(), 500); } catch (e) { toast(e.message, 'error'); } } };
  }

  async function adminMenu() {
    let dishes;
    try { dishes = await API.admin.allDishes(); }
    catch { dishes = await API.getDishes(); }
    return `
      <div class="admin-panel">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px">
          <h2>Menu & Plats</h2>
          <button class="btn btn-gold" onclick="openDishForm()">+ Ajouter un plat</button>
        </div>
        <div style="overflow-x:auto">
        <table class="admin-table">
          <thead><tr><th>Photo</th><th>Plat</th><th>Catégorie</th><th>Prix</th><th>Dispo</th><th>Actions</th></tr></thead>
          <tbody>${dishes.map(d => `<tr>
            <td><img class="td-img" src="${d.image || FALLBACK_IMG}" alt="" /></td>
            <td><strong>${esc(d.name)}</strong><br><small style="color:rgba(43,43,38,.55)">${esc((d.description||'').slice(0,40))}...</small></td>
            <td>${catLabel(d.category)}</td>
            <td>${formatFCFA(d.price)}</td>
            <td><span class="status-badge ${d.available?'confirmed':'cancelled'}">${d.available?'Dispo':'Indispo'}</span></td>
            <td style="white-space:nowrap">
              <button class="action-btn btn-edit-dish" type="button" data-edit="${JSON.stringify({ id: d.id, name: d.name, category: d.category, price: d.price, description: d.description, image: d.image, available: d.available }).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')}">Modifier</button>
              <button class="action-btn danger btn-del-dish" type="button" data-id="${d.id}">Suppr.</button>
            </td></tr>`).join('')}
          </tbody>
        </table>
        </div>
      </div>`;
  }

  // Plat actuellement édité (utilisé par la délégation du submit du formulaire)
  let editingDish = null;

  // Bind dish form (after modal is injected) — stored globally
  window.openDishForm = (dish) => {
    const d = dish || {};
    editingDish = d.id ? d : null;
    const modal = document.createElement('div');
    modal.className = 'modal open';
    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-head"><h3>${d.id ? 'Modifier un plat' : 'Ajouter un plat'}</h3><button class="modal-close" onclick="this.closest('.modal').remove()">✕</button></div>
        <form id="dishForm">
          <input type="hidden" id="dfId" value="${d.id || ''}">
          <div class="form-group"><label class="form-label">Nom du plat *</label><input class="form-input" id="dfName" value="${esc(d.name||'')}" /></div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Catégorie</label><select class="form-select" id="dfCat">
              ${['entree','plat','dessert','boisson'].map(c=>`<option value="${c}" ${d.category===c?'selected':''}>${catLabel(c)}</option>`).join('')}
            </select></div>
            <div class="form-group"><label class="form-label">Prix (FCFA) *</label><input class="form-input" id="dfPrice" type="number" min="0" value="${d.price||''}" /></div>
          </div>
          <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" id="dfDesc">${esc(d.description||'')}</textarea></div>
          <div class="form-group"><label class="form-label">Photo du plat</label>
            <div style="display:flex;gap:10px;align-items:stretch">
              <input class="form-input" id="dfImg" value="${esc(d.image||'')}" placeholder="Collez une URL d'image..." />
              <label class="btn btn-outline" style="cursor:pointer;white-space:nowrap;padding:12px 16px;flex-shrink:0">
                <input type="file" id="dfImgFile" accept="image/*" style="display:none" />
                Choisir un fichier
              </label>
            </div>
            <small class="form-hint" style="margin-top:6px">Collez une URL <em>ou</em> importez une image depuis votre ordinateur.</small>
            <img id="dfImgPrev" src="${esc(d.image||'')}" alt="" style="margin-top:12px;max-width:140px;max-height:110px;object-fit:cover;border-radius:10px;box-shadow:var(--shadow-card);${d.image?'':'display:none'}" />
          </div>
          <div class="form-group"><label class="form-label" style="display:flex;align-items:center;gap:10px;text-transform:none;letter-spacing:0"><input type="checkbox" id="dfAvail" ${d.available===undefined||d.available ? 'checked':''} /> Disponible sur le menu</label></div>
          <small style="color:#d05a45;display:block;margin-bottom:10px" id="dfErr"></small>
          <button class="btn btn-gold btn-block">${d.id ? 'Enregistrer' : 'Ajouter'}</button>
        </form>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    document.getElementById('dfImg').addEventListener('input', () => {
      const prev = document.getElementById('dfImgPrev');
      const v = document.getElementById('dfImg').value;
      if (prev) { prev.src = v; prev.style.display = v ? '' : 'none'; }
    });
    document.getElementById('dfImgFile').addEventListener('change', () => {
      const f = document.getElementById('dfImgFile').files[0];
      const prev = document.getElementById('dfImgPrev');
      if (!f || !prev) return;
      prev.src = URL.createObjectURL(f); prev.style.display = '';
    });

    // Le submit du formulaire plat est géré par délégation d'événement
    // (voir le gestionnaire 'submit' dans bindGlobalHandlers) pour plus de fiabilité.
  };
  window.delDish = async (id) => { if (confirm('Supprimer définitivement ce plat ?')) { try { await API.admin.deleteDish(id); toast('Plat supprimé.', 'success'); setTimeout(() => location.reload(), 500); } catch (e) { toast(e.message, 'error'); } } };

  async function adminReviews() {
    const reviews = await API.admin.allReviews();
    const groups = { pending: reviews.filter(r=>r.status==='pending'), approved: reviews.filter(r=>r.status==='approved'), hidden: reviews.filter(r=>r.status==='hidden') };
    const renderRow = (r) => `<tr>
      <td>${esc(r.firstname)} ${esc(r.lastname)}</td>
      <td>${esc(r.dish_name)}</td>
      <td>${starsBlock(r.rating)}</td>
      <td style="max-width:260px">${esc(r.comment)}</td>
      <td><span class="status-badge ${r.status}">${statusLabelRev(r.status)}</span></td>
      <td style="white-space:nowrap">
        <button class="action-btn" onclick="setRevStatus(${r.id},'approved')">Approuver</button>
        <button class="action-btn gold" onclick="setRevStatus(${r.id},'hidden')">Masquer</button>
        <button class="action-btn danger" onclick="delRev(${r.id})">Suppr.</button>
      </td></tr>`;
    return `
      <div class="admin-panel">
        <h2>Modération des avis</h2>
        <div class="dash-cards" style="grid-template-columns:repeat(3,1fr)">
          <div class="dash-card"><div class="dash-num">${groups.pending.length}</div><div class="dash-lbl">En attente</div></div>
          <div class="dash-card gold"><div class="dash-num">${groups.approved.length}</div><div class="dash-lbl">Publiés</div></div>
          <div class="dash-card"><div class="dash-num">${groups.hidden.length}</div><div class="dash-lbl">Masqués</div></div>
        </div>
        <div style="overflow-x:auto"><table class="admin-table">
          <thead><tr><th>Client</th><th>Plat</th><th>Note</th><th>Commentaire</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>${reviews.map(renderRow).join('')}</tbody>
        </table></div>
      </div>`;
    function statusLabelRev(s) { return s==='pending'?'En attente':s==='approved'?'Publié':'Masqué'; }
  }

  window.setRevStatus = async (id, st) => { try { await API.admin.setReviewStatus(id, st); toast('Avis mis à jour.', 'success'); setTimeout(() => location.reload(), 500); } catch (e) { toast(e.message, 'error'); } };
  window.delRev = async (id) => { if (confirm('Supprimer cet avis ?')) { try { await API.admin.deleteReview(id); toast('Avis supprimé.', 'success'); setTimeout(() => location.reload(), 500); } catch (e) { toast(e.message, 'error'); } } };

  async function adminUsers() {
    const users = await API.admin.users();
    return `
      <div class="admin-panel">
        <h2>Gestion des utilisateurs</h2>
        <div style="overflow-x:auto"><table class="admin-table">
          <thead><tr><th>Nom</th><th>Email</th><th>Téléphone</th><th>Rôle</th><th>Inscription</th><th>Statut</th><th>Action</th></tr></thead>
          <tbody>${users.map(u => `<tr>
            <td>${esc(u.firstname)} ${esc(u.lastname)}</td>
            <td>${esc(u.email)}</td><td>${esc(u.phone||'—')}</td>
            <td>${u.role === 'admin' ? 'Admin' : 'Client'}</td>
            <td>${new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
            <td><span class="status-badge ${u.active?'confirmed':'cancelled'}">${u.active?'Actif':'Désactivé'}</span></td>
            <td>${u.role==='admin' ? '—' : `<button class="action-btn ${u.active?'danger':'gold'}" onclick="toggleUser(${u.id},${u.active?0:1})">${u.active?'Désactiver':'Réactiver'}</button>`}</td>
          </tr>`).join('')}
        </tbody></table></div>
      </div>`;
  }
  window.toggleUser = async (id, active) => { try { await API.admin.setUserStatus(id, active); toast('Statut mis à jour.', 'success'); setTimeout(() => location.reload(), 500); } catch (e) { toast(e.message, 'error'); } };

  async function adminSettings() {
    const s = await API.admin.settings();
    return `
      <div class="admin-panel">
        <h2>Contenu du site</h2>
        <form id="settingsForm">
          <h3 style="font-size:1.2rem;color:var(--emerald-800);margin:16px 0 12px">Coordonnées</h3>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Nom du site</label><input class="form-input" name="site.name" value="${esc(s['site.name']||'')}" /></div>
            <div class="form-group"><label class="form-label">Slogan</label><input class="form-input" name="site.slogan" value="${esc(s['site.slogan']||'')}" /></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Adresse</label><input class="form-input" name="site.address" value="${esc(s['site.address']||'')}" /></div>
            <div class="form-group"><label class="form-label">Ville</label><input class="form-input" name="site.city" value="${esc(s['site.city']||'')}" /></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Téléphone</label><input class="form-input" name="site.phone" value="${esc(s['site.phone']||'')}" /></div>
            <div class="form-group"><label class="form-label">Email</label><input class="form-input" name="site.email" value="${esc(s['site.email']||'')}" /></div>
          </div>
          <h3 style="font-size:1.2rem;color:var(--emerald-800);margin:16px 0 12px">Horaires (12:00 - 23:00)</h3>
          <div class="form-row">
            ${['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'].map(day => `<div class="form-group"><label class="form-label">${day}</label><input class="form-input" name="hours.${day}" value="${esc(s['hours.'+day]||'')}" /></div>`).join('')}
          </div>
          <button class="btn btn-gold" style="margin-top:20px">Enregistrer les modifications</button>
        </form>
      </div>`;
  }

  // =========================================================
  // BOUTONNAGE GLOBAL
  // =========================================================
  if (!window.__kaayleekBound) {
    window.__kaayleekBound = true;
    window.addEventListener('hashchange', router);
    window.addEventListener('load', () => { setTimeout(() => { const p = document.getElementById('preloader'); if (p) p.classList.add('hidden'); }, 700); });
    initScrollEffects();
    bindGlobalHandlers();
    Cart.init();
    initFooter();
  }

  // Hook global : à la fin du chargement, on ajoute le filtre galerie
  window.filterGallery = (tag, el) => {
    document.querySelectorAll('.gallery-item').forEach(item => {
      item.style.display = (tag === 'all' || item.dataset.tag === tag) ? '' : 'none';
    });
    document.querySelectorAll('.gallery-filters .cat-btn').forEach(b => b.classList.remove('active'));
    el && el.classList.add('active');
  };

  // Annulation de réservation (utilisé dans le compte client)
  window.cancelResv = async (id) => {
    if (!confirm('Confirmer l\'annulation de cette réservation ?')) return;
    try { await API.cancelReservation(id); toast('Réservation annulée.', 'success'); setTimeout(() => location.reload(), 600); }
    catch (ex) { toast(ex.message, 'error'); }
  };

  router();
})();
