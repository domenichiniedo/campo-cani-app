#!/usr/bin/env node
// Accende il gestore di prova, tutto da GitHub: la prova generale in cui un centro si registra dall'app e il gestore gli
// prepara il database da solo, come succederà davvero. Lo lancia il workflow "Prova generale" (Actions), con il token nel
// secret SUPABASE_ACCESS_TOKEN; si può lanciare anche dal tuo computer con la variabile SUPABASE_ACCESS_TOKEN.
//
//   node tools/prova-generale.mjs --email tua@email.it [--nome "K9 Gestore"] [--pausa <codice progetto>] [--nuova-password si]
//   node tools/prova-generale.mjs --solo-se-esiste si   (dopo una PR unita: aggiorna il gestore solo se c'è già)
//
// Fa, e si può ripetere senza danni:
//   1. mette in pausa il progetto di --pausa (la prova vecchia), così nel piano gratuito resta posto per il centro;
//   2. trova il progetto del gestore dal nome, o lo crea, e aspetta che sia pronto;
//   3. esegue le migrazioni del gestore che mancano (gestore/supabase/migrations) e attiva pg_cron e pg_net;
//   4. la prima volta crea la chiave del server per le licenze: la privata va solo nei segreti del gestore, la
//      pubblica resta nel suo database (tabella chiave_server) per le build dell'app;
//   5. scrive i segreti delle funzioni: TOKEN_SUPABASE, WEBHOOK_SECRET (nuovo a ogni giro), AMMINISTRATORI, PROVA=1
//      (i centri si preparano senza SMTP e Twilio) e APP_ANDROID_ID dell'app della prova; con GESTORE_GITHUB_TOKEN
//      (secret del repository) anche GITHUB_TOKEN e GITHUB_REPO, per la sezione "App e versioni" del pannello; con
//      SMTP_USER e SMTP_PASS (per esempio Gmail con una password per le app) anche l'SMTP, che manda i codici per email
//      (password dimenticata, conferma dell'email): i centri nuovi lo prendono da soli, a quelli già pronti lo mette qui;
//   6. un IBAN di prova per i bonifici, se non ne hai messo uno dal pannello, e gli orari di pg_cron;
//   7. il tuo utente per il pannello (--email): la password, nuova, solo nel riepilogo del workflow.
// Le funzioni le carica poi il workflow (npx supabase functions deploy).
//
// In GitHub Actions scrive nelle uscite del passo: ref, gestore_url, gestore_key (publishable), chiave_server (pubblica).

import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://api.supabase.com/v1';
const MIGRAZIONI = join(import.meta.dirname, '../gestore/supabase/migrations');
// L'app della prova generale: sul telefono sta accanto alla demo, alla prova vecchia e all'app vera.
const APP_PROVA = 'it.campocani.provagenerale';
// IBAN d'esempio (quello che usano le banche nelle guide): i centri della prova vedono dove pagarti.
const IBAN_PROVA = 'IT60X0542811101000000123456';

const fail = (msg) => {
  console.error(`\n::error::${msg.split('\n')[0]}\n${msg}`);
  process.exit(1);
};
const o = {};
const list = process.argv.slice(2);
for (let i = 0; i < list.length; i++) if (list[i].startsWith('--')) o[list[i].slice(2)] = list[++i];
const soloSeEsiste = o['solo-se-esiste'] === 'si';
const nome = (o.nome || 'K9 Gestore').trim();
const email = (o.email ?? '').trim().toLowerCase();
if (!soloSeEsiste && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Indica la tua email con --email: con quella entri nel pannello K9 Gestore.");
const token = process.env.SUPABASE_ACCESS_TOKEN ?? '';
if (!token) fail('Manca il token di Supabase (supabase.com → Account → Access Tokens): su GitHub va nel secret SUPABASE_ACCESS_TOKEN.');

async function api(method, path, body, ok = []) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok && !ok.includes(res.status)) fail(`Supabase ha risposto ${res.status} a ${method} ${path}:\n${text}`);
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}
const step = (msg) => console.error(`• ${msg}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const lit = (s) => `'${s.replace(/'/g, "''")}'`;
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const uscita = (k, v) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
const riepilogo = (s) => process.env.GITHUB_STEP_SUMMARY && appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${s}\n`);

let progetti = await api('GET', '/projects');
const attivi = () => progetti.filter((p) => p.status === 'ACTIVE_HEALTHY' || p.status === 'COMING_UP');
let gestore = progetti.find((p) => p.name === nome);
if (soloSeEsiste && !gestore) {
  step(`Nessun progetto "${nome}": la prova generale non è accesa, non c'è niente da aggiornare.`);
  uscita('ref', '');
  process.exit(0);
}

