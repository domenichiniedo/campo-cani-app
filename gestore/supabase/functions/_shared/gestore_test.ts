// Prove del gestore: deno test gestore/supabase/functions/_shared/
import nacl from 'npm:tweetnacl@1.0.3';

import type { Centro } from './comune.ts';
import { fineMese, firmaLicenza } from './licenza.ts';
import { MIGRAZIONI } from './migrazioni.ts';
import { passo, type Ambiente } from './passi.ts';

const uguale = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`atteso ${JSON.stringify(b)}, trovato ${JSON.stringify(a)}`);
};
// SMTP e Twilio finti: senza, il gestore non prepara i centri (email e cellulare dei clienti vanno confermati).
const SMTP = { host: 'smtp.x', port: '587', user: 'u', pass: 'p', from: 'n@x.it' };
const SMS = { sid: 'AC1', token: 't', servizio: 'MG1' };
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
  const a: Ambiente = { api, seme: 'rghXTQSBwUC6jUTKfjpjGmcbK1Qz4bPQQKxMekZvGDY', org: '', regione: 'eu-central-1', oggi: '2026-10-23', password: () => 'pw', smtp: SMTP, sms: SMS };
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
  // Fino al giorno 3 del mese dopo: il primo addebito arriva il 1° e va pagato entro il 3.
  uguale(c.scade, '2026-11-03');
  if (!c.licenza.startsWith('CC1.')) throw new Error('manca la licenza');
  if (!chiamate.includes('SQL lungo true')) throw new Error('migrazioni e titolare non eseguiti insieme');
  if (!chiamate.some((x) => x.startsWith("update public.settings set license_code = 'CC1."))) throw new Error('licenza non scritta nel database del centro');
  // Un centro pronto con una migrazione in meno la riceve, e poi non fa più niente.
  const nuove = await passo({ ...c, migrazioni: MIGRAZIONI.length - 1 }, a);
  uguale(nuove, { migrazioni: MIGRAZIONI.length });
  uguale(await passo(c, a), {});
});

Deno.test('conferma di email e cellulare: sempre accese, senza SMTP o Twilio il centro non si prepara', async () => {
  const fai = async (smtp: Ambiente['smtp'], sms: Ambiente['sms']) => {
    let auth: Record<string, unknown> = {};
    const sql: string[] = [];
    const api: Ambiente['api'] = async (method, path, body) => {
      if (path.endsWith('/config/auth')) auth = body as Record<string, unknown>;
      if (path.endsWith('/database/query')) {
        const q = (body as { query: string }).query;
        if (q.includes('to_regclass')) return [{ pronto: true }];
        sql.push(q);
      }
      return [];
    };
    const a: Ambiente = { api, seme: 'x', org: '', regione: '', oggi: '2026-10-23', password: () => '', smtp, sms };
    const c = { id: 'c1', codice: 'K9-ABCDEF', campo: 'Le Querce', email: 't@q.it', stato: 'database', progetto: 'p', tentativi: 0, migrazioni: 0 } as unknown as Centro;
    await passo(c, a);
    return { auth, sms: sql.some((q) => q.includes('sms_check = true')) };
  };
  for (const [smtp, sms] of [[null, SMS], [SMTP, null]] as const) {
    let errore = '';
    await fai(smtp, sms).catch((e) => (errore = e.message));
    if (!errore.includes(smtp ? 'Twilio' : 'SMTP')) throw new Error(`atteso errore, trovato "${errore}"`);
  }
  const acceso = await fai(SMTP, SMS);
  uguale(acceso.auth.mailer_autoconfirm, false);
  uguale(acceso.auth.sms_provider, 'twilio');
  uguale(acceso.auth.sms_autoconfirm, false);
  if (!String(acceso.auth.mailer_templates_confirmation_content).includes('{{ .Token }}')) throw new Error('manca il codice nella email');
  uguale(acceso.sms, true);
});

