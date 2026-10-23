// Stripe senza libreria: poche chiamate REST con la chiave segreta, che sta solo nei segreti del gestore.
// Finché STRIPE_LIVE non è "si" accetta solo chiavi di test (sk_test_ / rk_test_): niente soldi veri.

const API = 'https://api.stripe.com/v1';
const key = () => Deno.env.get('STRIPE_SECRET_KEY') ?? '';

/** Perché Stripe non si può usare, oppure null. */
export function stripeSpento(): string | null {
  if (!key()) return 'Manca la chiave di Stripe (STRIPE_SECRET_KEY) nei segreti del gestore.';
  if (!/^(sk|rk)_test_/.test(key()) && Deno.env.get('STRIPE_LIVE') !== 'si') {
    return 'La chiave di Stripe non è di test: per incassare davvero imposta anche STRIPE_LIVE=si.';
  }
  return null;
}

type Params = { [k: string]: string | number | boolean | null | undefined | Params | (string | Params)[] };

/** Parametri nel formato di Stripe: a[b]=1&c[0]=x. */
export function form(params: Params, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(params)) {
    const name = prefix ? `${prefix}[${k}]` : k;
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x, i) => (typeof x === 'object' ? form(x, `${name}[${i}]`, out) : out.append(`${name}[${i}]`, String(x))));
    else if (typeof v === 'object') form(v, name, out);
    else out.append(name, String(v));
  }
  return out;
}

// deno-lint-ignore no-explicit-any
export async function stripe<T = any>(method: 'GET' | 'POST', path: string, params: Params = {}, idempotenza?: string): Promise<T> {
  const spento = stripeSpento();
  if (spento) throw new Error(spento);
  const body = form(params).toString();
  const res = await fetch(method === 'GET' && body ? `${API}${path}?${body}` : API + path, {
    method,
    headers: {
      Authorization: `Bearer ${key()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(idempotenza ? { 'Idempotency-Key': idempotenza } : {}),
    },
    body: method === 'POST' ? body : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe ${res.status} su ${path}: ${data?.error?.message ?? 'errore sconosciuto'}`);
  return data as T;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Controlla la firma di un evento Stripe (intestazione Stripe-Signature: t=...,v1=...). */
export async function firmaStripe(payload: string, header: string, secret: string, ora = Date.now() / 1000, tolleranza = 300) {
  const parti = header.split(',').map((p) => p.split('='));
  const t = parti.find(([k]) => k === 't')?.[1];
  const firme = parti.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !firme.length || !secret || Math.abs(ora - Number(t)) > tolleranza) return false;
  const chiave = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const attesa = hex(await crypto.subtle.sign('HMAC', chiave, new TextEncoder().encode(`${t}.${payload}`)));
  // Confronto a tempo costante.
  return firme.some((f) => f.length === attesa.length && [...f].reduce((d, ch, i) => d | (ch.charCodeAt(0) ^ attesa.charCodeAt(i)), 0) === 0);
}