// 1. La prova vecchia in pausa (si riaccende da supabase.com → il progetto → Restore, i dati restano).
const pausa = o.pausa?.trim();
if (pausa && pausa !== gestore?.id) {
  const p = progetti.find((x) => x.id === pausa);
  if (p && p.status === 'ACTIVE_HEALTHY') {
    step(`Metto in pausa "${p.name}" (${p.id}): nel piano gratuito di Supabase restano attivi il gestore e il centro della prova.`);
    await api('POST', `/projects/${pausa}/pause`);
    // Finché non è in pausa Supabase la conta ancora fra i progetti attivi.
    for (let i = 0; i < 30 && p.status !== 'INACTIVE'; i++) {
      await wait(10000);
      p.status = (await api('GET', `/projects/${pausa}`)).status;
    }
  }
}

// 2. Il progetto del gestore.
if (!gestore) {
  const orgs = await api('GET', '/organizations');
  const org = o.org ? orgs.find((x) => x.id === o.org || x.slug === o.org) : orgs[0];
  if (!org) fail('Il tuo account Supabase non ha organizzazioni.');
  step(`Creo il progetto "${nome}" nell'organizzazione ${org.name}…`);
  const res = await fetch(`${API}/projects`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nome, organization_id: org.id, region: o.regione || 'eu-central-1', db_pass: randomBytes(18).toString('base64url') }),
  });
  const text = await res.text();
  if (!res.ok) {
    const nomi = attivi().map((p) => `- ${p.name} (${p.id})`).join('\n');
    fail(`Supabase non crea il progetto del gestore (${res.status}): ${text}\nSe è il limite dei 2 progetti gratuiti, metti in pausa uno di questi su supabase.com e rilancia:\n${nomi}`);
  }
  gestore = JSON.parse(text);
} else if (gestore.status === 'INACTIVE' && soloSeEsiste) {
  step(`Il gestore "${nome}" è in pausa: non lo aggiorno.`);
  uscita('ref', '');
  process.exit(0);
} else if (gestore.status === 'INACTIVE') {
  step(`Il gestore "${nome}" è in pausa: lo riaccendo…`);
  await api('POST', `/projects/${gestore.id}/restore`);
}
const ref = gestore.id ?? gestore.ref;
const url = `https://${ref}.supabase.co`;
step(`Gestore: ${nome} (${ref}). Aspetto che sia pronto…`);
for (let i = 0; ; i++) {
  const p = await api('GET', `/projects/${ref}`);
  if (p.status === 'ACTIVE_HEALTHY') break;
  if (i > 90) fail(`Il progetto ${ref} non è ancora pronto dopo 15 minuti (stato ${p.status}): controlla su supabase.com.`);
  await wait(10000);
}
const query = (sql) => api('POST', `/projects/${ref}/database/query`, { query: sql });

// 3. Le migrazioni del gestore, ognuna una volta sola.
await query('create table if not exists public.migrazioni_gestore (file text primary key, fatta timestamptz not null default now());\nalter table public.migrazioni_gestore enable row level security;');
const [{ a_mano }] = await query("select to_regclass('public.centri') is not null and not exists (select 1 from public.migrazioni_gestore) as a_mano;");
if (a_mano) fail('Questo gestore è stato preparato a mano (ha già le tabelle ma non la lista delle migrazioni fatte): usa un altro nome con --nome, o aggiornalo a mano come dice gestore/README.md.');
const fatte = new Set((await query('select file from public.migrazioni_gestore;')).map((r) => r.file));
for (const file of readdirSync(MIGRAZIONI).filter((f) => f.endsWith('.sql')).sort()) {
  if (fatte.has(file)) continue;
  step(`Migrazione ${file}…`);
  await query(`${readFileSync(join(MIGRAZIONI, file), 'utf8')}\ninsert into public.migrazioni_gestore (file) values (${lit(file)});`);
}
await query('create extension if not exists pg_cron;\ncreate extension if not exists pg_net;');

// 4. La chiave del server per le licenze dei centri.
await query('create table if not exists public.chiave_server (id int primary key default 1 check (id = 1), pubblica text not null);\nalter table public.chiave_server enable row level security;');
const segreti = new Set(((await api('GET', `/projects/${ref}/secrets`)) ?? []).map((s) => s.name));
let [riga] = await query('select pubblica from public.chiave_server;');
const nuovi = [];
if (!segreti.has('LICENZA_SERVER_PRIVATA') || !riga) {
  step('Creo la chiave del server per le licenze…');
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const seme = b64url(privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32));
  const pubblica = b64url(publicKey.export({ format: 'der', type: 'spki' }).subarray(-32));
  nuovi.push({ name: 'LICENZA_SERVER_PRIVATA', value: seme });
  await query(`insert into public.chiave_server (id, pubblica) values (1, ${lit(pubblica)}) on conflict (id) do update set pubblica = excluded.pubblica;`);
  riga = { pubblica };
}

