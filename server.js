require('./load-env').loadEnv();

const express = require('express');
const initSqlJs = require('sql.js');
const Stripe = require('stripe');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// ============================================================
// Process-level safety net — keep the server alive on errors
// ============================================================
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason && reason.stack ? reason.stack : reason);
});

// ============================================================
// Config
// ============================================================
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'oilbridge.db');
const COMMISSION_RATE = 0.032;
const EARLY_ADOPTER_RATE = 0.02;
const EARLY_ADOPTER_LIMIT = 50;
const PORT = process.env.PORT || 3000;

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

if (stripe) console.log('Stripe integration enabled (payments + identity).');
else console.log('Stripe not configured — set STRIPE_SECRET_KEY to enable payments and KYC.');

if (process.env.RESEND_API_KEY) console.log('Email notifications enabled (Resend).');
else console.log('Email notifications not configured — set RESEND_API_KEY to enable real emails.');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ============================================================
// Database helpers (sql.js wrapper)
// ============================================================
let db;

function saveDb() {
  try {
    const data = db.export();
    // Atomic write: write to temp file, then rename
    const tmp = DB_PATH + '.tmp';
    fs.writeFileSync(tmp, Buffer.from(data));
    fs.renameSync(tmp, DB_PATH);
  } catch (err) {
    console.error('[DB] saveDb failed:', err.message);
  }
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
  let kycDetails = null;
  try { if (row.ai_verification) kycDetails = JSON.parse(row.ai_verification); } catch {}
  return {
    id: row.id, email: row.email, role: row.role,
    companyName: row.company_name, companyReg: row.company_reg,
    companyCountry: row.company_country, companyVat: row.company_vat,
    contactName: row.contact_name, contactPhone: row.contact_phone,
    contactPosition: row.contact_position, kycStatus: row.kyc_status,
    ndaAccepted: !!row.nda_accepted,
    documents: JSON.parse(row.documents || '[]'),
    stripeIdentitySessionId: row.stripe_identity_session_id || null,
    stripeIdentityStatus: row.stripe_identity_status || null,
    kycDetails,
    kycVerifiedAt: row.ai_verified_at || null,
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
  let evidence = null;
  try { if (row.evidence) evidence = JSON.parse(row.evidence); } catch {}
  return {
    id: row.id, listingId: row.listing_id, buyerId: row.buyer_id, sellerId: row.seller_id,
    status: row.status, quantity: row.quantity, pricePerUnit: row.price_per_unit,
    totalValue: row.total_value, commission: row.commission,
    commissionRate: row.commission_rate != null ? row.commission_rate : COMMISSION_RATE,
    currency: row.currency,
    commissionPaid: !!row.commission_paid, stripeSessionId: row.stripe_session_id || null,
    hasEvidence: !!evidence,
    createdAt: row.created_at
  };
}

// Early-adopter pricing: first EARLY_ADOPTER_LIMIT completed deals pay the
// reduced rate. Once that threshold is crossed, new matches use the standard
// rate. The rate is locked in at match creation so users keep the price they
// were quoted.
function getCurrentCommissionRate() {
  const row = queryOne("SELECT COUNT(*) as c FROM matches WHERE status = 'completed' AND commission_paid = 1");
  const completedCount = (row && row.c) || 0;
  return completedCount < EARLY_ADOPTER_LIMIT ? EARLY_ADOPTER_RATE : COMMISSION_RATE;
}

function enrichListing(row) {
  const l = toListing(row);
  const seller = queryOne('SELECT id, company_name, company_country FROM users WHERE id = ?', [row.user_id]);
  l.seller = seller ? { id: seller.id, companyName: seller.company_name, companyCountry: seller.company_country } : null;
  return l;
}

// ============================================================
// Email service (Resend with stub fallback)
// ============================================================
async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[email stub] To: ${to} | Subject: ${subject}`);
    return { mocked: true };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'OilBridge <contact@oilbridge.eu>',
        to: [to], subject, html
      })
    });
    const data = await res.json();
    if (!res.ok) console.error('Email send failed:', data);
    return data;
  } catch (err) {
    console.error('Email service error:', err.message);
    return { error: err.message };
  }
}

async function sendKycResultEmail(user, status, reason) {
  const isApproved = status === 'verified';
  const isRejected = status === 'rejected';
  let subject, html;

  if (isApproved) {
    subject = 'Your OilBridge account has been approved';
    html = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1c1b">
      <h2 style="color:#c8860a">Welcome to OilBridge!</h2>
      <p>Hi ${user.contact_name},</p>
      <p>Great news — your KYC verification has been <strong>approved</strong>. You now have full access to the OilBridge platform and can start placing buy and sell listings immediately.</p>
      <p style="background:#f5f5f4;padding:12px 16px;border-radius:6px;font-size:0.9rem;color:#555">${reason}</p>
      <p style="margin-top:24px"><a href="https://www.oilbridge.eu" style="background:#c8860a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Sign In to OilBridge</a></p>
      <p style="font-size:0.85rem;color:#888;margin-top:32px">— The OilBridge team</p>
    </div>`;
  } else if (isRejected) {
    subject = 'OilBridge — KYC verification update required';
    html = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1c1b">
      <h2 style="color:#c0392b">KYC Verification Could Not Be Completed</h2>
      <p>Hi ${user.contact_name},</p>
      <p>We were unable to verify your account based on the documents you provided.</p>
      <p style="background:#fdf0ee;padding:12px 16px;border-radius:6px;font-size:0.9rem;color:#555"><strong>Reason:</strong> ${reason}</p>
      <p>Please re-submit valid documents (company registration, KvK extract, passport, or business license) or contact <a href="mailto:contact@oilbridge.eu">contact@oilbridge.eu</a> for assistance.</p>
      <p style="font-size:0.85rem;color:#888;margin-top:32px">— The OilBridge team</p>
    </div>`;
  } else {
    subject = 'OilBridge — Your account is under manual review';
    html = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1c1b">
      <h2>Account Under Review</h2>
      <p>Hi ${user.contact_name},</p>
      <p>Your account requires manual review by our team. We'll get back to you within 1–3 business days.</p>
      <p style="background:#f5f5f4;padding:12px 16px;border-radius:6px;font-size:0.9rem;color:#555">${reason}</p>
      <p style="font-size:0.85rem;color:#888;margin-top:32px">— The OilBridge team</p>
    </div>`;
  }

  return sendEmail({ to: user.email, subject, html });
}