Deno.test('accesso con Google: con il client di Google si accende, senza no', async () => {
  const fai = async (google: Ambiente['google']) => {
    let auth: Record<string, unknown> = {};
    const api: Ambiente['api'] = async (_method, path, body) => {
      if (path.endsWith('/config/auth')) auth = body as Record<string, unknown>;
      if (path.endsWith('/database/query') && (body as { query: string }).query.includes('to_regclass')) return [{ pronto: true }];
      return [];
    };
    const a: Ambiente = { api, seme: 'x', org: '', regione: '', oggi: '2026-10-23', password: () => '', smtp: SMTP, sms: SMS, google };
    const c = { id: 'c1', codice: 'K9-ABCDEF', campo: 'Le Querce', email: 't@q.it', stato: 'database', progetto: 'p', tentativi: 0, migrazioni: 0 } as unknown as Centro;
    await passo(c, a);
    return auth;
  };
  uguale((await fai(null)).external_google_enabled, undefined);
  const acceso = await fai({ id: 'web.apps.googleusercontent.com', segreto: 'GOCSPX-x', altri: 'desktop.apps.googleusercontent.com' });
  uguale(acceso.external_google_enabled, true);
  uguale(acceso.external_google_client_id, 'web.apps.googleusercontent.com');
  uguale(acceso.external_google_additional_client_ids, 'desktop.apps.googleusercontent.com');
});

Deno.test('conto del mese: canone a giorni, quote del piano del giorno, prezzi del centro', async () => {
  const { contoDelMese, scadenzaLicenza, piuGiorni, giorniPerPagare } = await import('./costi.ts');
  const prezzi = {
    base: { canone_cents: 0, tariffa_cents: 100 },
    professional: { canone_cents: 3000, tariffa_cents: 80 },
    pro: { canone_cents: 6000, tariffa_cents: 50 },
  };
  // Tutto il mese in Professional: canone pieno e 80 cent a prenotazione.
  uguale(
    contoDelMese({ mese: '2026-11', dal: '2026-01-01', cambi: [{ piano: 'professional', dal: '2026-01-01' }], attuale: 'professional', prezzi, canone: null, tariffa: null, prenotazioni: { '2026-11-03': 2, '2026-11-20': 3 } }),
    { canone_cents: 3000, prenotazioni: 5, quote_cents: 400, importo_cents: 3400 },
  );
  // Passa a Pro il 16 novembre (30 giorni): 15 giorni a 30 € e 15 a 60 €; le quote seguono il piano del giorno.
  uguale(
    contoDelMese({
      mese: '2026-11',
      dal: '2026-01-01',
      cambi: [{ piano: 'professional', dal: '2026-01-01' }, { piano: 'pro', dal: '2026-11-16' }],
      attuale: 'pro',
      prezzi,
      canone: null,
      tariffa: null,
      prenotazioni: { '2026-11-03': 2, '2026-11-20': 3 },
    }),
    { canone_cents: 4500, prenotazioni: 5, quote_cents: 310, importo_cents: 4810 },
  );
  // Registrato il 21: canone solo per 10 giorni. Prezzi fatti apposta per il centro.
  uguale(
    contoDelMese({ mese: '2026-11', dal: '2026-11-21', cambi: [{ piano: 'pro', dal: '2026-11-21' }], attuale: 'pro', prezzi, canone: 900, tariffa: 0, prenotazioni: { '2026-11-25': 4 } }),
    { canone_cents: 300, prenotazioni: 4, quote_cents: 0, importo_cents: 300 },
  );
  // Licenza fino al giorno 3 del mese dopo (anche a dicembre).
  uguale(scadenzaLicenza('2026-11-01', 3), '2026-12-03');
  uguale(scadenzaLicenza('2026-12-28', 3), '2027-01-03');
  uguale(piuGiorni('2026-02-27', 3), '2026-03-02');
  uguale(giorniPerPagare(), 3);
});