// L'SMTP per le email con il codice (senza, Supabase manda solo un link che nell'app non si apre).
const smtp = process.env.SMTP_USER && process.env.SMTP_PASS
  ? {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT || '587',
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
    }
  : null;

// L'accesso con Google ai centri: il client web (ID e secret) e quello desktop.
const google = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  ? { id: process.env.GOOGLE_CLIENT_ID, segreto: process.env.GOOGLE_CLIENT_SECRET, altri: process.env.GOOGLE_ALTRI_CLIENT_ID || '' }
  : null;

// 5. I segreti delle funzioni.
const webhook = randomBytes(24).toString('base64url');
const admin = soloSeEsiste ? null : email;
step('Scrivo i segreti delle funzioni…');
await api('POST', `/projects/${ref}/secrets`, [
  ...nuovi,
  { name: 'TOKEN_SUPABASE', value: token },
  { name: 'WEBHOOK_SECRET', value: webhook },
  { name: 'PROVA', value: '1' },
  { name: 'APP_ANDROID_ID', value: APP_PROVA },
  ...(admin ? [{ name: 'AMMINISTRATORI', value: admin }] : []),
  ...(process.env.GESTORE_GITHUB_TOKEN
    ? [
        { name: 'GITHUB_TOKEN', value: process.env.GESTORE_GITHUB_TOKEN },
        { name: 'GITHUB_REPO', value: process.env.GITHUB_REPOSITORY || 'domenichiniedo/campo-cani-app' },
      ]
    : []),
  ...(google
    ? [
        { name: 'GOOGLE_CLIENT_ID', value: google.id },
        { name: 'GOOGLE_CLIENT_SECRET', value: google.segreto },
        { name: 'GOOGLE_ALTRI_CLIENT_ID', value: google.altri },
      ]
    : []),
  ...(smtp
    ? [
        { name: 'SMTP_HOST', value: smtp.host },
        { name: 'SMTP_PORT', value: smtp.port },
        { name: 'SMTP_USER', value: smtp.user },
        { name: 'SMTP_PASS', value: smtp.pass },
        { name: 'SMTP_FROM', value: smtp.from },
      ]
    : []),
]);

// Il progetto del gestore: "Password dimenticata?" del pannello manda un codice (serve l'SMTP: senza, Supabase manda
// solo un link che il pannello non apre) e l'accesso al pannello con Google, con gli stessi client dell'app.
if (smtp || google) {
  step('Accesso al pannello: email con il codice e Google…');
  await api('PATCH', `/projects/${ref}/config/auth`, {
    ...(smtp
      ? {
          smtp_host: smtp.host,
          smtp_port: smtp.port,
          smtp_user: smtp.user,
          smtp_pass: smtp.pass,
          smtp_admin_email: smtp.from,
          smtp_sender_name: 'K9 Gestore',
          mailer_subjects_recovery: 'Il codice per la nuova password del pannello',
          mailer_templates_recovery_content: '<h2>K9 Gestore</h2>\n<p>Il codice per la nuova password è: <strong>{{ .Token }}</strong></p>',
        }
      : {}),
    ...(google
      ? {
          external_google_enabled: true,
          external_google_client_id: google.id,
          external_google_secret: google.segreto,
          external_google_additional_client_ids: google.altri,
        }
      : {}),
  });
}
if (!smtp) step('Niente "Password dimenticata?" nel pannello: mancano i secret SMTP_USER e SMTP_PASS.');

// Ai centri già pronti l'SMTP e le email con il codice, come li prepara il gestore (passi.ts, passo database).
if (smtp) {
  for (const c of await query('select progetto, campo from public.centri where progetto is not null;')) {
    step(`Email con il codice per "${c.campo}"…`);
    await api('PATCH', `/projects/${c.progetto}/config/auth`, {
      mailer_autoconfirm: false,
      smtp_host: smtp.host,
      smtp_port: smtp.port,
      smtp_user: smtp.user,
      smtp_pass: smtp.pass,
      smtp_admin_email: smtp.from,
      smtp_sender_name: c.campo,
      mailer_subjects_recovery: 'Il codice per la nuova password',
      mailer_templates_recovery_content: '<h2>Nuova password</h2>\n<p>Il tuo codice è: <strong>{{ .Token }}</strong></p>',
      mailer_subjects_confirmation: 'Il codice per confermare la tua email',
      mailer_templates_confirmation_content: `<h2>Benvenuto in ${c.campo.replace(/[<>&]/g, '')}</h2>\n<p>Il codice per confermare la tua email è: <strong>{{ .Token }}</strong></p>`,
    });
  }
}

