// public/js/api.js
// Couche d'accès à l'API : fetch avec token, gestion d'erreurs.

const API = {
  base: '/api',

  // Effectue une requête HTTP vers l'API.
  // auth : false  -> aucune route protégée (publique)
  //        true   -> route protégée client (token kaayleek_token)
  //        'admin'-> route protégée admin (token kaayleek_admin_token)
  async request(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    let token = null;
    if (auth === 'admin') token = localStorage.getItem('kaayleek_admin_token') || null;
    else if (auth === true) token = localStorage.getItem('kaayleek_token') || null;
    // auth === false => pas de token
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(this.base + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Une erreur est survenue.');
      err.status = res.status;
      throw err;
    }
    return data;
  },

  // Authentication
  login: (email, password) => API.request('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  register: (payload) => API.request('/auth/register', { method: 'POST', body: payload, auth: false }),
  me: () => API.request('/auth/me'),
  updateProfile: (payload) => API.request('/auth/me', { method: 'PUT', body: payload }),

  // Dishes (routes publiques — pas de token nécessaire)
  getDishes: () => API.request('/dishes', { auth: false }),
  getDish: (id) => API.request(`/dishes/${id}`, { auth: false }),

  // Reservations (client)
  createReservation: (payload) => API.request('/reservations', { method: 'POST', body: payload }),
  myReservations: () => API.request('/reservations/mine'),
  cancelReservation: (id) => API.request(`/reservations/${id}/cancel`, { method: 'PUT' }),
  updateReservation: (id, payload) => API.request(`/reservations/${id}`, { method: 'PUT', body: payload }),

  // Commandes en ligne
  createOrder: (payload) => API.request('/orders', { method: 'POST', body: payload }),
  myOrders: () => API.request('/orders/mine'),

  // Reviews
  getReviews: (params) => API.request(`/reviews${params ? '?' + new URLSearchParams(params) : ''}`),
  createReview: (payload) => API.request('/reviews', { method: 'POST', body: payload }),
  myReviews: () => API.request('/reviews/mine'),
  updateMyReview: (id, payload) => API.request(`/reviews/mine/${id}`, { method: 'PUT', body: payload }),
  deleteMyReview: (id) => API.request(`/reviews/mine/${id}`, { method: 'DELETE' }),

  // Settings publics
  getPublicSettings: () => API.request('/settings/public', { auth: false }),
  getGallery: () => API.request('/gallery/public', { auth: false }),

  // Contact
  sendContact: (payload) => API.request('/contact', { method: 'POST', body: payload, auth: false }),

  // ---------- Admin ----------
  // Toutes les routes admin utilisent le token admin (auth: 'admin').
  admin: {
    login: (email, password) => API.request('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
    stats: () => API.request('/admin/stats', { auth: 'admin' }),
    users: () => API.request('/admin/users', { auth: 'admin' }),
    setUserStatus: (id, active) => API.request(`/admin/users/${id}/status`, { method: 'PUT', body: { active }, auth: 'admin' }),
    settings: () => API.request('/admin/settings', { auth: 'admin' }),
    saveSettings: (settings) => API.request('/admin/settings', { method: 'PUT', body: settings, auth: 'admin' }),
    gallery: () => API.request('/admin/gallery', { auth: 'admin' }),
    addGallery: (payload) => API.request('/admin/gallery', { method: 'POST', body: payload, auth: 'admin' }),
    deleteGallery: (id) => API.request(`/admin/gallery/${id}`, { method: 'DELETE', auth: 'admin' }),

    // Menu (admin) — "all" liste tous les plats, y compris les indisponibles
    allDishes: () => API.request('/dishes/all', { auth: 'admin' }),
    addDish: (payload) => API.request('/dishes', { method: 'POST', body: payload, auth: 'admin' }),
    updateDish: (id, payload) => API.request(`/dishes/${id}`, { method: 'PUT', body: payload, auth: 'admin' }),
    deleteDish: (id) => API.request(`/dishes/${id}`, { method: 'DELETE', auth: 'admin' }),

    // Réservations (admin)
    allReservations: (params) => API.request(`/reservations${params ? '?' + new URLSearchParams(params) : ''}`, { auth: 'admin' }),
    setReservationStatus: (id, status) => API.request(`/reservations/${id}/status`, { method: 'PUT', body: { status }, auth: 'admin' }),
    deleteReservation: (id) => API.request(`/reservations/${id}`, { method: 'DELETE', auth: 'admin' }),

    // Avis (admin)
    allReviews: () => API.request('/reviews/all', { auth: 'admin' }),
    setReviewStatus: (id, status) => API.request(`/reviews/${id}/status`, { method: 'PUT', body: { status }, auth: 'admin' }),
    deleteReview: (id) => API.request(`/reviews/${id}`, { method: 'DELETE', auth: 'admin' }),

    // Commandes (admin)
    allOrders: (params) => API.request(`/orders${params ? '?' + new URLSearchParams(params) : ''}`, { auth: 'admin' }),
    setOrderStatus: (id, status) => API.request(`/orders/${id}/status`, { method: 'PUT', body: { status }, auth: 'admin' }),
    deleteOrder: (id) => API.request(`/orders/${id}`, { method: 'DELETE', auth: 'admin' }),

    // Upload d'image (FormData -> /api/upload), renvoie { url }
    uploadImage: async (file) => {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch(`${API.base}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('kaayleek_admin_token') || ''}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Échec de l'upload de l'image.");
      return data.url;
    },
  },
};

// Gestion uniforme des tokens (client vs admin)
const Admin = {
  setToken(t) { localStorage.setItem('kaayleek_admin_token', t); },
  getToken() { return localStorage.getItem('kaayleek_admin_token'); },
  clear() { localStorage.removeItem('kaayleek_admin_token'); },
};

const User = {
  set(t, u) { localStorage.setItem('kaayleek_token', t); localStorage.setItem('kaayleek_user', JSON.stringify(u)); },
  get() { try { return JSON.parse(localStorage.getItem('kaayleek_user')); } catch { return null; } },
  clear() { localStorage.removeItem('kaayleek_token'); localStorage.removeItem('kaayleek_user'); },
  isLogged() { return !!localStorage.getItem('kaayleek_token'); },
};
