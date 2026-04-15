#!/usr/bin/env node

require('./load-env').loadEnv();
const fs = require('fs');
const path = require('path');

const [, , subject, ...bodyParts] = process.argv;
const body = bodyParts.join(' ');

if (!subject || !body) {
  console.error('Usage: node send-bulk.js <subject> <body>');
  console.error('Recipients are read from recipients.txt (one email per line, # for comments).');
  process.exit(1);
}

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error('Error: RESEND_API_KEY is not set. Add it to .env or export it in your shell.');
  process.exit(1);
}

const from = process.env.EMAIL_FROM || 'OilBridge <contact@oilbridge.eu>';
const recipientsFile = path.join(__dirname, 'recipients.txt');

if (!fs.existsSync(recipientsFile)) {
  console.error(`Error: recipients.txt not found at ${recipientsFile}`);
  console.error('Create it with one email address per line. Lines starting with # are ignored.');
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
  console.log(`Starting bulk send to ${recipients.length} recipient(s)...\n`);
  const results = { sent: 0, failed: 0, failures: [] };

  for (let i = 0; i < recipients.length; i++) {
    const to = recipients[i];
    const progress = `${i + 1}/${recipients.length}`;
    process.stdout.write(`Sending to ${progress}: ${to}... `);
    try {
      const id = await sendOne(to);
      console.log(`OK (${id})`);
      results.sent++;
    } catch (err) {
      console.log(`FAILED — ${err.message}`);
      results.failed++;
      results.failures.push({ to, error: err.message });
    }
    if (i < recipients.length - 1) await sleep(2000);
  }

  console.log(`\nDone. Sent: ${results.sent} · Failed: ${results.failed}`);
  if (results.failures.length) {
    console.log('\nFailed recipients:');
    for (const f of results.failures) console.log(`  - ${f.to}: ${f.error}`);
    process.exit(1);
  }
})();
