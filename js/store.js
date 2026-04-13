/* ============================================================
   OilBridge — Data Store (localStorage)
   ============================================================ */

class Store {
  constructor() {
    this.KEYS = {
      users: 'ob_users',
      listings: 'ob_listings',
      matches: 'ob_matches',
      session: 'ob_session',
      initialized: 'ob_initialized',
      onboarded: 'ob_onboarded_'
    };
    this.COMMISSION_RATE = 0.032;
    this.init();
  }

  init() {
    if (!localStorage.getItem(this.KEYS.initialized)) {
      this.seed();
      localStorage.setItem(this.KEYS.initialized, 'true');
    }
  }

  seed() {
    const now = new Date().toISOString();
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    const users = [
      {
        id: 'admin-001',
        email: 'admin@sentari.nl',
        password: this.hashPassword('Admin2024!'),
        role: 'admin',
        companyName: 'Sentari Holding BV',
        companyReg: 'KVK-87654321',
        companyCountry: 'Netherlands',
        companyVat: 'NL987654321B01',
        contactName: 'Platform Administrator',
        contactPhone: '+31 20 123 4567',
        contactPosition: 'System Administrator',
        kycStatus: 'verified',
        ndaAccepted: true,
        documents: ['company_reg.pdf', 'id_admin.pdf'],
        createdAt: monthAgo
      },
      {
        id: 'user-001',
        email: 'hans@petrochemag.de',
        password: this.hashPassword('Trader2024!'),
        role: 'user',
        companyName: 'PetroChem AG',
        companyReg: 'HRB-334455',
        companyCountry: 'Germany',
        companyVat: 'DE334455667',
        contactName: 'Hans M\u00fcller',
        contactPhone: '+49 40 555 1234',
        contactPosition: 'Head of Trading',
        kycStatus: 'verified',
        ndaAccepted: true,
        documents: ['petrochem_reg.pdf', 'hans_id.pdf', 'address_proof.pdf'],
        createdAt: monthAgo
      },
      {
        id: 'user-002',
        email: 'marie@euroraffinerie.fr',
        password: this.hashPassword('Trader2024!'),
        role: 'user',
        companyName: 'Euro Raffinerie SAS',
        companyReg: 'RCS-789012',
        companyCountry: 'France',
        companyVat: 'FR789012345',
        contactName: 'Marie Dupont',
        contactPhone: '+33 1 45 67 89 00',
        contactPosition: 'Director of Procurement',
        kycStatus: 'verified',
        ndaAccepted: true,
        documents: ['euro_raf_reg.pdf', 'marie_id.pdf', 'address_proof.pdf'],
        createdAt: monthAgo
      },
      {
        id: 'user-003',
        email: 'jan@polskieoil.pl',
        password: this.hashPassword('Trader2024!'),
        role: 'user',
        companyName: 'Polskie Oil Sp. z o.o.',
        companyReg: 'KRS-0000556677',
        companyCountry: 'Poland',
        companyVat: 'PL5567789900',
        contactName: 'Jan Kowalski',
        contactPhone: '+48 22 345 67 89',
        contactPosition: 'Trading Manager',
        kycStatus: 'verified',
        ndaAccepted: true,
        documents: ['polskie_reg.pdf', 'jan_id.pdf'],
        createdAt: twoWeeksAgo
      },
      {
        id: 'user-004',
        email: 'carlos@iberiaenergy.es',
        password: this.hashPassword('Trader2024!'),
        role: 'user',
        companyName: 'Iberia Energy S.L.',
        companyReg: 'CIF-B12345678',
        companyCountry: 'Spain',
        companyVat: 'ESB12345678',
        contactName: 'Carlos Garc\u00eda',
        contactPhone: '+34 91 234 5678',
        contactPosition: 'VP of Supply Chain',
        kycStatus: 'pending',
        ndaAccepted: true,
        documents: ['iberia_reg.pdf', 'carlos_id.pdf'],
        createdAt: weekAgo
      },
      {
        id: 'user-005',
        email: 'pieter@rotterdam-oil.nl',
        password: this.hashPassword('Trader2024!'),
        role: 'user',
        companyName: 'Rotterdam Oil Trading BV',
        companyReg: 'KVK-55667788',
        companyCountry: 'Netherlands',
        companyVat: 'NL556677889B01',
        contactName: 'Pieter de Vries',
        contactPhone: '+31 10 456 7890',
        contactPosition: 'Senior Trader',
        kycStatus: 'pending',
        ndaAccepted: true,
        documents: ['rotterdam_reg.pdf', 'pieter_id.pdf'],
        createdAt: weekAgo
      }
    ];

    const futureDate1 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    const futureDate2 = new Date(Date.now() + 45 * 86400000).toISOString().split('T')[0];
    const futureDate3 = new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0];
    const futureDate4 = new Date(Date.now() + 21 * 86400000).toISOString().split('T')[0];