Deno.test('bonifici riconosciuti dal codice, dall\'IBAN e dal mese', async () => {
  const { abbina, ibanValido } = await import('./costi.ts');
  const centri = [
    { id: 'a', codice: 'K9-ABC234', iban: 'IT60X0542811101000000123456' },
    { id: 'b', codice: 'K9-XYZ789', iban: '' },
  ];
  const aperti = [
    { id: 'a9', centro: 'a', mese: '2026-09', importo_cents: 1500 },
    { id: 'a10', centro: 'a', mese: '2026-10', importo_cents: 2000 },
    { id: 'b10', centro: 'b', mese: '2026-10', importo_cents: 700 },
  ];
  const m = (importo_cents: number, causale: string, iban = '', nome = '') => ({ id: 'x', importo_cents, iban, nome, causale });
  // Codice senza trattino e mese nella causale: paga quel mese.
  uguale(abbina(m(2000, 'k9abc234 2026-10'), centri, aperti), { centro: 'a', addebiti: ['a10'] });
  // Solo l'IBAN, nessuna causale utile: paga i mesi più vecchi finché basta.
  uguale(abbina(m(3500, 'quota', 'IT60 X054 2811 1010 0000 0123 456'), centri, aperti), { centro: 'a', addebiti: ['a9', 'a10'] });
  uguale(abbina(m(1600, 'K9-ABC234'), centri, aperti), { centro: 'a', addebiti: ['a9'] });
  // Troppo poco: centro riconosciuto, niente pagato.
  uguale(abbina(m(500, 'K9-XYZ789 2026-10'), centri, aperti), { centro: 'b', addebiti: [] });
  // Non è di un centro.
  uguale(abbina(m(700, 'stipendio', 'IT02L1234512345123456789012'), centri, aperti), { centro: null, addebiti: [] });
  uguale([ibanValido('IT60X0542811101000000123456'), ibanValido('IT61X0542811101000000123456')], [true, false]);
});

Deno.test('Enable Banking: JWT RS256 e movimenti in entrata', async () => {
  const { accredito, chiavePrivata, jwt } = await import('./banca.ts');
  const coppia = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', coppia.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der)).replace(/(.{64})/g, '$1\n')}\n-----END PRIVATE KEY-----`;
  // Anche con gli a capo scritti come \n (come capita incollando la chiave nei segreti).
  const token = await jwt('app-1', await chiavePrivata(pem.replace(/\n/g, '\\n')), 1_800_000_000);
  const [testa, corpo, firma] = token.split('.');
  uguale(JSON.parse(new TextDecoder().decode(b64(testa))), { typ: 'JWT', alg: 'RS256', kid: 'app-1' });
  uguale(JSON.parse(new TextDecoder().decode(b64(corpo))), { iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: 1_800_000_000, exp: 1_800_003_600 });
  if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', coppia.publicKey, b64(firma), new TextEncoder().encode(`${testa}.${corpo}`)))) throw new Error('firma non valida');

  uguale(
    accredito({
      transaction_id: 't1',
      credit_debit_indicator: 'CRDT',
      status: 'BOOK',
      transaction_amount: { amount: '34.10', currency: 'EUR' },
      booking_date: '2026-11-02',
      debtor: { name: 'Le Querce' },
      debtor_account: { iban: 'IT60X0542811101000000123456' },
      remittance_information: ['K9-ABC234 2026-10'],
    }),
    { id: 't1', data: '2026-11-02', importo_cents: 3410, iban: 'IT60X0542811101000000123456', nome: 'Le Querce', causale: 'K9-ABC234 2026-10' },
  );
  uguale(accredito({ credit_debit_indicator: 'DBIT', transaction_amount: { amount: '5', currency: 'EUR' } }), null);
  uguale(accredito({ credit_debit_indicator: 'CRDT', status: 'PDNG', transaction_amount: { amount: '5', currency: 'EUR' } }), null);
});
