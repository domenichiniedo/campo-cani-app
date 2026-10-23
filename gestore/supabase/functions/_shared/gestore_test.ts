// Prove del gestore: deno test gestore/supabase/functions/_shared/
import nacl from 'npm:tweetnacl@1.0.3';

import type { Centro } from './comune.ts';
import { fineMese, firmaLicenza } from './licenza.ts';
import { MIGRAZIONI } from './migrazioni.ts';
import { passo, type Ambiente } from './passi.ts';
import { firmaStripe, form } from './stripe.ts';

const uguale = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`atteso ${JSON.stringify(b)}, trovato ${JSON.stringify(a)}`);
};
const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

Deno.test('fine del mese', () => {
  uguale(fineMese('2026-10-23', 0), '2026-10-31');
  uguale(fineMese('2026-10-23', 1), '2026-11-30');
  uguale(fineMese('2026-12-05', 1), '2027-01-31');
  uguale(fineMese('2028-01-10', 1), '2028-02-29');
});

Deno.test('licenza firmata dal server, letta come la legge l\'app', () => {
  // Chiavi di prova, usate solo qui.
  const seme = 'rghXTQSBwUC6jUTKfjpjGmcbK1Qz4bPQQKxMekZvGDY';
  const pubblica = b64('WioGcZMSSt6noH4UNPIF3JrnOxyvdzCTi_4OAVkTYWE');
  const dati = { id: 'K9-ABCDEF', campo: 'Le Querce àè', piano: 'pro' as const, scade: '2026-11-30', emessa: '2026-10-23', url: 'https://x.supabase.co', chiave: 'sb_publishable_x' };
  const codice = firmaLicenza(dati, seme);
  const [prefix, body, sig] = codice.split('.');
  uguale(prefix, 'CC1');
  if (!nacl.sign.detached.verify(new TextEncoder().encode(`${prefix}.${body}`), b64(sig), pubblica)) throw new Error('firma non valida');
  uguale(JSON.parse(new TextDecoder().decode(b64(body))), { v: 1, ...dati });
});

Deno.test('parametri per Stripe', () => {
  uguale(
    decodeURIComponent(form({ a: 1, b: { c: 'x', d: { e: true } }, f: ['sepa_debit'], g: undefined, h: null }).toString()),
    'a=1&b[c]=x&b[d][e]=true&f[0]=sepa_debit',
  );
});

Deno.test('firma degli eventi Stripe', async () => {
  const segreto = 'whsec_prova';
  const payload = '{"id":"evt_1"}';
  const t = 1_800_000_000;
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(segreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const v1 = [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${t}.${payload}`)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  uguale(await firmaStripe(payload, `t=${t},v1=${v1}`, segreto, t + 10), true);
  uguale(await firmaStripe(payload, `t=${t},v0=x,v1=${v1}`, segreto, t), true);
  uguale(await firmaStripe(payload + ' ', `t=${t},v1=${v1}`, segreto, t), false);
  uguale(await firmaStripe(payload, `t=${t},v1=${v1}`, 'whsec_altro', t), false);
  uguale(await firmaStripe(payload, `t=${t},v1=${v1}`, segreto, t + 1000), false);
  uguale(await firmaStripe(payload, '', segreto, t), false);
});

Deno.test('preparazione di un centro, passo dopo passo', async () => {
  const chiamate: string[] = [];
  let avviato = 0;
  const api: Ambiente['api'] = async (method, path, body) => {
    chiamate.push(`${method} ${path}`);
    if (path === '/organizations') return [{ id: 'org1', slug: 'mia', name: 'Mia' }];
    if (method === 'POST' && path === '/projects') {
      uguale((body as { organization_id: string }).organization_id, 'org1');
      return { id: 'abcdefghijklmnopqrst' };
    }
    if (path === '/projects/abcdefghijklmnopqrst') return { status: avviato++ ? 'ACTIVE_HEALTHY' : 'COMING_UP' };
    if (path.endsWith('/database/query')) {
      const q = (body as { query: string }).query;
      if (q.includes('to_regclass')) return [{ pronto: false }];
      chiamate.push(q.length > 1000 ? `SQL lungo ${q.includes("set_owner_email('titolare@querce.it')")}` : q.slice(0, 60));
      return [];
    }
    if (path.endsWith('/api-keys?reveal=true')) return [{ type: 'publishable', api_key: 'sb_publishable_abc' }, { type: 'secret', api_key: 'sb_secret_NO' }];
    return {};
  };
  const a: Ambiente = { api, seme: 'rghXTQSBwUC6jUTKfjpjGmcbK1Qz4bPQQKxMekZvGDY', org: '', regione: 'eu-central-1', oggi: '2026-10-23', password: () => 'pw', smtp: null };
  let c = { id: 'c1', codice: 'K9-ABCDEF', campo: "L'Oasi", email: 'titolare@querce.it', piano: 'professional', stato: 'progetto', tentativi: 0, migrazioni: 0, scade: null } as unknown as Centro;
  const stati: string[] = [];
  for (let i = 0; i < 10 && c.stato !== 'pronto'; i++) {
    c = { ...c, ...(await passo(c, a)) };
    stati.push(c.stato);
  }
  uguale(stati, ['avvio', 'avvio', 'database', 'chiavi', 'licenza', 'pronto']);
  uguale(c.url, 'https://abcdefghijklmnopqrst.supabase.co');
  uguale(c.chiave, 'sb_publishable_abc');
  uguale(c.migrazioni, MIGRAZIONI.length);
  uguale(c.scade, '2026-11-30');
  if (!c.licenza.startsWith('CC1.')) throw new Error('manca la licenza');
  if (!chiamate.includes('SQL lungo true')) throw new Error('migrazioni e titolare non eseguiti insieme');
  if (!chiamate.some((x) => x.startsWith("update public.settings set license_code = 'CC1."))) throw new Error('licenza non scritta nel database del centro');
  // Un centro pronto con una migrazione in meno la riceve, e poi non fa più niente.
  const nuove = await passo({ ...c, migrazioni: MIGRAZIONI.length - 1 }, a);
  uguale(nuove, { migrazioni: MIGRAZIONI.length });
  uguale(await passo(c, a), {});
});
