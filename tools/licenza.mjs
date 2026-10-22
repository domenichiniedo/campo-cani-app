#!/usr/bin/env node
// Licenze di K9 Manager: le generi tu sul tuo computer, con una chiave privata che non
// esce mai da lì. L'app contiene solo la chiave pubblica, che serve a controllarle ma non
// a crearle: senza la tua chiave privata nessuno può fare una licenza valida.
//
//   node tools/licenza.mjs chiavi
//       Crea la coppia di chiavi (una volta sola). La privata va in ~/.campo-cani/licenza-privata.pem:
//       tienila al sicuro e fanne una copia. La pubblica va incollata in src/lib/license-key.ts.
//
//   node tools/licenza.mjs genera --campo "Centro Cinofilo Le Querce" --piano professional --scadenza 2027-12-31 \
//       [--url https://xxxx.supabase.co --chiave sb_publishable_xxxx] [--id lq-001]
//       Stampa il codice di licenza da dare al campo. Senza --scadenza non scade mai.
//       --piano è base, professional o pro (vedi src/lib/plans.ts). Per cambiare piano a un centro
//       genera un nuovo codice con lo stesso --id, --url e --chiave: lo incolla in Impostazioni → Licenza.
//
//   node tools/licenza.mjs verifica <codice>
//       Mostra cosa contiene un codice e se la firma è valida.

import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DIR = join(homedir(), '.campo-cani');
const PRIVATE = process.env.CAMPO_CANI_CHIAVE ?? join(DIR, 'licenza-privata.pem');
const PREFIX = 'CC1';
const PLANS = ['base', 'professional', 'pro'];

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

function args(list) {
  const out = {};
  for (let i = 0; i < list.length; i++) {
    if (list[i].startsWith('--')) out[list[i].slice(2)] = list[i + 1] ?? '';
  }
  return out;
}

/** La chiave pubblica nuda (32 byte), come la legge l'app. */
const rawPublic = (key) => key.export({ format: 'der', type: 'spki' }).subarray(-32);

function keys() {
  if (existsSync(PRIVATE)) fail(`Esiste già una chiave privata in ${PRIVATE}: non la sovrascrivo, le licenze già date smetterebbero di funzionare.`);
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  mkdirSync(DIR, { recursive: true, mode: 0o700 });
  writeFileSync(PRIVATE, privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
  console.log(`Chiave privata salvata in ${PRIVATE}. Non condividerla e conservane una copia.`);
  console.log('\nIncolla questa riga in src/lib/license-key.ts:\n');
  console.log(`export const LICENSE_PUBLIC_KEY = '${b64url(rawPublic(publicKey))}';`);
}

function generate(o) {
  if (!existsSync(PRIVATE)) fail('Manca la chiave privata: esegui prima "node tools/licenza.mjs chiavi".');
  if (!o.campo?.trim()) fail('Indica il nome del campo con --campo "Nome".');
  if (!PLANS.includes(o.piano)) fail(`Indica il piano con --piano ${PLANS.join(' | ')}.`);
  if (o.scadenza && !/^\d{4}-\d{2}-\d{2}$/.test(o.scadenza)) fail('La scadenza va scritta come AAAA-MM-GG.');
  if (!!o.url !== !!o.chiave) fail('--url e --chiave vanno insieme: sono l\'indirizzo e la publishable key del database del campo.');
  if (o.chiave && !o.chiave.startsWith('sb_publishable_')) fail('Usa la publishable key (sb_publishable_...), mai la secret key.');
  const payload = {
    v: 1,
    id: o.id || b64url(randomBytes(6)),
    campo: o.campo.trim(),
    piano: o.piano,
    scade: o.scadenza || null,
    emessa: new Date().toISOString().slice(0, 10),
    ...(o.url ? { url: o.url.replace(/\/+$/, ''), chiave: o.chiave } : {}),
  };
  const body = b64url(JSON.stringify(payload));
  const sig = sign(null, Buffer.from(`${PREFIX}.${body}`), createPrivateKey(readFileSync(PRIVATE)));
  console.log(`${PREFIX}.${body}.${b64url(sig)}`);
  console.error(`\nLicenza ${payload.id} per "${payload.campo}", piano ${payload.piano}, ${payload.scade ? `valida fino al ${payload.scade}` : 'senza scadenza'}.`);
}

function check(code) {
  const [prefix, body, sig] = (code ?? '').trim().split('.');
  if (prefix !== PREFIX || !body || !sig) fail('Non è un codice di licenza K9 Manager.');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  console.log(payload);
  if (!existsSync(PRIVATE)) return console.log('Firma: non controllata (manca la chiave privata su questo computer).');
  const pub = createPublicKey(createPrivateKey(readFileSync(PRIVATE)));
  const ok = verify(null, Buffer.from(`${prefix}.${body}`), pub, Buffer.from(sig, 'base64url'));
  console.log(ok ? 'Firma valida.' : 'Firma NON valida: il codice è stato modificato o non è tuo.');
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'chiavi') keys();
else if (cmd === 'genera') generate(args(rest));
else if (cmd === 'verifica') check(rest[0]);
else fail('Uso: node tools/licenza.mjs chiavi | genera --campo "Nome" --piano base|professional|pro [--scadenza AAAA-MM-GG] | verifica <codice>');
