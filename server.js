const express = require('express');
const initSqlJs = require('sql.js');
const Stripe = require('stripe');
const Anthropic = require('@anthropic-ai/sdk');
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

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;
const KYC_MODEL = process.env.KYC_MODEL || 'claude-sonnet-4-6';

if (anthropic) console.log(`AI KYC verification enabled (${KYC_MODEL}).`);
else console.log('AI KYC verification not configured — set ANTHROPIC_API_KEY to enable.');

if (process.env.RESEND_API_KEY) console.log('Email notifications enabled (Resend).');
else console.log('Email notifications not configured — set RESEND_API_KEY to enable real emails.');

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
  let aiVerification = null;
  try { if (row.ai_verification) aiVerification = JSON.parse(row.ai_verification); } catch {}
  return {
    id: row.id, email: row.email, role: row.role,
    companyName: row.company_name, companyReg: row.company_reg,
    companyCountry: row.company_country, companyVat: row.company_vat,
    contactName: row.contact_name, contactPhone: row.contact_phone,
    contactPosition: row.contact_position, kycStatus: row.kyc_status,
    ndaAccepted: !!row.nda_accepted,
    documents: JSON.parse(row.documents || '[]'),
    aiVerification,
    aiVerifiedAt: row.ai_verified_at || null,
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
        from: process.env.EMAIL_FROM || 'OilBridge <noreply@oilbridge.eu>',
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
      <p>Great news — your KYC verification has been <strong>approved</strong>. You now have full access to the OilBridge marketplace and can start placing buy and sell listings immediately.</p>
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
// AI KYC Verification (Claude API)
// ============================================================
function extractBase64(dataUrl) {
  const match = (dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  return match ? { mediaType: match[1], data: match[2] } : null;
}

function buildContentBlock(doc) {
  const ext = extractBase64(doc.dataUrl);
  if (!ext) return null;
  if (doc.type === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: ext.data } };
  }
  if (['image/jpeg', 'image/jpg', 'image/png'].includes(doc.type)) {
    const mt = doc.type === 'image/jpg' ? 'image/jpeg' : doc.type;
    return { type: 'image', source: { type: 'base64', media_type: mt, data: ext.data } };
  }
  return null;
}

async function analyzeDocument(doc, companyName) {
  const block = buildContentBlock(doc);
  if (!block) return { valid: false, reason: 'Unsupported file format', confidence: 'high', document_type: 'unknown' };

  const userPrompt = `Analyze this document. Is it a valid business identification document (company registration, KvK extract, passport, or business license)?

The user has registered the company name "${companyName}". If this is a company document (not a personal ID), check whether the company name on the document matches.

Reply with JSON only: {valid: true/false, document_type: string, confidence: high/medium/low, reason: string, company_name_match: true/false/"not_applicable"}`;

  const message = await anthropic.messages.create({
    model: KYC_MODEL,
    max_tokens: 512,
    system: [{
      type: 'text',
      text: 'You are a KYC compliance analyst for an EU oil trading platform. Examine documents for legitimacy and respond ONLY with the requested JSON object. Be strict — reject blank pages, screenshots of generic web pages, irrelevant documents, or anything that looks tampered with.',
      cache_control: { type: 'ephemeral' }
    }],
    messages: [{ role: 'user', content: [block, { type: 'text', text: userPrompt }] }]
  });

  const text = message.content
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('');

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { valid: false, reason: 'AI returned unparseable response', confidence: 'low', document_type: 'unknown' };

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      valid: !!parsed.valid,
      document_type: String(parsed.document_type || 'unknown'),
      confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low',
      reason: String(parsed.reason || ''),
      company_name_match: parsed.company_name_match
    };
  } catch (err) {
    return { valid: false, reason: 'AI response parse error: ' + err.message, confidence: 'low', document_type: 'unknown' };
  }
}

