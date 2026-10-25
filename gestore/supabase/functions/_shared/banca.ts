// Il tuo conto in banca, in sola lettura, con Enable Banking (open banking PSD2): https://enablebanking.com.
// Segreti: ENABLE_BANKING_APP_ID (l'id dell'applicazione) e ENABLE_BANKING_CHIAVE (la chiave privata .pem
// scaricata quando l'hai creata). Ogni chiamata porta un JWT firmato con quella chiave (RS256, kid = id).
// Nessun pagamento: si leggono solo i movimenti.

// Senza comune.ts, così le prove non creano il client del database.
const env = (k: string) => Deno.env.get(k) ?? '';

const BASE = 'https://api.enablebanking.com';

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const testo = (s: string) => b64url(new TextEncoder().encode(s));

/** Lunghezza DER. */
const lung = (n: number) => (n < 128 ? [n] : n < 256 ? [0x81, n] : [0x82, n >> 8, n & 255]);

/** Una chiave "BEGIN RSA PRIVATE KEY" (PKCS#1) dentro la busta PKCS#8 che WebCrypto sa leggere. */
function pkcs8(pkcs1: Uint8Array) {
  const alg = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  const ottetti = [0x04, ...lung(pkcs1.length), ...pkcs1];
  const corpo = [0x02, 0x01, 0x00, ...alg, ...ottetti];
  return new Uint8Array([0x30, ...lung(corpo.length), ...corpo]);
}

/** Legge la chiave privata dal testo .pem (anche con gli a capo scritti come \n). */
export function chiavePrivata(pem: string) {
  const t = pem.replace(/\\n/g, '\n');
  const der = Uint8Array.from(atob(t.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')), (c) => c.charCodeAt(0));
  const dati = t.includes('BEGIN RSA PRIVATE KEY') ? pkcs8(der) : der;
  return crypto.subtle.importKey('pkcs8', dati, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

/** Il JWT che Enable Banking chiede a ogni chiamata (vale al massimo 24 ore: qui un'ora). */
export async function jwt(appId: string, chiave: CryptoKey, ora = Math.floor(Date.now() / 1000)) {
  const testa = testo(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: appId }));
  const corpo = testo(JSON.stringify({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: ora, exp: ora + 3600 }));
  const firma = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chiave, new TextEncoder().encode(`${testa}.${corpo}`)));
  return `${testa}.${corpo}.${b64url(firma)}`;
}

export const bancaSpenta = () => !env('ENABLE_BANKING_APP_ID') || !env('ENABLE_BANKING_CHIAVE');

// deno-lint-ignore no-explicit-any
type Any = any;

export async function enableBanking(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Any> {
  if (bancaSpenta()) throw new Error('Manca Enable Banking: ENABLE_BANKING_APP_ID e ENABLE_BANKING_CHIAVE (vedi gestore/README.md).');
  const token = await jwt(env('ENABLE_BANKING_APP_ID'), await chiavePrivata(env('ENABLE_BANKING_CHIAVE')));
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const dati = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Enable Banking ${r.status}: ${dati.message ?? dati.error ?? JSON.stringify(dati).slice(0, 200)}`);
  return dati;
}

/** Un movimento di Enable Banking nei campi che servono, o null se non è un accredito contabilizzato. */
export function accredito(m: Any) {
  if (m.credit_debit_indicator !== 'CRDT') return null;
  if (m.status && m.status !== 'BOOK') return null;
  const importo = Math.round(Number(m.transaction_amount?.amount ?? 0) * 100);
  if (!(importo > 0) || (m.transaction_amount?.currency ?? 'EUR') !== 'EUR') return null;
  const data = String(m.booking_date ?? m.value_date ?? m.transaction_date ?? '').slice(0, 10);
  const causale = [...(Array.isArray(m.remittance_information) ? m.remittance_information : []), m.reference_number, m.note].filter(Boolean).join(' ');
  const iban = String(m.debtor_account?.iban ?? '');
  const nome = String(m.debtor?.name ?? '');
  // Un id stabile anche per le banche che non lo danno, così un movimento non si conta due volte.
  const id = String(m.transaction_id ?? m.entry_reference ?? '') || `${data}|${importo}|${iban}|${causale}`.slice(0, 300);
  return { id, data, importo_cents: importo, iban, nome, causale: causale.slice(0, 500) };
}