    const listings = [
      {
        id: 'lst-001', userId: 'user-001', type: 'sell', oilType: 'oil_brent',
        quantity: 50000, unit: 'unit_barrels', price: 82.50, currency: 'USD',
        deliveryLocation: 'Rotterdam, Netherlands', deliveryDate: futureDate1,
        notes: 'North Sea Brent Crude, API gravity 38.3. FOB delivery. Flexible on delivery window +/- 5 days.',
        status: 'active', createdAt: twoWeeksAgo
      },
      {
        id: 'lst-002', userId: 'user-002', type: 'buy', oilType: 'oil_diesel',
        quantity: 25000, unit: 'unit_mt', price: 940.00, currency: 'EUR',
        deliveryLocation: 'Le Havre, France', deliveryDate: futureDate2,
        notes: 'EN 590 specification required. CFPP -20\u00b0C for winter grade. CIF terms preferred.',
        status: 'active', createdAt: twoWeeksAgo
      },
      {
        id: 'lst-003', userId: 'user-003', type: 'buy', oilType: 'oil_ural',
        quantity: 100000, unit: 'unit_barrels', price: 68.75, currency: 'USD',
        deliveryLocation: 'Gda\u0144sk, Poland', deliveryDate: futureDate3,
        notes: 'Urals blend crude. Must comply with all current EU regulations and sanctions.',
        status: 'active', createdAt: weekAgo
      },
      {
        id: 'lst-004', userId: 'user-001', type: 'sell', oilType: 'oil_gasoline',
        quantity: 15000, unit: 'unit_mt', price: 875.00, currency: 'EUR',
        deliveryLocation: 'Hamburg, Germany', deliveryDate: futureDate1,
        notes: 'Euro 5 specification. RON 95. Ex-refinery pricing.',
        status: 'active', createdAt: weekAgo
      },
      {
        id: 'lst-005', userId: 'user-002', type: 'sell', oilType: 'oil_jet',
        quantity: 10000, unit: 'unit_mt', price: 1020.00, currency: 'EUR',
        deliveryLocation: 'Marseille, France', deliveryDate: futureDate2,
        notes: 'Jet A-1 specification per AFQRJOS. Into-plane delivery possible at MRS.',
        status: 'active', createdAt: weekAgo
      },
      {
        id: 'lst-006', userId: 'user-003', type: 'sell', oilType: 'oil_fuel_oil',
        quantity: 30000, unit: 'unit_mt', price: 480.00, currency: 'USD',
        deliveryLocation: 'Gdynia, Poland', deliveryDate: futureDate4,
        notes: '380 CST fuel oil. Max sulfur 3.5%. Suitable for marine bunker use.',
        status: 'active', createdAt: new Date(Date.now() - 3 * 86400000).toISOString()
      },
      {
        id: 'lst-007', userId: 'user-001', type: 'buy', oilType: 'oil_naphtha',
        quantity: 20000, unit: 'unit_mt', price: 690.00, currency: 'EUR',
        deliveryLocation: 'Antwerp, Belgium', deliveryDate: futureDate3,
        notes: 'Full-range naphtha for petrochemical feedstock. Paraffinic content >70% preferred.',
        status: 'active', createdAt: new Date(Date.now() - 2 * 86400000).toISOString()
      },
      {
        id: 'lst-008', userId: 'user-002', type: 'buy', oilType: 'oil_lng',
        quantity: 50000, unit: 'unit_mt', price: 12.80, currency: 'USD',
        deliveryLocation: 'Fos-sur-Mer, France', deliveryDate: futureDate2,
        notes: 'LNG cargo, DES terms. Must meet Fos Cavaou terminal specs.',
        status: 'active', createdAt: new Date(Date.now() - 1 * 86400000).toISOString()
      }
    ];

