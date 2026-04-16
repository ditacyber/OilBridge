#!/usr/bin/env node

// Standalone blog generator — use when the server is running.
// Usage: node generate-blog.js
// Triggers the server's blog generation endpoint (requires admin auth).

require('./load-env').loadEnv();

const BASE = process.env.SITE_URL || 'http://localhost:3000';

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@oilbridge.eu';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.error('Error: ADMIN_PASSWORD not set in .env');
    process.exit(1);
  }

  console.log('Logging in as admin...');
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const loginData = await loginRes.json();
  if (!loginRes.ok || !loginData.token) {
    console.error('Login failed:', loginData.error || 'unknown error');
    process.exit(1);
  }

  console.log('Generating blog post via Claude API...');
  const res = await fetch(`${BASE}/api/blog/generate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${loginData.token}` }
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('Generation failed:', data.error || 'unknown error');
    process.exit(1);
  }

  console.log(`Published: "${data.title}"`);
  console.log(`URL: ${BASE}/#blog/${data.slug}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