// ============================================================
// Chat: content filter, SSE broadcast
// ============================================================
const BLOCKED_PATTERNS = [
  { name: 'email',     regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { name: 'phone',     regex: /(?:\+?\d[\s\-().]{0,2}){7,}\d/ },
  { name: 'whatsapp',  regex: /\b(?:whats[\s\-_.]?app|wa\.me|whatsap)\b/i },
  { name: 'telegram',  regex: /\b(?:telegram|t\.me\b|@[a-z0-9_]{4,})\b/i },
  { name: 'signal',    regex: /\bsignal[\s\-_]?(?:app|message|messenger|number|contact)\b/i },
  { name: 'skype',     regex: /\b(?:skype|skype:|skype\sname)\b/i },
  { name: 'wechat',    regex: /\b(?:we[\s\-_]?chat)\b/i },
  // Any external domain that isn't oilbridge
  { name: 'ext_url',   regex: /\b(?!(?:www\.)?oilbridge\.eu)(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|eu|nl|de|fr|pl|es|me|info|biz|us|uk|app)\b/i },
];

function checkBlockedContent(text) {
  for (const p of BLOCKED_PATTERNS) {
    if (p.regex.test(text)) return p.name;
  }
  return null;
}

// matchId -> Set of { res, userId }
const sseClients = new Map();

function sseAdd(matchId, client) {
  if (!sseClients.has(matchId)) sseClients.set(matchId, new Set());
  sseClients.get(matchId).add(client);
}
function sseRemove(matchId, client) {
  const set = sseClients.get(matchId);
  if (set) { set.delete(client); if (!set.size) sseClients.delete(matchId); }
}
function sseBroadcast(matchId, eventName, payload) {
  const set = sseClients.get(matchId);
  if (!set) return;
  const data = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const c of set) {
    try { c.res.write(data); } catch {}
  }
}

function toMessage(row) {
  if (!row) return null;
  return {
    id: row.id, matchId: row.match_id, senderId: row.sender_id,
    body: row.body, blocked: !!row.blocked, blockedReason: row.blocked_reason || null,
    createdAt: row.created_at
  };
}


