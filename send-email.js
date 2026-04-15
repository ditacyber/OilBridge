#!/usr/bin/env node

require('./load-env').loadEnv();

const [, , recipient, subject, ...bodyParts] = process.argv;
const body = bodyParts.join(' ');

if (!recipient || !subject || !body) {
  console.error('Usage: node send-email.js <recipient> <subject> <body>');
  process.exit(1);
}

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error('Error: RESEND_API_KEY is not set. Add it to .env or export it in your shell.');
  process.exit(1);
}

const from = process.env.EMAIL_FROM || 'OilBridge <contact@oilbridge.eu>';

(async () => {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [recipient],
      subject,
      text: body,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('Failed to send email:', data);
    process.exit(1);
  }

  console.log('Email sent successfully. ID:', data.id);
})();
