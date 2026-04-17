#!/usr/bin/env node

require('./load-env').loadEnv();
const fs = require('fs');
const path = require('path');

const [, , subject, ...bodyParts] = process.argv;
const body = bodyParts.join(' ');

if (!subject || !body) {
  console.error('Usage: node send-bulk.js <subject> <body>');
  console.error('Recipients are read from recipients.txt (one email per line, # for comments).');
  console.error('Already-sent addresses in sent-log.txt are skipped automatically.');
  process.exit(1);
}

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error('Error: RESEND_API_KEY is not set. Add it to .env or export it in your shell.');
  process.exit(1);
}

const from = process.env.EMAIL_FROM || 'OilBridge <contact@oilbridge.eu>';
const recipientsFile = path.join(__dirname, 'recipients.txt');
const sentLogFile = path.join(__dirname, 'sent-log.txt');

if (!fs.existsSync(recipientsFile)) {
  console.error(`Error: recipients.txt not found at ${recipientsFile}`);
  process.exit(1);
}

const recipients = fs.readFileSync(recipientsFile, 'utf8')
  .split(/\r?\n/)
  .map(l => l.trim())
  .filter(l => l && !l.startsWith('#'));

if (recipients.length === 0) {
  console.error('Error: recipients.txt contains no email addresses.');
  process.exit(1);
}

function loadSentLog() {
  if (!fs.existsSync(sentLogFile)) return new Map();
  const map = new Map();
  for (const line of fs.readFileSync(sentLogFile, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const sep = trimmed.indexOf('|');
    if (sep === -1) { map.set(trimmed.toLowerCase(), ''); continue; }
    const email = trimmed.slice(0, sep).trim().toLowerCase();
    const date = trimmed.slice(sep + 1).trim();
    map.set(email, date);
  }
  return map;
}

function appendSentLog(email) {
  const now = new Date();
  const date = now.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  fs.appendFileSync(sentLogFile, `${email}|${date} ${time}\n`);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function sendOne(to) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, text: body }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || JSON.stringify(data));
  return data.id;
}

(async () => {
  const sentLog = loadSentLog();
  const skipped = [];
  const toSend = [];

  for (const email of recipients) {
    const sentDate = sentLog.get(email.toLowerCase());
    if (sentDate !== undefined) {
      skipped.push({ email, date: sentDate });
    } else {
      toSend.push(email);
    }
  }

  console.log(`Recipients: ${recipients.length} total · ${toSend.length} new · ${skipped.length} already sent\n`);

  for (const s of skipped) {
    console.log(`  Skipping ${s.email} — already sent${s.date ? ' on ' + s.date : ''}`);
  }
  if (skipped.length) console.log('');

  if (toSend.length === 0) {
    console.log('Nothing to send — all recipients already in sent-log.txt');
    process.exit(0);
  }

  const results = { sent: 0, failed: 0, failures: [] };

  for (let i = 0; i < toSend.length; i++) {
    const to = toSend[i];
    process.stdout.write(`  Sending to ${i + 1}/${toSend.length}: ${to}... `);
    try {
      await sendOne(to);
      console.log('\u2705');
      appendSentLog(to);
      results.sent++;
    } catch (err) {
      console.log(`\u274C ${err.message}`);
      results.failed++;
      results.failures.push({ to, error: err.message });
    }
    if (i < toSend.length - 1) await sleep(2000);
  }

  console.log(`\nDone. Sent: ${results.sent} · Failed: ${results.failed} · Skipped: ${skipped.length}`);
  if (results.failures.length) {
    console.log('\nFailed:');
    for (const f of results.failures) console.log(`  - ${f.to}: ${f.error}`);
    process.exit(1);
  }
})();
