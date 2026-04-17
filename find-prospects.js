#!/usr/bin/env node

// Searches for oil trading companies across major EU markets using Claude API.
// Usage: node find-prospects.js
// Output: prospects.txt + prospects.json

require('./load-env').loadEnv();
const fs = require('fs');
const path = require('path');

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('Error: ANTHROPIC_API_KEY not set. Add it to .env');
  process.exit(1);
}

const COUNTRIES = [
  { code: 'NL', name: 'Netherlands', hubs: 'Rotterdam, Amsterdam, Vlissingen, Dordrecht, Moerdijk' },
  { code: 'BE', name: 'Belgium', hubs: 'Antwerp, Ghent, Brussels, Zeebrugge' },
  { code: 'DE', name: 'Germany', hubs: 'Hamburg, Bremen, Wilhelmshaven, Cologne, Frankfurt, Karlsruhe, Ingolstadt' },
  { code: 'FR', name: 'France', hubs: 'Le Havre, Marseille-Fos, Dunkirk, Paris, Lyon, Nantes' },
  { code: 'PL', name: 'Poland', hubs: 'Gdansk, Gdynia, Plock, Warsaw, Szczecin' },
  { code: 'ES', name: 'Spain', hubs: 'Algeciras, Tarragona, Bilbao, Cartagena, Huelva, Barcelona, Madrid' },
];

function buildPrompt(country) {
  return `You are a B2B sales researcher for an EU oil trading compliance platform.

List real oil trading, petroleum distribution, fuel wholesale, and energy trading companies registered in ${country.name}. Focus on small-to-mid-market companies (not the top 5 majors like Vitol/Trafigura/Gunvor — they have their own infrastructure).

For each company provide:
- Company name
- Country (${country.code})
- City
- What they do (1 line)
- Website (if publicly known)
- General contact email (from their public website, e.g. info@, contact@) — leave blank if unknown

Return ONLY a valid JSON array. No markdown fences. Example format:
[
  {
    "company": "Example Energy GmbH",
    "country": "${country.code}",
    "city": "${country.hubs.split(',')[0].trim()}",
    "activity": "Independent fuel distributor and storage operator",
    "website": "www.example-energy.${country.code.toLowerCase()}",
    "email": "info@example-energy.${country.code.toLowerCase()}"
  }
]

Requirements:
- At least 15 companies
- Only REAL companies — no fabricated names
- Focus on: fuel distributors, independent traders, bunkering companies, storage terminal operators, petrochemical buyers, bitumen/lubricant suppliers
- Include companies in key hubs: ${country.hubs}
- Only use publicly available information`;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchCountry(country) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: buildPrompt(country) }]
    })
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`API error ${res.status}`);
    return [];
  }

  const data = await res.json();
  const text = data.content && data.content[0] && data.content[0].text;
  if (!text) return [];

  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('parse error');
    fs.appendFileSync(path.join(__dirname, 'prospects-raw.txt'), `\n--- ${country.code} ---\n${text}\n`);
    return [];
  }
}

async function main() {
  console.log(`Researching oil trading companies across ${COUNTRIES.length} EU markets...\n`);

  let allCompanies = [];

  for (const country of COUNTRIES) {
    process.stdout.write(`  ${country.name} (${country.code})... `);
    const companies = await fetchCountry(country);
    console.log(`${companies.length} found`);
    allCompanies.push(...companies);
    if (country !== COUNTRIES[COUNTRIES.length - 1]) await sleep(1000);
  }

  const byCountry = {};
  for (const c of allCompanies) {
    const code = c.country || 'OTHER';
    if (!byCountry[code]) byCountry[code] = [];
    byCountry[code].push(c);
  }

  console.log('');

  let output = `OilBridge — Prospect List\nGenerated: ${new Date().toISOString()}\n`;
  const summary = COUNTRIES.map(c => `${c.code}: ${(byCountry[c.code] || []).length}`).join(', ');
  output += `Total: ${allCompanies.length} companies (${summary})\n`;
  output += `${'='.repeat(70)}\n\n`;

  for (const country of COUNTRIES) {
    const list = byCountry[country.code] || [];
    output += `${country.name.toUpperCase()} (${list.length})\n${'─'.repeat(40)}\n`;
    for (const c of list) {
      output += `${c.company}\n`;
      output += `  City:     ${c.city}\n`;
      output += `  Activity: ${c.activity}\n`;
      if (c.website) output += `  Website:  ${c.website}\n`;
      if (c.email) output += `  Email:    ${c.email}\n`;
      output += '\n';
    }
  }

  output += `${'='.repeat(70)}\n`;
  output += `NOTE: This list is based on AI research of publicly known companies.\n`;
  output += `Verify all details before outreach. Respect GDPR for any personal data.\n`;

  const outFile = path.join(__dirname, 'prospects.txt');
  fs.writeFileSync(outFile, output);

  const jsonFile = path.join(__dirname, 'prospects.json');
  fs.writeFileSync(jsonFile, JSON.stringify(allCompanies, null, 2));

  const withEmail = allCompanies.filter(c => c.email);
  console.log(`Total: ${allCompanies.length} companies across ${COUNTRIES.length} countries`);
  console.log(`With email: ${withEmail.length}`);
  console.log(`Saved to ${outFile}`);
  console.log(`JSON saved to ${jsonFile}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
