/* ============================================================
   OilBridge — API Client Store
   Replaces localStorage with server-side REST API calls.
   Current user is cached locally for sync access.
   ============================================================ */

class Store {
  constructor() {
    this.token = localStorage.getItem('ob_token');
    this._currentUser = null;
    this.COMMISSION_RATE = 0.032;
  }

  async init() {
    if (this.token) await this.refreshUser();
  }

  // --- API Helper ---
  async api(method, path, body) {
    const opts = { method, headers: {} };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    if (this.token) opts.headers['Authorization'] = 'Bearer ' + this.token;
    try {
      const res = await fetch('/api' + path, opts);
      if (res.status === 401 && path !== '/auth/me') {
        this.clearSession();
        return null;
      }
      if (res.status === 204) return { success: true };
      const data = await res.json().catch(() => null);
      if (!res.ok) return { error: (data && data.error) || 'Request failed' };
      return data;
    } catch (err) {
      console.error('API error:', err);
      return { error: 'Network error' };
    }
  }

  clearSession() {
    this.token = null;
    this._currentUser = null;
    localStorage.removeItem('ob_token');
  }

  async refreshUser() {
    const user = await this.api('GET', '/auth/me');
    if (user && !user.error) {
      this._currentUser = user;
    } else {
      this.clearSession();
    }
  }

  // --- Sync (cached current user) ---
  getCurrentUser() { return this._currentUser; }
  isLoggedIn() { return !!this._currentUser; }
  isAdmin() { return !!(this._currentUser && this._currentUser.role === 'admin'); }
  isVerified() { return !!(this._currentUser && this._currentUser.kycStatus === 'verified'); }

  // --- Auth ---
  async login(email, password) {
    const res = await this.api('POST', '/auth/login', { email, password });
    if (res && res.token) {
      this.token = res.token;
      localStorage.setItem('ob_token', res.token);
      this._currentUser = res.user;
      return { success: true, user: res.user };
    }
    return { error: (res && res.error) || 'Login failed' };
  }

  async logout() {
    await this.api('POST', '/auth/logout');
    this.clearSession();
  }

  async createUser(data) {
    return await this.api('POST', '/auth/register', data);
  }

  // --- Users ---
  async getUsers() { return (await this.api('GET', '/users')) || []; }
  async getPendingUsers() { return (await this.api('GET', '/users?status=pending')) || []; }
  async getUser(id) { return await this.api('GET', '/users/' + id); }
  async updateUser(id, data) { return await this.api('PATCH', '/users/' + id, data); }

  // --- Listings ---
  async getListings(filters) {
    const params = new URLSearchParams();
    if (filters) {
      if (filters.type) params.set('type', filters.type);
      if (filters.oilType) params.set('oilType', filters.oilType);
      if (filters.search) params.set('search', filters.search);
      if (filters.sort) params.set('sort', filters.sort);
      if (filters.userId) params.set('userId', filters.userId);
      if (filters.limit) params.set('limit', filters.limit);
      if (filters.all) params.set('all', 'true');
    }
    const qs = params.toString();
    return (await this.api('GET', '/listings' + (qs ? '?' + qs : ''))) || [];
  }

  async getListing(id) { return await this.api('GET', '/listings/' + id); }
  async createListing(data) { return await this.api('POST', '/listings', data); }

  // --- Matches ---
  async getMatches() { return (await this.api('GET', '/matches')) || []; }
  async createMatch(data) { return await this.api('POST', '/matches', data); }
  async updateMatch(id, data) { return await this.api('PATCH', '/matches/' + id, data); }

  // --- Stats ---
  async getStats() { return (await this.api('GET', '/stats')) || {}; }

  // --- Local UI prefs (not in DB) ---
  hasOnboarded(userId) { return localStorage.getItem('ob_onboarded_' + userId) === 'true'; }
  setOnboarded(userId) { localStorage.setItem('ob_onboarded_' + userId, 'true'); }
}

window.Store = Store;
