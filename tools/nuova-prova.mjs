#!/usr/bin/env node
// Crea il database di una prova: un progetto Supabase nuovo con tutte le migrazioni, l'email del
// proprietario, le email della password dimenticata e l'iscrizione senza conferma via email.
// Lo lancia il workflow "Prova con database" (Actions), con il token nel secret SUPABASE_ACCESS_TOKEN;
// si può lanciare anche dal tuo computer con la variabile SUPABASE_ACCESS_TOKEN.
//
//   node tools/nuova-prova.mjs --campo "Prova Le Querce" --email titolare@lequerce.it [--regione eu-central-1] [--org <id>]
//
// Stampa l'URL del progetto e la publishable key (mai la secret key); in GitHub Actions li scrive anche
// nelle uscite del passo (url, chiave) per costruire l'APK.

import { randomBytes } from 'node:crypto';
import { appendFileSync } from 'node:fs';

import { migrationsSql } from './setup-sql.mjs';

const API = 'https://api.supabase.com/v1';
const fail = (msg) => {
  console.error(`\n${msg}`);
  process.exit(1);
};

const o = {};
const list = process.argv.slice(2);
for (let i = 0; i < list.length; i++) if (list[i].startsWith('--')) o[list[i].slice(2)] = list[++i];
if (!o.campo?.trim()) fail('Indica il nome della prova con --campo "Nome".');
if (!o.email?.includes('@')) fail("Indica l'email del proprietario con --email: con quella si iscrive ed entra come proprietario.");
const token = process.env.SUPABASE_ACCESS_TOKEN ?? '';
if (!token) fail('Manca il token di Supabase (supabase.com → Account → Access Tokens): su GitHub va nel secret SUPABASE_ACCESS_TOKEN.');

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) fail(`Supabase ha risposto ${res.status} a ${method} ${path}:\n${text}`);
  return text ? JSON.parse(text) : null;
}
const step = (msg) => console.error(`• ${msg}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (s) => `'${s.replace(/'/g, "''")}'`;

// 1. Progetto gratuito nella prima organizzazione (o in quella indicata).
const orgs = await api('GET', '/organizations');
const org = o.org ? orgs.find((x) => x.id === o.org || x.slug === o.org) : orgs[0];
if (!org) fail(o.org ? `Organizzazione "${o.org}" non trovata.` : 'Il tuo account Supabase non ha organizzazioni.');
step(`Creo il progetto "${o.campo}" nell'organizzazione ${org.name} (${o.regione || 'eu-central-1'})…`);
const project = await api('POST', '/projects', {
  name: o.campo.trim(),
  organization_id: org.id,
  region: o.regione || 'eu-central-1',
  // La password del database non serve all'app: se mai servisse si cambia da Project Settings → Database.
  db_pass: randomBytes(18).toString('base64url'),
});
const ref = project.id ?? project.ref;
const url = `https://${ref}.supabase.co`;

step('Aspetto che il database sia pronto (di solito un paio di minuti)…');
for (let i = 0; ; i++) {
  const p = await api('GET', `/projects/${ref}`);
  if (p.status === 'ACTIVE_HEALTHY') break;
  if (i > 60) fail(`Il progetto ${ref} non è ancora pronto dopo 10 minuti: controlla su supabase.com.`);
  await wait(10000);
}

// 2. Database: tutte le migrazioni, il nome del centro e l'email del proprietario.
step('Preparo il database (tutte le migrazioni)…');
await api('POST', `/projects/${ref}/database/query`, {
  query: `${migrationsSql()}\nselect public.set_owner_email(${sql(o.email.trim().toLowerCase())});\nupdate public.settings set field_name = ${sql(o.campo.trim())} where id = 1;`,
});

// 3. Iscrizione senza conferma via email (chi prova entra subito) e codice per la password dimenticata.
step("Imposto l'accesso: niente conferma via email, codice per la password dimenticata…");
await api('PATCH', `/projects/${ref}/config/auth`, {
  mailer_autoconfirm: true,
  mailer_subjects_recovery: 'Il codice per la nuova password',
  mailer_templates_recovery_content: '<h2>Nuova password</h2>\n<p>Il tuo codice è: <strong>{{ .Token }}</strong></p>',
});

// 4. Publishable key (mai la secret key).
step('Prendo la publishable key…');
let keys = await api('GET', `/projects/${ref}/api-keys?reveal=true`);
let pub = keys.find((k) => k.type === 'publishable');
if (!pub) {
  await api('POST', `/projects/${ref}/api-keys`, { type: 'publishable', name: 'app' });
  keys = await api('GET', `/projects/${ref}/api-keys?reveal=true`);
  pub = keys.find((k) => k.type === 'publishable');
}
if (!pub?.api_key?.startsWith('sb_publishable_')) fail('Non trovo la publishable key: creala in Project Settings → API Keys.');

if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `url=${url}\nchiave=${pub.api_key}\n`);
console.log(`
Database della prova pronto: ${o.campo.trim()}
URL:            ${url}
Publishable key: ${pub.api_key}
Il proprietario si iscrive dall'app con ${o.email.trim().toLowerCase()} ed entra già come proprietario.
`);