    const matches = [
      {
        id: 'mtc-001',
        listingId: 'lst-001',
        buyerId: 'user-002',
        sellerId: 'user-001',
        status: 'accepted',
        quantity: 50000,
        pricePerUnit: 82.50,
        totalValue: 4125000,
        commission: 4125000 * 0.032,
        currency: 'USD',
        createdAt: weekAgo
      },
      {
        id: 'mtc-002',
        listingId: 'lst-002',
        buyerId: 'user-002',
        sellerId: 'user-003',
        status: 'pending',
        quantity: 25000,
        pricePerUnit: 940.00,
        totalValue: 23500000,
        commission: 23500000 * 0.032,
        currency: 'EUR',
        createdAt: new Date(Date.now() - 2 * 86400000).toISOString()
      }
    ];

    this.setData(this.KEYS.users, users);
    this.setData(this.KEYS.listings, listings);
    this.setData(this.KEYS.matches, matches);
  }

  // === Helpers ===
  getData(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; }
    catch { return []; }
  }
  setData(key, data) { localStorage.setItem(key, JSON.stringify(data)); }
  generateId(prefix) { return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }

  hashPassword(password) {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
      const char = password.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return 'h_' + Math.abs(hash).toString(36);
  }

  // === Users ===
  createUser(data) {
    const users = this.getData(this.KEYS.users);
    if (users.find(u => u.email === data.email)) return { error: 'Email already registered.' };
    const user = {
      id: this.generateId('user'),
      email: data.email,
      password: this.hashPassword(data.password),
      role: 'user',
      companyName: data.companyName,
      companyReg: data.companyReg,
      companyCountry: data.companyCountry,
      companyVat: data.companyVat || '',
      contactName: data.contactName,
      contactPhone: data.contactPhone || '',
      contactPosition: data.contactPosition || '',
      kycStatus: 'pending',
      ndaAccepted: data.ndaAccepted || false,
      documents: data.documents || [],
      createdAt: new Date().toISOString()
    };
    users.push(user);
    this.setData(this.KEYS.users, users);
    return { success: true, user };
  }

  getUser(id) {
    return this.getData(this.KEYS.users).find(u => u.id === id) || null;
  }

  getUserByEmail(email) {
    return this.getData(this.KEYS.users).find(u => u.email === email) || null;
  }

  updateUser(id, updates) {
    const users = this.getData(this.KEYS.users);
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return false;
    users[idx] = { ...users[idx], ...updates };
    this.setData(this.KEYS.users, users);
    return true;
  }

  getUsers() { return this.getData(this.KEYS.users); }

  getPendingUsers() {
    return this.getData(this.KEYS.users).filter(u => u.kycStatus === 'pending');
  }

  // === Authentication ===
  login(email, password) {
    const user = this.getUserByEmail(email);
    if (!user) return { error: 'Invalid credentials' };
    if (user.password !== this.hashPassword(password)) return { error: 'Invalid credentials' };
    const session = { userId: user.id, email: user.email, loginAt: new Date().toISOString() };
    localStorage.setItem(this.KEYS.session, JSON.stringify(session));
    return { success: true, user };
  }

  logout() { localStorage.removeItem(this.KEYS.session); }

  getCurrentUser() {
    try {
      const session = JSON.parse(localStorage.getItem(this.KEYS.session));
      if (!session) return null;
      return this.getUser(session.userId);
    } catch { return null; }
  }

  isLoggedIn() { return !!this.getCurrentUser(); }
  isAdmin() { const u = this.getCurrentUser(); return u && u.role === 'admin'; }
  isVerified() { const u = this.getCurrentUser(); return u && u.kycStatus === 'verified'; }

  hasOnboarded(userId) {
    return localStorage.getItem(this.KEYS.onboarded + userId) === 'true';
  }
  setOnboarded(userId) {
    localStorage.setItem(this.KEYS.onboarded + userId, 'true');
  }

  // === Listings ===
  createListing(data) {
    const listings = this.getData(this.KEYS.listings);
    const listing = {
      id: this.generateId('lst'),
      userId: data.userId,
      type: data.type,
      oilType: data.oilType,
      quantity: parseFloat(data.quantity),
      unit: data.unit,
      price: parseFloat(data.price),
      currency: data.currency,
      deliveryLocation: data.deliveryLocation,
      deliveryDate: data.deliveryDate,
      notes: data.notes || '',
      status: 'active',
      createdAt: new Date().toISOString()
    };
    listings.push(listing);
    this.setData(this.KEYS.listings, listings);
    this.checkForMatches(listing);
    return { success: true, listing };
  }

  getListing(id) {
    return this.getData(this.KEYS.listings).find(l => l.id === id) || null;
  }

  getListings(filters = {}) {
    let listings = this.getData(this.KEYS.listings).filter(l => l.status === 'active');
    if (filters.type) listings = listings.filter(l => l.type === filters.type);
    if (filters.oilType) listings = listings.filter(l => l.oilType === filters.oilType);
    if (filters.search) {
      const s = filters.search.toLowerCase();
      listings = listings.filter(l =>
        l.deliveryLocation.toLowerCase().includes(s) ||
        l.notes.toLowerCase().includes(s) ||
        l.oilType.toLowerCase().includes(s)
      );
    }
    const sortBy = filters.sort || 'newest';
    if (sortBy === 'newest') listings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    else if (sortBy === 'oldest') listings.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    else if (sortBy === 'price_low') listings.sort((a, b) => a.price - b.price);
    else if (sortBy === 'price_high') listings.sort((a, b) => b.price - a.price);
    return listings;
  }

  getUserListings(userId) {
    return this.getData(this.KEYS.listings).filter(l => l.userId === userId);
  }

  updateListing(id, updates) {
    const listings = this.getData(this.KEYS.listings);
    const idx = listings.findIndex(l => l.id === id);
    if (idx === -1) return false;
    listings[idx] = { ...listings[idx], ...updates };
    this.setData(this.KEYS.listings, listings);
    return true;
  }

  // === Matches ===
  checkForMatches(newListing) {
    const listings = this.getData(this.KEYS.listings).filter(l =>
      l.id !== newListing.id &&
      l.status === 'active' &&
      l.oilType === newListing.oilType &&
      l.type !== newListing.type &&
      l.userId !== newListing.userId
    );
    for (const match of listings) {
      const isBuyer = newListing.type === 'buy';
      const buyListing = isBuyer ? newListing : match;
      const sellListing = isBuyer ? match : newListing;
      if (buyListing.price >= sellListing.price) {
        const qty = Math.min(buyListing.quantity, sellListing.quantity);
        const price = sellListing.price;
        const total = qty * price;
        this.createMatch({
          listingId: sellListing.id,
          buyerId: buyListing.userId,
          sellerId: sellListing.userId,
          quantity: qty,
          pricePerUnit: price,
          totalValue: total,
          commission: total * this.COMMISSION_RATE,
          currency: sellListing.currency
        });
      }
    }
  }

  createMatch(data) {
    const matches = this.getData(this.KEYS.matches);
    const existing = matches.find(m =>
      m.buyerId === data.buyerId && m.sellerId === data.sellerId && m.listingId === data.listingId
    );
    if (existing) return;
    const match = {
      id: this.generateId('mtc'),
      listingId: data.listingId,
      buyerId: data.buyerId,
      sellerId: data.sellerId,
      status: 'pending',
      quantity: data.quantity,
      pricePerUnit: data.pricePerUnit,
      totalValue: data.totalValue,
      commission: data.commission,
      currency: data.currency,
      createdAt: new Date().toISOString()
    };
    matches.push(match);
    this.setData(this.KEYS.matches, matches);
  }

  getMatchesForUser(userId) {
    return this.getData(this.KEYS.matches).filter(m => m.buyerId === userId || m.sellerId === userId);
  }

  getAllMatches() { return this.getData(this.KEYS.matches); }

  updateMatch(id, updates) {
    const matches = this.getData(this.KEYS.matches);
    const idx = matches.findIndex(m => m.id === id);
    if (idx === -1) return false;
    matches[idx] = { ...matches[idx], ...updates };
    this.setData(this.KEYS.matches, matches);
    return true;
  }

  // === Stats ===
  getStats() {
    const users = this.getUsers().filter(u => u.role !== 'admin');
    const listings = this.getData(this.KEYS.listings);
    const matches = this.getAllMatches();
    const revenue = matches
      .filter(m => m.status === 'accepted' || m.status === 'completed')
      .reduce((sum, m) => sum + m.commission, 0);
    return {
      totalUsers: users.length,
      verifiedUsers: users.filter(u => u.kycStatus === 'verified').length,
      pendingUsers: users.filter(u => u.kycStatus === 'pending').length,
      totalListings: listings.length,
      activeListings: listings.filter(l => l.status === 'active').length,
      totalMatches: matches.length,
      estimatedRevenue: revenue
    };
  }

  // === Reset (dev) ===
  reset() {
    Object.values(this.KEYS).forEach(k => {
      if (k.endsWith('_')) {
        Object.keys(localStorage).filter(lk => lk.startsWith(k)).forEach(lk => localStorage.removeItem(lk));
      } else {
        localStorage.removeItem(k);
      }
    });
    this.init();
  }
}

window.Store = Store;