// Ai centri già pronti l'accesso con Google, come lo accende il gestore per quelli nuovi (passi.ts).
if (google) {
  for (const c of await query('select progetto, campo from public.centri where progetto is not null;')) {
    step(`Accesso con Google per "${c.campo}"…`);
    // Un centro in pausa o cancellato non ferma la prova: si salta e lo dice.
    const res = await fetch(`${API}/projects/${c.progetto}/config/auth`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        external_google_enabled: true,
        external_google_client_id: google.id,
        external_google_secret: google.segreto,
        external_google_additional_client_ids: google.altri,
      }),
    });
    if (!res.ok) step(`  non riuscito (${res.status}): il database è in pausa o non c'è più?`);
  }
} else {
  step('Niente accesso con Google ai centri: mancano GOOGLE_WEB_CLIENT_ID o il secret GOOGLE_WEB_SECRET.');
}

// 6. IBAN di prova e orari.
await query(`update public.banca set bonifico_iban = ${lit(IBAN_PROVA)}, bonifico_intestatario = 'Prova K9 Gestore' where id = 1 and bonifico_iban = '';`);
const orario = (n, quando) => `select cron.schedule(${lit(n)}, ${lit(quando)}, $$
  select net.http_post('${url}/functions/v1/${n}', headers := jsonb_build_object('x-webhook-secret', ${lit(webhook)}))
$$);`;
step('Imposto gli orari di pg_cron…');
await query([orario('prepara-centri', '* * * * *'), orario('addebito-mensile', '0 7 1 * *'), orario('controlla-bonifici', '15 */6 * * *')].join('\n'));

// Le chiavi: la publishable per il pannello e la secret solo qui, per creare il tuo utente (mai nei log).
let keys = await api('GET', `/projects/${ref}/api-keys?reveal=true`);
if (!keys.some((k) => k.type === 'publishable')) {
  await api('POST', `/projects/${ref}/api-keys`, { type: 'publishable', name: 'app' });
  keys = await api('GET', `/projects/${ref}/api-keys?reveal=true`);
}
const pub = keys.find((k) => k.type === 'publishable')?.api_key;
if (!pub?.startsWith('sb_publishable_')) fail('Non trovo la publishable key del gestore: creala in Project Settings → API Keys.');

// 7. Il tuo utente del pannello.
let password = '';
if (admin) {
  const segreta = keys.find((k) => k.type === 'secret')?.api_key ?? keys.find((k) => k.name === 'service_role')?.api_key;
  if (!segreta) fail('Non trovo la secret key del gestore per creare il tuo utente.');
  console.log(`::add-mask::${segreta}`);
  const auth = (path, method, body) =>
    fetch(`${url}/auth/v1/admin/${path}`, { method, headers: { apikey: segreta, Authorization: `Bearer ${segreta}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const [utente] = await query(`select id from auth.users where lower(email) = ${lit(admin)};`);
  if (!utente || o['nuova-password'] === 'si') {
    // Solo nel riepilogo del workflow, che vede chi ha accesso al repository: mai nei log.
    password = randomBytes(9).toString('base64url');
    const r = utente ? await auth(`users/${utente.id}`, 'PUT', { password }) : await auth('users', 'POST', { email: admin, password, email_confirm: true });
    if (!r.ok) fail(`Non riesco a creare il tuo utente del pannello (${r.status}): ${await r.text()}`);
    step(utente ? `Nuova password per ${admin}.` : `Creato il tuo utente del pannello: ${admin}.`);
  } else step(`Il tuo utente del pannello ${admin} c'è già: la password resta quella di prima.`);
}

const gestoreUrl = `${url}/functions/v1`;
uscita('ref', ref);
uscita('gestore_url', gestoreUrl);
uscita('gestore_key', pub);
uscita('chiave_server', riga.pubblica);
riepilogo(`## Gestore della prova generale

- Progetto Supabase: **${nome}** (\`${ref}\`)
- Indirizzo delle funzioni: \`${gestoreUrl}\`
${admin ? `- Pannello K9 Gestore: entri con **${admin}**${password ? ` e la password **\`${password}\`** (cambiala quando vuoi dal pannello, in "Il tuo accesso"; se la perdi usa "Password dimenticata?")` : ' e la password che hai già'}` : ''}
`);
console.log(`\nGestore pronto: ${gestoreUrl}`);