async function verifyKycAsync(userId) {
  if (!anthropic) {
    console.log(`[KYC] Skipping AI verification for ${userId} (ANTHROPIC_API_KEY not set)`);
    return;
  }
  const user = queryOne('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) return;
  const documents = JSON.parse(user.documents || '[]');
  if (!documents.length) return;

  console.log(`[KYC] Starting AI verification for ${user.email} (${documents.length} document(s))`);
  const results = [];
  for (const doc of documents) {
    if (typeof doc !== 'object' || !doc.dataUrl) continue;
    try {
      const r = await analyzeDocument(doc, user.company_name);
      results.push({ name: doc.name, ...r });
      console.log(`[KYC]   ${doc.name}: valid=${r.valid} type=${r.document_type} conf=${r.confidence}`);
    } catch (err) {
      console.error(`[KYC]   ${doc.name}: API error —`, err.message);
      results.push({ name: doc.name, valid: false, confidence: 'low', document_type: 'unknown', reason: 'AI service error: ' + err.message });
    }
  }

  // Decision logic:
  // - APPROVE if at least one valid business doc with high confidence AND
  //   (company name matches OR is not applicable for that document type)
  // - REJECT if every document is invalid with high confidence
  // - PENDING otherwise (manual review needed)
  const validHighConf = results.find(r =>
    r.valid && r.confidence === 'high' &&
    (r.company_name_match === true || r.company_name_match === 'not_applicable')
  );
  const allInvalidHighConf = results.length > 0 && results.every(r => !r.valid && r.confidence === 'high');

  let newStatus = 'pending';
  let summary = '';
  if (validHighConf) {
    newStatus = 'verified';
    summary = `AI verified document "${validHighConf.name}" as ${validHighConf.document_type} (high confidence). ${validHighConf.reason}`;
  } else if (allInvalidHighConf) {
    newStatus = 'rejected';
    summary = `AI rejected all documents. ${results[0].reason}`;
  } else {
    summary = 'Documents need manual review (AI confidence too low or mixed results).';
  }

  const verification = { status: newStatus, summary, results, model: KYC_MODEL, timestamp: new Date().toISOString() };
  run('UPDATE users SET kyc_status = ?, ai_verification = ?, ai_verified_at = ? WHERE id = ?',
      [newStatus, JSON.stringify(verification), new Date().toISOString(), userId]);

  console.log(`[KYC] Decision for ${user.email}: ${newStatus} — ${summary}`);
  await sendKycResultEmail(user, newStatus, summary);
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

  // Migrate: add AI KYC verification columns to users
  try { db.run('ALTER TABLE users ADD COLUMN ai_verification TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE users ADD COLUMN ai_verified_at TEXT'); } catch(e) {}

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

  // 50MB limit to accommodate base64-encoded KYC documents (max 5 files x 5MB each)
  app.use(express.json({ limit: '50mb' }));

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

  // KYC document validation constants
  const VALID_DOC_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
  const MIN_DOC_SIZE = 10 * 1024;          // 10 KB
  const MAX_DOC_SIZE = 5 * 1024 * 1024;    // 5 MB
  const MAX_DOCS = 5;

  function validateDocuments(documents) {
    if (!Array.isArray(documents) || documents.length === 0) {
      return 'At least one KYC document is required';
    }
    if (documents.length > MAX_DOCS) {
      return `Maximum ${MAX_DOCS} documents allowed`;
    }
    for (const d of documents) {
      if (!d || typeof d !== 'object') return 'Invalid document format';
      if (!d.name || !d.dataUrl) return 'Each document must have a name and content';
      if (!VALID_DOC_TYPES.includes(d.type)) return `${d.name}: invalid file type. Only PDF, JPG, PNG accepted.`;
      if (typeof d.size !== 'number' || d.size < MIN_DOC_SIZE) return `${d.name}: file too small (minimum 10 KB)`;
      if (d.size > MAX_DOC_SIZE) return `${d.name}: file too large (maximum 5 MB)`;
      if (typeof d.dataUrl !== 'string' || !d.dataUrl.startsWith('data:')) return `${d.name}: invalid file content`;
    }
    return null;
  }

  // ========== Auth Routes ==========
  app.post('/api/auth/register', (req, res) => {
    const { email, password, companyName, companyReg, companyCountry, companyVat, contactName, contactPhone, contactPosition, ndaAccepted, documents } = req.body;
    if (!email || !password || !companyName || !companyReg || !companyCountry || !contactName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const docError = validateDocuments(documents);
    if (docError) return res.status(400).json({ error: docError });
    if (!ndaAccepted) return res.status(400).json({ error: 'You must accept the NDA to register' });
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

    // Fire-and-forget AI verification (non-blocking)
    setImmediate(() => {
      verifyKycAsync(id).catch(err => console.error('[KYC] verifyKycAsync threw:', err));
    });
  });

  // Admin-only: re-trigger AI verification for a user
  app.post('/api/users/:id/verify-kyc', auth, adminOnly, async (req, res) => {
    if (!anthropic) return res.status(503).json({ error: 'AI verification not configured (ANTHROPIC_API_KEY missing)' });
    const user = queryOne('SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, message: 'Verification started' });
    setImmediate(() => {
      verifyKycAsync(req.params.id).catch(err => console.error('[KYC] re-verify threw:', err));
    });
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

  // ========== Health Check ==========
  app.get(['/health', '/api/health'], (req, res) => {
    res.json({ status: 'ok', port: PORT, timestamp: new Date().toISOString() });
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