// Snapshot all data relevant to a match at the moment of creation so we have
// permanent chargeback evidence even if the listing is later deleted or the
// parties' details change.
function buildMatchEvidence(listingRow, buyerId, sellerId, quantity, price) {
  const buyer = queryOne('SELECT id, email, company_name, company_reg, company_country, contact_name FROM users WHERE id = ?', [buyerId]);
  const seller = queryOne('SELECT id, email, company_name, company_reg, company_country, contact_name FROM users WHERE id = ?', [sellerId]);
  return {
    snapshotAt: new Date().toISOString(),
    listing: listingRow ? {
      id: listingRow.id,
      type: listingRow.type,
      oilType: listingRow.oil_type,
      quantity: listingRow.quantity,
      unit: listingRow.unit,
      price: listingRow.price,
      currency: listingRow.currency,
      deliveryLocation: listingRow.delivery_location,
      deliveryDate: listingRow.delivery_date,
      notes: listingRow.notes,
      status: listingRow.status,
      createdAt: listingRow.created_at,
      ownerUserId: listingRow.user_id
    } : null,
    buyer: buyer ? {
      id: buyer.id, email: buyer.email, companyName: buyer.company_name,
      companyReg: buyer.company_reg, companyCountry: buyer.company_country,
      contactName: buyer.contact_name
    } : null,
    seller: seller ? {
      id: seller.id, email: seller.email, companyName: seller.company_name,
      companyReg: seller.company_reg, companyCountry: seller.company_country,
      contactName: seller.contact_name
    } : null,
    agreedQuantity: quantity,
    agreedPrice: price
  };
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
        const rate = getCurrentCommissionRate();
        const evidence = buildMatchEvidence(sell, buy.user_id, sell.user_id, qty, sell.price);
        run(
          `INSERT INTO matches (id, listing_id, buyer_id, seller_id, status, quantity, price_per_unit, total_value, commission, commission_rate, currency, created_at, evidence)
           VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)`,
          [generateId('mtc'), sell.id, buy.user_id, sell.user_id, qty, sell.price, total, total * rate, rate, sell.currency, new Date().toISOString(), JSON.stringify(evidence)]
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
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    body TEXT NOT NULL,
    blocked INTEGER NOT NULL DEFAULT 0,
    blocked_reason TEXT,
    created_at TEXT NOT NULL
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_match ON messages(match_id, created_at)`);
  db.run(`CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY, listing_id TEXT NOT NULL, buyer_id TEXT NOT NULL, seller_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', quantity REAL NOT NULL, price_per_unit REAL NOT NULL,
    total_value REAL NOT NULL, commission REAL NOT NULL, currency TEXT NOT NULL DEFAULT 'USD',
    created_at TEXT NOT NULL
  )`);

  // Migrate: add Stripe payment columns to matches
  try { db.run('ALTER TABLE matches ADD COLUMN commission_paid INTEGER NOT NULL DEFAULT 0'); } catch(e) {}
  try { db.run('ALTER TABLE matches ADD COLUMN stripe_session_id TEXT'); } catch(e) {}

  // Migrate: add KYC verification columns to users
  try { db.run('ALTER TABLE users ADD COLUMN ai_verification TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE users ADD COLUMN ai_verified_at TEXT'); } catch(e) {}
  // Migrate: add Stripe Identity columns (new KYC system)
  try { db.run('ALTER TABLE users ADD COLUMN stripe_identity_session_id TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE users ADD COLUMN stripe_identity_status TEXT'); } catch(e) {}

  // Migrate: add chargeback-evidence column to matches (listing + parties snapshot)
  try { db.run('ALTER TABLE matches ADD COLUMN evidence TEXT'); } catch(e) {}

  // Migrate: add commission rate (for early-adopter pricing)
  try { db.run('ALTER TABLE matches ADD COLUMN commission_rate REAL'); } catch(e) {}

  const count = queryOne('SELECT COUNT(*) as c FROM users');
  if (count && count.c === 0) seedDatabase();
  saveDb();
}

function seedDatabase() {
  // Admin credentials come from env vars. If not set, we generate a
  // cryptographically random initial password and print it ONCE to the
  // server logs so the operator can capture it. The password is never
  // checked into source.
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@oilbridge.eu';
  let adminPassword = process.env.ADMIN_PASSWORD;
  let generated = false;
  if (!adminPassword) {
    adminPassword = crypto.randomBytes(18).toString('base64url');
    generated = true;
  }
  db.run(
    'INSERT INTO users (id,email,password,role,company_name,company_reg,company_country,company_vat,contact_name,contact_phone,contact_position,kyc_status,nda_accepted,documents,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ['admin-001', adminEmail, hashPassword(adminPassword), 'admin', 'OilBridge', 'KVK-00000000', 'Netherlands', '', 'Platform Administrator', '', 'System Administrator', 'verified', 1, '[]', new Date().toISOString()]
  );
  if (generated) {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  INITIAL ADMIN ACCOUNT CREATED');
    console.log('  EMAIL:    ' + adminEmail);
    console.log('  PASSWORD: ' + adminPassword);
    console.log('  Save this NOW — it will not be shown again.');
    console.log('  Set ADMIN_PASSWORD env var to override on next deploy.');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
  } else {
    console.log(`Database initialized with admin account (${adminEmail}).`);
  }
}

// Rotate the admin password in place when ADMIN_PASSWORD env var changes.
// Called on every startup after the DB is loaded.
function syncAdminPassword() {
  if (!process.env.ADMIN_PASSWORD) return;
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@oilbridge.eu';
  const admin = queryOne("SELECT id, password FROM users WHERE role = 'admin' AND email = ?", [adminEmail]);
  if (!admin) return;
  // Only re-hash and write if the current env password doesn't match the stored one
  if (!verifyPassword(process.env.ADMIN_PASSWORD, admin.password)) {
    run('UPDATE users SET password = ? WHERE id = ?', [hashPassword(process.env.ADMIN_PASSWORD), admin.id]);
    console.log(`[admin] Password rotated from ADMIN_PASSWORD env var (${adminEmail}).`);
  }
}

// ============================================================
// Express app setup
// ============================================================
function createApp() {
  const app = express();

  // Behind Railway's proxy — honor X-Forwarded-For so req.ip is the client IP
  app.set('trust proxy', 1);

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
    try {
      // --- Commission payment (Stripe Checkout) ---
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const matchId = session.metadata && session.metadata.matchId;
        if (matchId) {
          run('UPDATE matches SET commission_paid = 1, status = ? WHERE id = ?', ['completed', matchId]);
          console.log(`Commission paid for match ${matchId}`);
          sseBroadcast(matchId, 'deal_confirmed', { matchId, at: new Date().toISOString() });
        }
      }
      // --- Identity verification (Stripe Identity) ---
      else if (event.type === 'identity.verification_session.verified') {
        const session = event.data.object;
        const userId = session.metadata && session.metadata.userId;
        if (userId) {
          const details = {
            status: 'verified',
            summary: 'Identity verified via Stripe Identity.',
            stripeSessionId: session.id,
            timestamp: new Date().toISOString()
          };
          run('UPDATE users SET kyc_status = ?, stripe_identity_status = ?, ai_verification = ?, ai_verified_at = ? WHERE id = ?',
              ['verified', 'verified', JSON.stringify(details), new Date().toISOString(), userId]);
          console.log(`[KYC] Stripe Identity verified for user ${userId}`);
          const user = queryOne('SELECT * FROM users WHERE id = ?', [userId]);
          if (user) sendKycResultEmail(user, 'verified', details.summary).catch(e => console.error('KYC email failed:', e.message));
        }
      }
      else if (event.type === 'identity.verification_session.requires_input') {
        const session = event.data.object;
        const userId = session.metadata && session.metadata.userId;
        const reason = (session.last_error && session.last_error.reason) || 'Verification failed — please try again with clearer photos.';
        if (userId) {
          const details = {
            status: 'rejected',
            summary: `Stripe Identity could not verify the submission: ${reason}`,
            stripeSessionId: session.id,
            lastError: session.last_error || null,
            timestamp: new Date().toISOString()
          };
          run('UPDATE users SET kyc_status = ?, stripe_identity_status = ?, ai_verification = ?, ai_verified_at = ? WHERE id = ?',
              ['rejected', 'requires_input', JSON.stringify(details), new Date().toISOString(), userId]);
          console.log(`[KYC] Stripe Identity requires input for user ${userId}: ${reason}`);
          const user = queryOne('SELECT * FROM users WHERE id = ?', [userId]);
          if (user) sendKycResultEmail(user, 'rejected', details.summary).catch(e => console.error('KYC email failed:', e.message));
        }
      }
      else if (event.type === 'identity.verification_session.canceled') {
        const session = event.data.object;
        const userId = session.metadata && session.metadata.userId;
        if (userId) {
          run('UPDATE users SET stripe_identity_status = ? WHERE id = ?', ['canceled', userId]);
          console.log(`[KYC] Stripe Identity canceled for user ${userId}`);
        }
      }
    } catch (err) {
      console.error('Webhook handler error:', err.message);
      // Return 200 anyway so Stripe doesn't retry indefinitely — we've already logged the failure.
    }
    res.json({ received: true });
  });

  // 50MB limit to accommodate base64-encoded KYC documents (max 5 files x 5MB each)
  app.use(express.json({ limit: '50mb' }));

  // Async route wrapper — forwards rejected promises to the error middleware
  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

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

  // ========== Registration rate limit + sanctioned country block ==========
  // In-memory rolling 24h limiter keyed by client IP. State is not persisted
  // across server restarts — acceptable for spam prevention at this scale;
  // migrate to the DB if higher guarantees are needed.
  const REG_LIMITS = new Map();               // ip -> { count, windowStart }
  const REG_WINDOW_MS = 24 * 60 * 60 * 1000;  // 24 hours
  const REG_MAX = 5;

  // Periodic cleanup so the map doesn't grow unbounded
  setInterval(() => {
    const cutoff = Date.now() - REG_WINDOW_MS;
    for (const [ip, v] of REG_LIMITS) if (v.windowStart < cutoff) REG_LIMITS.delete(ip);
  }, 60 * 60 * 1000).unref();

  // EU + OFAC sanctioned country list (lowercased, with common name variants)
  const SANCTIONED_COUNTRIES = new Set([
    'russia', 'russian federation', 'ru', 'rus',
    'belarus', 'by', 'blr',
    'iran', 'islamic republic of iran', 'ir', 'irn',
    'north korea', 'democratic people\'s republic of korea', "democratic people's republic of korea",
    'dprk', 'korea, north', 'korea (north)', 'kp', 'prk',
    'syria', 'syrian arab republic', 'sy', 'syr',
    'cuba', 'cu', 'cub'
  ]);

  function isSanctionedCountry(country) {
    if (!country) return false;
    return SANCTIONED_COUNTRIES.has(String(country).trim().toLowerCase());
  }

  function registrationRateLimit(req, res, next) {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const entry = REG_LIMITS.get(ip);
    if (!entry || now - entry.windowStart > REG_WINDOW_MS) {
      REG_LIMITS.set(ip, { count: 1, windowStart: now });
      return next();
    }
    if (entry.count >= REG_MAX) {
      const retrySec = Math.ceil((REG_WINDOW_MS - (now - entry.windowStart)) / 1000);
      console.warn(`[rate-limit] Blocked registration from ${ip} — ${entry.count} attempts in 24h`);
      return res.status(429).set('Retry-After', String(retrySec)).json({
        error: `Too many registration attempts from your network. Please try again in ${Math.ceil(retrySec/3600)} hour(s).`,
        retryAfterSeconds: retrySec
      });
    }
    entry.count++;
    next();
  }

  // ========== Auth Routes ==========
  // Registration no longer collects KYC documents — identity is verified
  // via Stripe Identity after the account is created (see /api/kyc/start).
  app.post('/api/auth/register', registrationRateLimit, (req, res) => {
    const { email, password, companyName, companyReg, companyCountry, companyVat, contactName, contactPhone, contactPosition, ndaAccepted } = req.body;
    if (!email || !password || !companyName || !companyReg || !companyCountry || !contactName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (isSanctionedCountry(companyCountry)) {
      console.warn(`[sanctions] Blocked registration for ${email} — country "${companyCountry}" is sanctioned`);
      return res.status(403).json({
        error: 'Registrations from this country are not permitted due to EU sanctions compliance. If you believe this is a mistake, please contact contact@oilbridge.eu.',
        code: 'country_sanctioned'
      });
    }
    if (!ndaAccepted) return res.status(400).json({ error: 'You must accept the NDA to register' });
    if (queryOne('SELECT id FROM users WHERE email = ?', [email])) {
      return res.status(409).json({ error: 'Email already registered.' });
    }
    const id = generateId('user');
    run(
      `INSERT INTO users (id,email,password,role,company_name,company_reg,company_country,company_vat,contact_name,contact_phone,contact_position,kyc_status,nda_accepted,documents,created_at)
       VALUES (?,?,?,'user',?,?,?,?,?,?,?,'pending',?,'[]',?)`,
      [id, email, hashPassword(password), companyName, companyReg, companyCountry, companyVat||'', contactName, contactPhone||'', contactPosition||'', ndaAccepted?1:0, new Date().toISOString()]
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
  // Strip large dataUrl content from documents in list responses (kept only on GET /:id)
  function stripDocContent(user) {
    if (!user || !Array.isArray(user.documents)) return user;
    user.documents = user.documents.map(d =>
      typeof d === 'object' && d !== null
        ? { name: d.name, type: d.type, size: d.size }
        : d
    );
    return user;
  }

  app.get('/api/users', auth, adminOnly, (req, res) => {
    const status = req.query.status;
    const rows = status
      ? queryAll("SELECT * FROM users WHERE role != 'admin' AND kyc_status = ? ORDER BY created_at DESC", [status])
      : queryAll("SELECT * FROM users WHERE role != 'admin' ORDER BY created_at DESC");
    res.json(rows.map(r => stripDocContent(toUser(r))));
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
        // SECURITY: never expose contact_name / email / contact_phone to the counterparty —
        // all coordination must go through OilBridge chat, including after payment.
        const cp = queryOne('SELECT company_name, company_country FROM users WHERE id = ?', [cpId]);
        if (cp) counterparty = { companyName: cp.company_name, companyCountry: cp.company_country };
      }
      return {
        ...toMatch(m),
        dealRef: 'OB-' + String(m.id).slice(-8).toUpperCase(),
        listing: listing ? { oilType: listing.oil_type, unit: listing.unit } : null,
        counterparty
      };
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
    const rate = getCurrentCommissionRate();
    const evidence = buildMatchEvidence(listing, buyerId, sellerId, listing.quantity, listing.price);
    run(
      "INSERT INTO matches (id,listing_id,buyer_id,seller_id,status,quantity,price_per_unit,total_value,commission,commission_rate,currency,created_at,evidence) VALUES (?,?,?,?,'pending',?,?,?,?,?,?,?,?)",
      [generateId('mtc'), listing.id, buyerId, sellerId, listing.quantity, listing.price, total, total*rate, rate, listing.currency, new Date().toISOString(), JSON.stringify(evidence)]
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

  // ========== Chat Routes ==========
  // Helper: ensure user is a participant in the match
  function getMatchAsParticipant(matchId, userId) {
    const m = queryOne('SELECT * FROM matches WHERE id = ?', [matchId]);
    if (!m) return { error: 'Match not found', code: 404 };
    if (m.buyer_id !== userId && m.seller_id !== userId) return { error: 'Forbidden', code: 403 };
    return { match: m };
  }

  // GET /api/matches/:id/messages — chat history for participants
  app.get('/api/matches/:id/messages', auth, (req, res) => {
    const r = getMatchAsParticipant(req.params.id, req.user.id);
    if (r.error) return res.status(r.code).json({ error: r.error });
    const rows = queryAll(
      'SELECT * FROM messages WHERE match_id = ? AND blocked = 0 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json({
      match: { id: r.match.id, status: r.match.status, commissionPaid: !!r.match.commission_paid },
      messages: rows.map(toMessage)
    });
  });

  // POST /api/matches/:id/messages — send a message
  app.post('/api/matches/:id/messages', auth, ah(async (req, res) => {
    const r = getMatchAsParticipant(req.params.id, req.user.id);
    if (r.error) return res.status(r.code).json({ error: r.error });
    // Chat stays open on accepted AND completed matches — all logistics coordination happens here,
    // including post-payment delivery arrangements. Contact details are never revealed.
    if (r.match.status !== 'accepted' && r.match.status !== 'completed') {
      return res.status(400).json({ error: 'Chat is only available on accepted matches' });
    }

    const body = String(req.body.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Message body required' });
    if (body.length > 2000) return res.status(400).json({ error: 'Message too long (max 2000 chars)' });

    const blockedReason = checkBlockedContent(body);
    const id = generateId('msg');
    const createdAt = new Date().toISOString();

    run(
      'INSERT INTO messages (id, match_id, sender_id, body, blocked, blocked_reason, created_at) VALUES (?,?,?,?,?,?,?)',
      [id, req.params.id, req.user.id, body, blockedReason ? 1 : 0, blockedReason || null, createdAt]
    );

    if (blockedReason) {
      // Tell sender it was blocked. Recipient is not notified.
      return res.status(200).json({
        blocked: true,
        reason: blockedReason,
        message: 'SECURITY WARNING: your message contained contact information and was blocked. Sharing personal contact details (email, phone, WhatsApp, etc.) violates our Terms of Service and NDA agreement. All communication must remain on OilBridge, including after commission is paid.'
      });
    }

    const message = toMessage(queryOne('SELECT * FROM messages WHERE id = ?', [id]));
    sseBroadcast(req.params.id, 'message', message);
    res.status(201).json({ success: true, message });

    // Email notification to recipient (fire-and-forget)
    const recipientId = r.match.buyer_id === req.user.id ? r.match.seller_id : r.match.buyer_id;
    const sender = queryOne('SELECT company_name FROM users WHERE id = ?', [req.user.id]);
    const recipient = queryOne('SELECT email, contact_name FROM users WHERE id = ?', [recipientId]);
    if (recipient && recipient.email) {
      const baseUrl = process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;
      sendEmail({
        to: recipient.email,
        subject: `New message from ${sender ? sender.company_name : 'a counterparty'} on OilBridge`,
        html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1c1b">
          <h2 style="color:#c8860a">New message on OilBridge</h2>
          <p>Hi ${recipient.contact_name || ''},</p>
          <p><strong>${sender ? sender.company_name : 'A trader'}</strong> sent you a message about your matched trade.</p>
          <p style="background:#f5f5f4;padding:12px 16px;border-radius:6px;font-size:0.9rem;color:#555;border-left:3px solid #c8860a">${body.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</p>
          <p style="margin-top:24px"><a href="${baseUrl}/#chat/${req.params.id}" style="background:#c8860a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Reply on OilBridge</a></p>
          <p style="font-size:0.8rem;color:#888;margin-top:24px">For your protection, all communication stays on OilBridge until commission is paid. Sharing direct contact details (email, phone, WhatsApp, etc.) is automatically blocked.</p>
        </div>`
      }).catch(err => console.error('Chat notification email failed:', err.message));
    }
  }));

  // GET /api/matches/:id/stream — SSE for live updates (token via query param since EventSource lacks headers)
  app.get('/api/matches/:id/stream', (req, res) => {
    try {
      const token = req.query.token;
      const session = token ? queryOne('SELECT user_id FROM sessions WHERE token = ?', [token]) : null;
      if (!session) return res.status(401).end();
      const user = queryOne('SELECT * FROM users WHERE id = ?', [session.user_id]);
      if (!user) return res.status(401).end();

      const m = queryOne('SELECT * FROM matches WHERE id = ?', [req.params.id]);
      if (!m) return res.status(404).end();
      if (m.buyer_id !== user.id && m.seller_id !== user.id && user.role !== 'admin') return res.status(403).end();

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.write(`: connected\n\n`);

      const client = { res, userId: user.id };
      sseAdd(req.params.id, client);

      const ka = setInterval(() => {
        try { res.write(`: ka\n\n`); } catch {}
      }, 25000);

      req.on('close', () => {
        clearInterval(ka);
        sseRemove(req.params.id, client);
      });
    } catch (err) {
      console.error('[SSE] stream error:', err.message);
      try {
        if (!res.headersSent) res.status(500).end();
        else res.end();
      } catch {}
    }
  });

  // GET /api/admin/chats — overview of all chat threads
  app.get('/api/admin/chats', auth, adminOnly, (req, res) => {
    const rows = queryAll(`
      SELECT m.id as match_id, m.status, m.commission_paid,
             m.buyer_id, m.seller_id,
             COUNT(msg.id) as msg_count,
             SUM(CASE WHEN msg.blocked = 1 THEN 1 ELSE 0 END) as blocked_count,
             MAX(msg.created_at) as last_at
      FROM matches m
      LEFT JOIN messages msg ON msg.match_id = m.id
      GROUP BY m.id
      HAVING COUNT(msg.id) > 0
      ORDER BY last_at DESC
    `);
    const enriched = rows.map(r => {
      const buyer = queryOne('SELECT company_name FROM users WHERE id = ?', [r.buyer_id]);
      const seller = queryOne('SELECT company_name FROM users WHERE id = ?', [r.seller_id]);
      return {
        matchId: r.match_id, status: r.status, commissionPaid: !!r.commission_paid,
        buyer: buyer ? buyer.company_name : null, seller: seller ? seller.company_name : null,
        messageCount: r.msg_count, blockedCount: r.blocked_count || 0,
        lastMessageAt: r.last_at
      };
    });
    res.json(enriched);
  });

  // GET /api/admin/chats/:matchId — full chat including blocked messages
  app.get('/api/admin/chats/:matchId', auth, adminOnly, (req, res) => {
    const m = queryOne('SELECT * FROM matches WHERE id = ?', [req.params.matchId]);
    if (!m) return res.status(404).json({ error: 'Match not found' });
    const messages = queryAll('SELECT * FROM messages WHERE match_id = ? ORDER BY created_at ASC', [req.params.matchId]).map(toMessage);
    const buyer = queryOne('SELECT company_name, contact_name, email FROM users WHERE id = ?', [m.buyer_id]);
    const seller = queryOne('SELECT company_name, contact_name, email FROM users WHERE id = ?', [m.seller_id]);
    res.json({
      match: { id: m.id, status: m.status, commissionPaid: !!m.commission_paid, buyerId: m.buyer_id, sellerId: m.seller_id },
      buyer, seller, messages
    });
  });

  // GET /api/admin/matches/:id/evidence — full chargeback-protection bundle.
  // Combines the at-creation snapshot (listing + both parties frozen at
  // match time) with the complete chat transcript, payment metadata, and
  // current-state info. Suitable for exporting to a payment processor
  // during a chargeback dispute.
  app.get('/api/admin/matches/:id/evidence', auth, adminOnly, (req, res) => {
    const m = queryOne('SELECT * FROM matches WHERE id = ?', [req.params.id]);
    if (!m) return res.status(404).json({ error: 'Match not found' });
    let snapshot = null;
    try { if (m.evidence) snapshot = JSON.parse(m.evidence); } catch {}
    const messages = queryAll('SELECT * FROM messages WHERE match_id = ? ORDER BY created_at ASC', [m.id]).map(toMessage);
    const currentBuyer = queryOne('SELECT company_name, contact_name, email, company_country FROM users WHERE id = ?', [m.buyer_id]);
    const currentSeller = queryOne('SELECT company_name, contact_name, email, company_country FROM users WHERE id = ?', [m.seller_id]);
    res.json({
      evidenceExport: {
        exportedAt: new Date().toISOString(),
        matchId: m.id,
        transactionState: {
          status: m.status,
          commissionPaid: !!m.commission_paid,
          quantity: m.quantity,
          pricePerUnit: m.price_per_unit,
          totalValue: m.total_value,
          commission: m.commission,
          currency: m.currency,
          stripeSessionId: m.stripe_session_id || null,
          createdAt: m.created_at
        },
        atMatchTime: snapshot,     // frozen buyer/seller/listing at creation
        currentParties: { buyer: currentBuyer, seller: currentSeller },
        chatTranscript: messages   // full message history, blocked entries included
      }
    });
  });

  // ========== Stripe Payment Routes ==========
  app.post('/api/payments/create-session', auth, ah(async (req, res) => {
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
      const matchRate = match.commission_rate != null ? match.commission_rate : COMMISSION_RATE;
      const ratePct = (matchRate * 100).toFixed(matchRate === EARLY_ADOPTER_RATE ? 0 : 1);
      const isEarly = matchRate === EARLY_ADOPTER_RATE;
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: match.currency.toLowerCase(),
            product_data: {
              name: `OilBridge Trade Commission (${ratePct}%${isEarly ? ' — Early Adopter Rate' : ''})`,
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
  }));

  app.get('/api/payments/verify-session', auth, ah(async (req, res) => {
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
  }));

  // ========== Stripe Identity (KYC) Routes ==========
  // Heuristic for detecting errors where the Stripe account doesn't have
  // Identity enabled (or is in a region/country where it isn't available).
  // When this happens we fall back to a manual document-upload flow.
  function isIdentityUnavailableError(err) {
    if (!err) return false;
    const msg = String(err.message || '').toLowerCase();
    const code = String(err.code || '').toLowerCase();
    const type = String(err.type || '').toLowerCase();
    return (
      // Most common: account hasn't enabled the product
      msg.includes('identity') && (msg.includes('not enabled') || msg.includes('not available') || msg.includes('not activated') || msg.includes('does not have access')) ||
      msg.includes("this api call requires the 'identity'") ||
      msg.includes('account_invalid') ||
      code === 'account_inactive' ||
      type === 'stripepermissionerror'
    );
  }

  // POST /api/kyc/start — creates a Stripe Identity VerificationSession and
  // returns the hosted URL the client should redirect to. Falls back to
  // document upload if Stripe Identity isn't enabled on the account.
  app.post('/api/kyc/start', auth, ah(async (req, res) => {
    if (!stripe) {
      console.warn('[KYC] /api/kyc/start called but STRIPE_SECRET_KEY is not set');
      return res.status(503).json({
        error: 'Stripe is not configured. Set STRIPE_SECRET_KEY.',
        code: 'stripe_not_configured',
        fallback: 'document_upload'
      });
    }
    if (req.user.kyc_status === 'verified') {
      return res.status(400).json({ error: 'Already verified', code: 'already_verified' });
    }

    const baseUrl = process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;
    console.log(`[KYC] Starting Stripe Identity for ${req.user.email} (return_url=${baseUrl}/#kyc-complete)`);
    try {
      const session = await stripe.identity.verificationSessions.create({
        type: 'document',
        provided_details: { email: req.user.email },
        metadata: {
          userId: req.user.id,
          companyName: req.user.company_name || '',
          // Reference only — Stripe Identity is priced per verification at
          // the account level, this metadata field doesn't control pricing.
          priceId: process.env.STRIPE_IDENTITY_PRICE_ID || ''
        },
        options: {
          document: {
            allowed_types: ['driving_license', 'passport', 'id_card'],
            require_matching_selfie: true,
            require_live_capture: true,
            require_id_number: false
          }
        },
        return_url: `${baseUrl}/#kyc-complete`
      });

      run('UPDATE users SET stripe_identity_session_id = ?, stripe_identity_status = ? WHERE id = ?',
          [session.id, session.status, req.user.id]);

      console.log(`[KYC] Stripe Identity session ${session.id} created for ${req.user.email}`);
      res.json({ url: session.url, sessionId: session.id, status: session.status });
    } catch (err) {
      // Verbose logging so the operator can diagnose real issues from Railway logs.
      console.error('[KYC] Stripe Identity session creation FAILED');
      console.error('      type:       ', err && err.type);
      console.error('      code:       ', err && err.code);
      console.error('      statusCode: ', err && err.statusCode);
      console.error('      message:    ', err && err.message);
      console.error('      requestId:  ', err && err.requestId);
      if (err && err.raw && err.raw.param) console.error('      param:      ', err.raw.param);

      if (isIdentityUnavailableError(err)) {
        console.warn('[KYC] Stripe Identity appears to be disabled on this account — offering document-upload fallback.');
        return res.status(503).json({
          error: 'Stripe Identity is not enabled on this Stripe account. You can still complete verification by uploading your ID documents for manual review.',
          code: 'identity_not_enabled',
          stripeType: err && err.type,
          stripeCode: err && err.code,
          fallback: 'document_upload'
        });
      }

      res.status(500).json({
        error: 'Failed to start identity verification: ' + (err && err.message ? err.message : 'unknown Stripe error'),
        code: (err && err.code) || 'stripe_error',
        stripeType: err && err.type,
        stripeRequestId: err && err.requestId,
        fallback: 'document_upload'
      });
    }
  }));

  // POST /api/kyc/upload — manual document upload fallback for cases where
  // Stripe Identity isn't available. Documents are stored and reviewed by
  // an admin.
  app.post('/api/kyc/upload', auth, ah(async (req, res) => {
    if (req.user.kyc_status === 'verified') {
      return res.status(400).json({ error: 'Already verified' });
    }

    const { documents } = req.body;
    if (!Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({ error: 'At least one document is required' });
    }
    if (documents.length > 3) {
      return res.status(400).json({ error: 'Maximum 3 documents allowed' });
    }

    const VALID = ['image/jpeg', 'image/jpg', 'image/png'];
    const MIN = 100 * 1024, MAX = 5 * 1024 * 1024;
    for (const d of documents) {
      if (!d || typeof d !== 'object') return res.status(400).json({ error: 'Invalid document format' });
      if (!d.name || !d.dataUrl) return res.status(400).json({ error: 'Each document must have name and content' });
      if (!VALID.includes(d.type)) return res.status(400).json({ error: `${d.name}: only JPG and PNG accepted` });
      if (typeof d.size !== 'number' || d.size < MIN) return res.status(400).json({ error: `${d.name}: too small (min 100 KB)` });
      if (d.size > MAX) return res.status(400).json({ error: `${d.name}: too large (max 5 MB)` });
      if (typeof d.dataUrl !== 'string' || !d.dataUrl.startsWith('data:')) return res.status(400).json({ error: `${d.name}: invalid content` });
    }

    run('UPDATE users SET documents = ?, kyc_status = ? WHERE id = ?',
        [JSON.stringify(documents), 'pending', req.user.id]);

    console.log(`[KYC] Manual upload: ${req.user.email} submitted ${documents.length} document(s) for admin review`);
    res.json({
      success: true,
      message: 'Documents submitted for manual review. An admin will review them and you will receive an email with the result.'
    });
  }));

  // GET /api/kyc/status — returns the caller's current KYC status (for polling
  // after the user returns from the Stripe-hosted flow).
  app.get('/api/kyc/status', auth, (req, res) => {
    const u = queryOne('SELECT kyc_status, stripe_identity_status, stripe_identity_session_id, ai_verification, documents FROM users WHERE id = ?', [req.user.id]);
    let reason = null;
    try {
      if (u && u.ai_verification) {
        const parsed = JSON.parse(u.ai_verification);
        reason = parsed.summary || parsed.reason || null;
      }
    } catch {}
    let docCount = 0;
    try { docCount = (JSON.parse((u && u.documents) || '[]') || []).length; } catch {}
    res.json({
      kycStatus: (u && u.kyc_status) || 'pending',
      stripeStatus: (u && u.stripe_identity_status) || null,
      sessionId: (u && u.stripe_identity_session_id) || null,
      reason,
      hasManualUpload: docCount > 0
    });
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

  // ========== Public Stats (homepage trust indicators, unauthenticated) ==========
  // Approximate FX rates for display only (Apr 2026 ballpark).
  // In production you'd fetch these from an FX API and cache them.
  const FX_TO_EUR = { EUR: 1.0, USD: 0.92, GBP: 1.17 };
  app.get('/api/public-stats', (req, res) => {
    try {
      const completedDeals = (queryOne("SELECT COUNT(*) as c FROM matches WHERE status = 'completed'") || {}).c || 0;
      const verifiedTraders = (queryOne("SELECT COUNT(*) as c FROM users WHERE role != 'admin' AND kyc_status = 'verified'") || {}).c || 0;
      const activeListings = (queryOne("SELECT COUNT(*) as c FROM listings WHERE status = 'active'") || {}).c || 0;
      const completedMatches = queryAll("SELECT total_value, currency FROM matches WHERE status = 'completed'");
      const totalVolumeEur = completedMatches.reduce((sum, m) =>
        sum + (Number(m.total_value) || 0) * (FX_TO_EUR[m.currency] || 1), 0
      );
      const currentRate = getCurrentCommissionRate();
      res.json({
        completedDeals, verifiedTraders, activeListings,
        totalVolumeEur: Math.round(totalVolumeEur),
        commissionRate: currentRate,
        earlyAdopterRate: EARLY_ADOPTER_RATE,
        standardRate: COMMISSION_RATE,
        earlyAdopterLimit: EARLY_ADOPTER_LIMIT,
        earlyAdopterSlotsLeft: Math.max(0, EARLY_ADOPTER_LIMIT - completedDeals),
        earlyAdopterActive: currentRate === EARLY_ADOPTER_RATE
      });
    } catch (err) {
      console.error('[public-stats]', err.message);
      res.json({ completedDeals: 0, verifiedTraders: 0, activeListings: 0, totalVolumeEur: 0 });
    }
  });

  // ========== Health Check (for Railway / uptime monitoring) ==========
  app.get(['/health', '/api/health'], (req, res) => {
    let dbOk = true, dbError = null;
    try { queryOne('SELECT 1 as ok'); } catch (e) { dbOk = false; dbError = e.message; }
    const payload = {
      status: dbOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      port: String(PORT),
      checks: {
        database: dbOk ? 'ok' : 'error',
        stripe: stripe ? 'configured' : 'disabled',
        stripeIdentity: stripe ? 'configured' : 'disabled',
        email: process.env.RESEND_API_KEY ? 'configured' : 'disabled'
      }
    };
    if (dbError) payload.errors = { database: dbError };
    res.status(dbOk ? 200 : 503).json(payload);
  });

  // ========== SEO: sitemap.xml & robots.txt (served inline for reliability) ==========
  const SITE_URL = process.env.SITE_URL || 'https://www.oilbridge.eu';
  const SITEMAP_URLS = [
    { loc: '/',                                changefreq: 'daily',   priority: '1.0' },
    { loc: '/#listings',                       changefreq: 'hourly',  priority: '0.9' },
    { loc: '/#register',                       changefreq: 'monthly', priority: '0.8' },
    { loc: '/#login',                          changefreq: 'monthly', priority: '0.7' },
    { loc: '/#blog',                           changefreq: 'weekly',  priority: '0.8' },
    { loc: '/#blog/buy-oil-bulk-europe',       changefreq: 'monthly', priority: '0.7' },
    { loc: '/#blog/eu-oil-marketplace-guide-sme', changefreq: 'monthly', priority: '0.7' },
    { loc: '/#blog/sell-surplus-oil-europe',   changefreq: 'monthly', priority: '0.7' },
    { loc: '/#terms',                          changefreq: 'yearly',  priority: '0.3' },
    { loc: '/#privacy',                        changefreq: 'yearly',  priority: '0.3' },
  ];

  app.get('/sitemap.xml', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const urls = SITEMAP_URLS.map(u =>
      `  <url>\n    <loc>${SITE_URL}${u.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
    ).join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(xml);
  });

  app.get('/robots.txt', (req, res) => {
    const txt = `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(txt);
  });

  // ========== Static & SPA fallback ==========
  app.use('/css', express.static(path.join(__dirname, 'css')));
  app.use('/js', express.static(path.join(__dirname, 'js')));
  app.use('/assets', express.static(path.join(__dirname, 'assets')));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

  // ========== Global error handler — last-resort for any route that throws ==========
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[Express error]', req.method, req.path, '—', err && err.stack ? err.stack : err);
    if (res.headersSent) {
      try { res.end(); } catch {}
      return;
    }
    if (req.path && req.path.startsWith('/api/')) {
      res.status(500).json({ error: 'Internal server error' });
    } else {
      res.status(500).sendFile(path.join(__dirname, 'index.html'));
    }
  });

  return app;
}

