const express = require('express');
const initSqlJs = require('sql.js');
const Stripe = require('stripe');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// ============================================================
// Config
// ============================================================
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'oilbridge.db');
const COMMISSION_RATE = 0.032;
const PORT = process.env.PORT || 3000;

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

if (stripe) console.log('Stripe payment integration enabled.');
else console.log('Stripe not configured — set STRIPE_SECRET_KEY to enable payments.');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ============================================================
// Database helpers (sql.js wrapper)
// ============================================================
let db;

function saveDb() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  return queryAll(sql, params)[0] || null;
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

// ============================================================
// Crypto helpers
// ============================================================
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return salt + ':' + hash;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const result = crypto.scryptSync(password, salt, 64).toString('hex');
  return result === hash;
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function generateId(prefix) {
  return prefix + '-' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

// ============================================================
// Row mappers
// ============================================================
function toUser(row) {
  if (!row) return null;
  return {
    id: row.id, email: row.email, role: row.role,
    companyName: row.company_name, companyReg: row.company_reg,
    companyCountry: row.company_country, companyVat: row.company_vat,
    contactName: row.contact_name, contactPhone: row.contact_phone,
    contactPosition: row.contact_position, kycStatus: row.kyc_status,
    ndaAccepted: !!row.nda_accepted,
    documents: JSON.parse(row.documents || '[]'),
    createdAt: row.created_at
  };
}

function toListing(row) {
  if (!row) return null;
  return {
    id: row.id, userId: row.user_id, type: row.type, oilType: row.oil_type,
    quantity: row.quantity, unit: row.unit, price: row.price, currency: row.currency,
    deliveryLocation: row.delivery_location, deliveryDate: row.delivery_date,
    notes: row.notes, status: row.status, createdAt: row.created_at
  };
}

function toMatch(row) {
  if (!row) return null;
  return {
    id: row.id, listingId: row.listing_id, buyerId: row.buyer_id, sellerId: row.seller_id,
    status: row.status, quantity: row.quantity, pricePerUnit: row.price_per_unit,
    totalValue: row.total_value, commission: row.commission, currency: row.currency,
    commissionPaid: !!row.commission_paid, stripeSessionId: row.stripe_session_id || null,
    createdAt: row.created_at
  };
}

function enrichListing(row) {
  const l = toListing(row);
  const seller = queryOne('SELECT id, company_name, company_country FROM users WHERE id = ?', [row.user_id]);
  l.seller = seller ? { id: seller.id, companyName: seller.company_name, companyCountry: seller.company_country } : null;
  return l;
}

function checkForMatches(newListing) {
  const compatible = queryAll(
    "SELECT * FROM listings WHERE id != ? AND status = 'active' AND oil_type = ? AND type != ? AND user_id != ?",
    [newListing.id, newListing.oil_type, newListing.type, newListing.user_id]
  );
  for (const other of compatible) {
    const isBuyer = newListing.type === 'buy';
    const buy = isBuyer ? newListing : other;
    const sell = isBuyer ? other : newListing;
    if (buy.price >= sell.price) {
      const existing = queryOne(
        'SELECT id FROM matches WHERE buyer_id = ? AND seller_id = ? AND listing_id = ?',
        [buy.user_id, sell.user_id, sell.id]
      );
      if (!existing) {
        const qty = Math.min(buy.quantity, sell.quantity);
        const total = qty * sell.price;
        run(
          `INSERT INTO matches (id, listing_id, buyer_id, seller_id, status, quantity, price_per_unit, total_value, commission, currency, created_at)
           VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
          [generateId('mtc'), sell.id, buy.user_id, sell.user_id, qty, sell.price, total, total * COMMISSION_RATE, sell.currency, new Date().toISOString()]
        );
      }
    }
  }
}

// ============================================================
// Database init & seed
// ============================================================
function initDatabase() {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user', company_name TEXT NOT NULL, company_reg TEXT NOT NULL,
    company_country TEXT NOT NULL, company_vat TEXT DEFAULT '', contact_name TEXT NOT NULL,
    contact_phone TEXT DEFAULT '', contact_position TEXT DEFAULT '',
    kyc_status TEXT NOT NULL DEFAULT 'pending', nda_accepted INTEGER NOT NULL DEFAULT 0,
    documents TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, oil_type TEXT NOT NULL,
    quantity REAL NOT NULL, unit TEXT NOT NULL, price REAL NOT NULL, currency TEXT NOT NULL DEFAULT 'USD',
    delivery_location TEXT NOT NULL, delivery_date TEXT NOT NULL, notes TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY, listing_id TEXT NOT NULL, buyer_id TEXT NOT NULL, seller_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', quantity REAL NOT NULL, price_per_unit REAL NOT NULL,
    total_value REAL NOT NULL, commission REAL NOT NULL, currency TEXT NOT NULL DEFAULT 'USD',
    created_at TEXT NOT NULL
  )`);

  // Migrate: add Stripe payment columns to matches
  try { db.run('ALTER TABLE matches ADD COLUMN commission_paid INTEGER NOT NULL DEFAULT 0'); } catch(e) {}
  try { db.run('ALTER TABLE matches ADD COLUMN stripe_session_id TEXT'); } catch(e) {}

  const count = queryOne('SELECT COUNT(*) as c FROM users');
  if (count && count.c === 0) seedDatabase();
  saveDb();
}

function seedDatabase() {
  // Only seed the admin account so the platform can be managed
  db.run(
    'INSERT INTO users (id,email,password,role,company_name,company_reg,company_country,company_vat,contact_name,contact_phone,contact_position,kyc_status,nda_accepted,documents,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ['admin-001','admin@oilbridge.eu',hashPassword('NCH9fqfY5vtTz9HIi0svNA'),'admin','OilBridge','KVK-00000000','Netherlands','','Platform Administrator','','System Administrator','verified',1,'[]',new Date().toISOString()]
  );
  console.log('Database initialized with admin account.');
}

// ============================================================
// Express app setup
// ============================================================
function createApp() {
  const app = express();

  // --- Stripe webhook (needs raw body — must be before express.json) ---
  app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).json({ error: 'Stripe not configured' });
    const sig = req.headers['stripe-signature'];
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: 'Invalid signature' });
    }
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const matchId = session.metadata && session.metadata.matchId;
      if (matchId) {
        run('UPDATE matches SET commission_paid = 1, status = ? WHERE id = ?', ['completed', matchId]);
        console.log(`Commission paid for match ${matchId}`);
      }
    }
    res.json({ received: true });
  });

  app.use(express.json());

  // --- Auth middleware ---
  function auth(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    const session = queryOne('SELECT user_id FROM sessions WHERE token = ?', [header.slice(7)]);
    if (!session) return res.status(401).json({ error: 'Invalid session' });
    const user = queryOne('SELECT * FROM users WHERE id = ?', [session.user_id]);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  }

  function optionalAuth(req, res, next) {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      const session = queryOne('SELECT user_id FROM sessions WHERE token = ?', [header.slice(7)]);
      if (session) req.user = queryOne('SELECT * FROM users WHERE id = ?', [session.user_id]);
    }
    next();
  }

  function adminOnly(req, res, next) {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    next();
  }

  function verifiedOnly(req, res, next) {
    if (req.user.kyc_status !== 'verified') return res.status(403).json({ error: 'Verified users only' });
    next();
  }

  // ========== Auth Routes ==========
  app.post('/api/auth/register', (req, res) => {
    const { email, password, companyName, companyReg, companyCountry, companyVat, contactName, contactPhone, contactPosition, ndaAccepted, documents } = req.body;
    if (!email || !password || !companyName || !companyReg || !companyCountry || !contactName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (queryOne('SELECT id FROM users WHERE email = ?', [email])) {
      return res.status(409).json({ error: 'Email already registered.' });
    }
    const id = generateId('user');
    run(
      `INSERT INTO users (id,email,password,role,company_name,company_reg,company_country,company_vat,contact_name,contact_phone,contact_position,kyc_status,nda_accepted,documents,created_at)
       VALUES (?,?,?,'user',?,?,?,?,?,?,?,'pending',?,?,?)`,
      [id, email, hashPassword(password), companyName, companyReg, companyCountry, companyVat||'', contactName, contactPhone||'', contactPosition||'', ndaAccepted?1:0, JSON.stringify(documents||[]), new Date().toISOString()]
    );
    res.status(201).json({ success: true, user: toUser(queryOne('SELECT * FROM users WHERE id = ?', [id])) });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = queryOne('SELECT * FROM users WHERE email = ?', [email]);
    if (!user || !verifyPassword(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = generateToken();
    run('INSERT INTO sessions (token,user_id,created_at) VALUES (?,?,?)', [token, user.id, new Date().toISOString()]);
    res.json({ token, user: toUser(user) });
  });

  app.get('/api/auth/me', auth, (req, res) => {
    res.json(toUser(req.user));
  });

  app.post('/api/auth/logout', auth, (req, res) => {
    run('DELETE FROM sessions WHERE token = ?', [req.headers.authorization.slice(7)]);
    res.json({ success: true });
  });

  // ========== User Routes ==========
  app.get('/api/users', auth, adminOnly, (req, res) => {
    const status = req.query.status;
    const rows = status
      ? queryAll("SELECT * FROM users WHERE role != 'admin' AND kyc_status = ? ORDER BY created_at DESC", [status])
      : queryAll("SELECT * FROM users WHERE role != 'admin' ORDER BY created_at DESC");
    res.json(rows.map(toUser));
  });

  app.get('/api/users/:id', auth, (req, res) => {
    if (req.user.role !== 'admin' && req.user.id !== req.params.id) return res.status(403).json({ error: 'Forbidden' });
    const user = queryOne('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(toUser(user));
  });

  app.patch('/api/users/:id', auth, (req, res) => {
    const targetId = req.params.id;
    const isAdmin = req.user.role === 'admin';
    const isSelf = req.user.id === targetId;
    if (!isAdmin && !isSelf) return res.status(403).json({ error: 'Forbidden' });
    if (!queryOne('SELECT id FROM users WHERE id = ?', [targetId])) return res.status(404).json({ error: 'User not found' });

    const u = req.body;
    if (u.kycStatus && isAdmin) run('UPDATE users SET kyc_status = ? WHERE id = ?', [u.kycStatus, targetId]);
    if (u.contactName && isSelf) run('UPDATE users SET contact_name = ? WHERE id = ?', [u.contactName, targetId]);
    if (u.contactPhone !== undefined && isSelf) run('UPDATE users SET contact_phone = ? WHERE id = ?', [u.contactPhone, targetId]);
    if (u.contactPosition !== undefined && isSelf) run('UPDATE users SET contact_position = ? WHERE id = ?', [u.contactPosition, targetId]);

    res.json(toUser(queryOne('SELECT * FROM users WHERE id = ?', [targetId])));
  });

  // ========== Listing Routes ==========
  app.get('/api/listings', optionalAuth, (req, res) => {
    const { type, oilType, search, sort, userId, limit } = req.query;
    const showAll = req.query.all === 'true';
    let sql = 'SELECT * FROM listings WHERE 1=1';
    const params = [];
    if (!showAll) { sql += " AND status = 'active'"; }
    if (type) { sql += ' AND type = ?'; params.push(type); }
    if (oilType) { sql += ' AND oil_type = ?'; params.push(oilType); }
    if (userId) { sql += ' AND user_id = ?'; params.push(userId); }
    if (search) { sql += ' AND (delivery_location LIKE ? OR notes LIKE ? OR oil_type LIKE ?)'; const s = '%'+search+'%'; params.push(s,s,s); }
    switch (sort) {
      case 'oldest': sql += ' ORDER BY created_at ASC'; break;
      case 'price_low': sql += ' ORDER BY price ASC'; break;
      case 'price_high': sql += ' ORDER BY price DESC'; break;
      default: sql += ' ORDER BY created_at DESC';
    }
    if (limit) { sql += ' LIMIT ?'; params.push(parseInt(limit)); }
    res.json(queryAll(sql, params).map(enrichListing));
  });

  app.get('/api/listings/:id', optionalAuth, (req, res) => {
    const row = queryOne('SELECT * FROM listings WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Listing not found' });
    res.json(enrichListing(row));
  });

  app.post('/api/listings', auth, verifiedOnly, (req, res) => {
    const { type, oilType, quantity, unit, price, currency, deliveryLocation, deliveryDate, notes } = req.body;
    if (!type || !oilType || !quantity || !unit || !price || !deliveryLocation || !deliveryDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const id = generateId('lst');
    run(
      "INSERT INTO listings (id,user_id,type,oil_type,quantity,unit,price,currency,delivery_location,delivery_date,notes,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'active',?)",
      [id, req.user.id, type, oilType, parseFloat(quantity), unit, parseFloat(price), currency||'USD', deliveryLocation, deliveryDate, notes||'', new Date().toISOString()]
    );
    const listing = queryOne('SELECT * FROM listings WHERE id = ?', [id]);
    checkForMatches(listing);
    res.status(201).json({ success: true, listing: enrichListing(listing) });
  });

  // ========== Match Routes ==========
  app.get('/api/matches', auth, (req, res) => {
    const userId = req.user.id;
    const rows = queryAll('SELECT * FROM matches WHERE buyer_id = ? OR seller_id = ? ORDER BY created_at DESC', [userId, userId]);
    const enriched = rows.map(m => {
      const listing = queryOne('SELECT oil_type, unit FROM listings WHERE id = ?', [m.listing_id]);
      const isAccepted = m.status === 'accepted' || m.status === 'completed';
      const cpId = m.buyer_id === userId ? m.seller_id : m.buyer_id;
      let counterparty = null;
      if (isAccepted) {
        const cp = queryOne('SELECT company_name, contact_name, email, contact_phone FROM users WHERE id = ?', [cpId]);
        if (cp) counterparty = { companyName: cp.company_name, contactName: cp.contact_name, email: cp.email, contactPhone: cp.contact_phone };
      }
      return { ...toMatch(m), listing: listing ? { oilType: listing.oil_type, unit: listing.unit } : null, counterparty };
    });
    res.json(enriched);
  });

  app.post('/api/matches', auth, verifiedOnly, (req, res) => {
    const { listingId } = req.body;
    const listing = queryOne('SELECT * FROM listings WHERE id = ?', [listingId]);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.user_id === req.user.id) return res.status(400).json({ error: 'Cannot match own listing' });
    const isBuyer = listing.type === 'sell';
    const buyerId = isBuyer ? req.user.id : listing.user_id;
    const sellerId = isBuyer ? listing.user_id : req.user.id;
    if (queryOne('SELECT id FROM matches WHERE buyer_id = ? AND seller_id = ? AND listing_id = ?', [buyerId, sellerId, listing.id])) {
      return res.status(409).json({ error: 'Match already exists' });
    }
    const total = listing.quantity * listing.price;
    run(
      "INSERT INTO matches (id,listing_id,buyer_id,seller_id,status,quantity,price_per_unit,total_value,commission,currency,created_at) VALUES (?,?,?,?,'pending',?,?,?,?,?,?)",
      [generateId('mtc'), listing.id, buyerId, sellerId, listing.quantity, listing.price, total, total*COMMISSION_RATE, listing.currency, new Date().toISOString()]
    );
    res.status(201).json({ success: true });
  });

  app.patch('/api/matches/:id', auth, (req, res) => {
    const match = queryOne('SELECT * FROM matches WHERE id = ?', [req.params.id]);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (match.buyer_id !== req.user.id && match.seller_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    const { status } = req.body;
    if (status && ['accepted','declined','completed'].includes(status)) {
      run('UPDATE matches SET status = ? WHERE id = ?', [status, req.params.id]);
    }
    res.json({ success: true });
  });

  // ========== Stripe Payment Routes ==========
  app.post('/api/payments/create-session', auth, async (req, res) => {
    if (!stripe) return res.status(503).json({ error: 'Stripe is not configured. Set the STRIPE_SECRET_KEY environment variable.' });
    const { matchId } = req.body;
    if (!matchId) return res.status(400).json({ error: 'matchId is required' });

    const match = queryOne('SELECT * FROM matches WHERE id = ?', [matchId]);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (match.buyer_id !== req.user.id && match.seller_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    if (match.status !== 'accepted') return res.status(400).json({ error: 'Match must be accepted before payment' });
    if (match.commission_paid) return res.status(400).json({ error: 'Commission already paid' });

    try {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: match.currency.toLowerCase(),
            product_data: {
              name: 'OilBridge Trade Commission (3.2%)',
              description: `Commission for match ${match.id} — ${match.quantity.toLocaleString()} units at ${match.price_per_unit} ${match.currency}/unit`,
            },
            unit_amount: Math.round(match.commission * 100),
          },
          quantity: 1,
        }],
        metadata: { matchId: match.id, userId: req.user.id },
        success_url: `${baseUrl}/#payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/#matches`,
      });

      run('UPDATE matches SET stripe_session_id = ? WHERE id = ?', [session.id, match.id]);
      res.json({ url: session.url, sessionId: session.id });
    } catch (err) {
      console.error('Stripe session creation failed:', err.message);
      res.status(500).json({ error: 'Failed to create payment session' });
    }
  });

  app.get('/api/payments/verify-session', auth, async (req, res) => {
    if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });
    try {
      const session = await stripe.checkout.sessions.retrieve(session_id);
      const matchId = session.metadata && session.metadata.matchId;
      const match = matchId ? queryOne('SELECT * FROM matches WHERE id = ?', [matchId]) : null;
      res.json({
        status: session.payment_status,
        matchId,
        commissionPaid: match ? !!match.commission_paid : false
      });
    } catch (err) {
      res.status(400).json({ error: 'Invalid session' });
    }
  });

  // ========== Stats ==========
  app.get('/api/stats', auth, adminOnly, (req, res) => {
    res.json({
      totalUsers: (queryOne("SELECT COUNT(*) as c FROM users WHERE role != 'admin'") || {}).c || 0,
      verifiedUsers: (queryOne("SELECT COUNT(*) as c FROM users WHERE role != 'admin' AND kyc_status = 'verified'") || {}).c || 0,
      pendingUsers: (queryOne("SELECT COUNT(*) as c FROM users WHERE role != 'admin' AND kyc_status = 'pending'") || {}).c || 0,
      totalListings: (queryOne('SELECT COUNT(*) as c FROM listings') || {}).c || 0,
      activeListings: (queryOne("SELECT COUNT(*) as c FROM listings WHERE status = 'active'") || {}).c || 0,
      totalMatches: (queryOne('SELECT COUNT(*) as c FROM matches') || {}).c || 0,
      estimatedRevenue: (queryOne("SELECT COALESCE(SUM(commission), 0) as c FROM matches WHERE status IN ('accepted','completed')") || {}).c || 0,
    });
  });

  // ========== Static & SPA fallback ==========
  app.use('/css', express.static(path.join(__dirname, 'css')));
  app.use('/js', express.static(path.join(__dirname, 'js')));
  app.use('/assets', express.static(path.join(__dirname, 'assets')));
  app.get('/sitemap.xml', (req, res) => res.sendFile(path.join(__dirname, 'sitemap.xml')));
  app.get('/robots.txt', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'robots.txt')));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

  return app;
}

// ============================================================
// Startup (async for sql.js init)
// ============================================================
(async () => {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    console.log('Loaded existing database.');
  } else {
    db = new SQL.Database();
    console.log('Created new database.');
  }

  initDatabase();

  const app = createApp();
  app.listen(PORT, '0.0.0.0', () => console.log(`OilBridge running on 0.0.0.0:${PORT}`));
})();
