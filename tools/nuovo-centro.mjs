#!/usr/bin/env node
// Apre un centro nuovo con un solo comando: crea il progetto Supabase, prepara il database e le
// email, prende la publishable key e genera la licenza. Si lancia sul tuo computer, dove c'è la
// chiave privata delle licenze.
//
//   node tools/nuovo-centro.mjs --campo "Centro Cinofilo Le Querce" --email titolare@lequerce.it \
//       --piano professional [--scadenza 2027-12-31] [--id querce] [--regione eu-central-1] [--org <id>]
//
// Serve un token del tuo account Supabase (supabase.com → Account → Access Tokens), in una di queste:
//   - variabile SUPABASE_ACCESS_TOKEN
//   - file ~/.campo-cani/supabase-token (solo il token, su una riga)
// Il token crea progetti sul tuo account: non metterlo mai nell'app né su GitHub.
//
// Alla fine stampa la licenza e il link di attivazione da mandare al titolare, e salva i dati del
// centro in ~/.campo-cani/centri/<id>.json (servono per rinnovi e cambi di piano).

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { migrationsSql } from './setup-sql.mjs';

const API = 'https://api.supabase.com/v1';
const DIR = join(homedir(), '.campo-cani');
const fail = (msg) => {
  console.error(`\n${msg}`);
  process.exit(1);
};

function args(list) {
  const o = {};
  for (let i = 0; i < list.length; i++) if (list[i].startsWith('--')) o[list[i].slice(2)] = list[i + 1]?.startsWith('--') ? 'true' : list[++i];
  return o;
}

const o = args(process.argv.slice(2));
if (!o.campo?.trim()) fail('Indica il nome del centro con --campo "Nome".');
if (!o.email?.includes('@')) fail('Indica l\'email del titolare con --email titolare@...: con quella si iscrive ed entra come proprietario.');
if (!['base', 'professional', 'pro'].includes(o.piano)) fail('Indica il piano con --piano base | professional | pro.');
const id = o.id || o.campo.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
const tokenFile = join(DIR, 'supabase-token');
const token = process.env.SUPABASE_ACCESS_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '');
if (!token) fail(`Manca il token di Supabase: crealo in supabase.com → Account → Access Tokens e mettilo in ${tokenFile}.`);
const saved = join(DIR, 'centri', `${id}.json`);
if (existsSync(saved)) fail(`Esiste già un centro con id "${id}" (${saved}). Scegline un altro con --id.`);

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

// 1. Organizzazione e progetto.
const orgs = await api('GET', '/organizations');
const org = o.org ? orgs.find((x) => x.id === o.org || x.slug === o.org) : orgs[0];
if (!org) fail(o.org ? `Organizzazione "${o.org}" non trovata.` : 'Il tuo account Supabase non ha organizzazioni.');
const dbPass = randomBytes(18).toString('base64url');
step(`Creo il progetto "${o.campo}" nell'organizzazione ${org.name} (${o.regione || 'eu-central-1'})…`);
const project = await api('POST', '/projects', { name: o.campo.trim(), organization_id: org.id, region: o.regione || 'eu-central-1', db_pass: dbPass });
const ref = project.id ?? project.ref;
const url = `https://${ref}.supabase.co`;

step('Aspetto che il database sia pronto (di solito un paio di minuti)…');
for (let i = 0; ; i++) {
  const p = await api('GET', `/projects/${ref}`);
  if (p.status === 'ACTIVE_HEALTHY') break;
  if (i > 60) fail(`Il progetto ${ref} non è ancora pronto dopo 10 minuti: controlla su supabase.com e riprova i passi seguenti a mano.`);
  await wait(10000);
}

// 2. Database: tutte le migrazioni e l'email del titolare.
step('Preparo il database (tutte le migrazioni)…');
const titolare = o.email.trim().toLowerCase();
await api('POST', `/projects/${ref}/database/query`, {
  query: `${migrationsSql()}\nselect public.set_owner_email('${titolare.replace(/'/g, "''")}');`,
});

// 3. Email di "password dimenticata" con il codice, come vuole l'app.
step('Imposto l\'email per la password dimenticata…');
await api('PATCH', `/projects/${ref}/config/auth`, {
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
if (!pub?.api_key?.startsWith('sb_publishable_')) fail('Non trovo la publishable key: creala in Project Settings → API Keys e genera la licenza con tools/licenza.mjs.');

// 5. Licenza firmata con la tua chiave privata, salvata anche nel database del centro.
step('Genero la licenza…');
const licArgs = ['genera', '--campo', o.campo.trim(), '--id', id, '--piano', o.piano, '--url', url, '--chiave', pub.api_key];
if (o.scadenza) licArgs.push('--scadenza', o.scadenza);
const code = execFileSync(process.execPath, [join(import.meta.dirname, 'licenza.mjs'), ...licArgs], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
await api('POST', `/projects/${ref}/database/query`, {
  query: `update public.settings set field_name = '${o.campo.trim().replace(/'/g, "''")}', license_code = '${code}' where id = 1;`,
});

mkdirSync(join(DIR, 'centri'), { recursive: true });
writeFileSync(saved, JSON.stringify({ id, campo: o.campo.trim(), piano: o.piano, scadenza: o.scadenza ?? null, titolare, ref, url, chiave: pub.api_key, dbPass, licenza: code }, null, 2));

const link = `campocaniapp://attiva?codice=${encodeURIComponent(code)}`;
console.log(`
Centro pronto: ${o.campo.trim()} (${o.piano})

Licenza da incollare in "Attiva l'app":
${code}

Link di attivazione da mandare al titolare (aperto dal telefono attiva l'app):
${link}

Il titolare si iscrive dall'app con ${titolare} ed entra già come proprietario.
Dati del centro salvati in ${saved} (c'è anche la password del database: tienilo al sicuro).
`);