// ============================================================
// Daily JSON Backups
// ============================================================
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const BACKUP_RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS, 10) || 30;

function performBackup() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const dateStr = new Date().toISOString().split('T')[0];
    const filePath = path.join(BACKUP_DIR, `backup-${dateStr}.json`);
    const backup = {
      version: 1,
      generatedAt: new Date().toISOString(),
      tables: {
        users:    queryAll('SELECT * FROM users'),
        listings: queryAll('SELECT * FROM listings'),
        matches:  queryAll('SELECT * FROM matches'),
        messages: queryAll('SELECT * FROM messages')
        // sessions are excluded (ephemeral auth state)
      }
    };
    // Write atomically
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(backup, null, 2));
    fs.renameSync(tmp, filePath);
    const size = fs.statSync(filePath).size;
    console.log(`[backup] Wrote ${filePath} (${(size / 1024).toFixed(1)} KB)`);

    // Rotate: keep the most recent N files
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort()
      .reverse();
    for (let i = BACKUP_RETENTION_DAYS; i < files.length; i++) {
      try { fs.unlinkSync(path.join(BACKUP_DIR, files[i])); console.log(`[backup] Removed ${files[i]}`); }
      catch (err) { console.error(`[backup] Could not remove ${files[i]}:`, err.message); }
    }
  } catch (err) {
    console.error('[backup] Failed:', err && err.stack ? err.stack : err);
  }
}

function scheduleBackups() {
  // If today's backup doesn't exist yet, run one 10s after startup
  try {
    const dateStr = new Date().toISOString().split('T')[0];
    const todayFile = path.join(BACKUP_DIR, `backup-${dateStr}.json`);
    if (!fs.existsSync(todayFile)) setTimeout(performBackup, 10_000);
  } catch {}
  // Then check every hour whether we've already done today's backup
  setInterval(() => {
    const dateStr = new Date().toISOString().split('T')[0];
    const todayFile = path.join(BACKUP_DIR, `backup-${dateStr}.json`);
    if (!fs.existsSync(todayFile)) performBackup();
  }, 60 * 60 * 1000).unref();
}

// ============================================================
// Uptime: startup/crash alerts via heartbeat file
// ============================================================
// A server cannot reliably detect its own downtime — for real uptime
// alerts point an external monitor (UptimeRobot, BetterStack) at
// https://your-domain/health. The heartbeat below catches UNCLEAN
// shutdowns and emails the admin so crashes are at least visible.
const HEARTBEAT_FILE = path.join(DATA_DIR, '.heartbeat');

function detectAndNotifyUncleanRestart() {
  try {
    if (!fs.existsSync(HEARTBEAT_FILE)) return; // first run, nothing to report
    const raw = fs.readFileSync(HEARTBEAT_FILE, 'utf8');
    const lastBeat = new Date(raw.trim());
    if (isNaN(lastBeat.getTime())) return;
    const secondsSince = Math.round((Date.now() - lastBeat.getTime()) / 1000);

    // Any existing heartbeat at startup means the previous process did not
    // shut down cleanly (clean shutdowns delete it).
    const minutes = Math.round(secondsSince / 60);
    console.warn(`[uptime] Detected unclean shutdown — previous heartbeat was ${minutes} minute(s) ago`);
    sendEmail({
      to: process.env.ALERT_EMAIL || 'contact@oilbridge.eu',
      subject: `OilBridge restarted unexpectedly`,
      html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1c1b">
        <h2 style="color:#c0392b">OilBridge restarted unexpectedly</h2>
        <p>The OilBridge server restarted on <strong>${new Date().toISOString()}</strong>. The previous process last wrote a heartbeat <strong>${minutes} minute(s) ago</strong>, which means it did not shut down cleanly (likely a crash or out-of-memory kill).</p>
        <p>Check the Railway logs for the failure reason.</p>
        <p style="font-size:0.8rem;color:#888;margin-top:32px">For true uptime monitoring, set up an external pinger (UptimeRobot, BetterStack) against <code>/health</code>.</p>
      </div>`
    }).catch(err => console.error('[uptime] Alert email failed:', err.message));
  } catch (err) {
    console.error('[uptime] heartbeat read failed:', err.message);
  }
}

function startHeartbeat() {
  const write = () => {
    try { fs.writeFileSync(HEARTBEAT_FILE, new Date().toISOString()); } catch {}
  };
  write();
  setInterval(write, 60_000).unref();
  const cleanShutdown = () => {
    try { fs.unlinkSync(HEARTBEAT_FILE); } catch {}
    process.exit(0);
  };
  process.on('SIGINT', cleanShutdown);
  process.on('SIGTERM', cleanShutdown);
}

async function sendStartupNotification() {
  try {
    await sendEmail({
      to: process.env.ALERT_EMAIL || 'contact@oilbridge.eu',
      subject: 'OilBridge server started',
      html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1c1b">
        <h2>OilBridge server started</h2>
        <p>OilBridge started at <strong>${new Date().toISOString()}</strong> on port ${PORT}.</p>
        <p style="font-size:0.85rem;color:#888">If you did not trigger this restart, check Railway for a crash or redeploy.</p>
      </div>`
    });
  } catch (err) {
    console.error('[uptime] Startup notification failed:', err.message);
  }
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
  syncAdminPassword();

  // Uptime hooks BEFORE the listener so we don't miss a crash
  detectAndNotifyUncleanRestart();
  startHeartbeat();

  // Schedule daily backups
  scheduleBackups();

  const app = createApp();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`OilBridge running on 0.0.0.0:${PORT}`);
    sendStartupNotification(); // non-blocking
  });
})();
