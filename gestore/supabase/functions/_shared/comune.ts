// Parti comuni alle funzioni del gestore.
import { createClient } from 'npm:@supabase/supabase-js@2';

export const env = (k: string) => Deno.env.get(k) ?? '';

/** Il database del gestore, con la chiave di servizio: solo qui dentro, mai nell'app. */
export const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

export type Centro = {
  id: string;
  codice: string;
  campo: string;
  email: string;
  piano: 'base' | 'professional' | 'pro';
  stato: 'mandato' | 'progetto' | 'avvio' | 'database' | 'chiavi' | 'licenza' | 'pronto' | 'errore';
  errore: string;
  tentativi: number;
  /** Quota per prenotazione e canone mensile fatti apposta per il centro; null = quelli del piano. */
  tariffa_cents: number | null;
  canone_cents: number | null;
  /** IBAN da cui il centro fa i bonifici, per riconoscerli. */
  iban: string;
  stripe_cliente: string | null;
  stripe_metodo: string | null;
  stripe_conto: string | null;
  stripe_attivo: boolean;
  progetto: string | null;
  url: string | null;
  chiave: string | null;
  migrazioni: number;
  licenza: string;
  scade: string | null;
  sospeso: boolean;
  creato: string;
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export const testo = (body: string, status = 200) => new Response(body, { status, headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' } });

export const preflight = (req: Request) => (req.method === 'OPTIONS' ? new Response(null, { headers: CORS }) : null);

/** Le chiamate di pg_cron (e delle altre funzioni) portano la parola segreta WEBHOOK_SECRET. */
export const daCron = (req: Request) => !!env('WEBHOOK_SECRET') && req.headers.get('x-webhook-secret') === env('WEBHOOK_SECRET');

/** Indirizzo di un'altra funzione del gestore. */
export const funzione = (nome: string) => `${env('SUPABASE_URL')}/functions/v1/${nome}`;

/** Fa partire subito la preparazione dei centri, senza aspettare il prossimo giro di pg_cron. */
export function sveglia() {
  const giro = fetch(funzione('prepara-centri'), { method: 'POST', headers: { 'x-webhook-secret': env('WEBHOOK_SECRET') } }).catch(() => {});
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil(giro);
}

export const messaggio = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Oggi a Roma, AAAA-MM-GG. */
export const oggi = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(d);

/** Il ruolo di chi chiama, letto dal database del centro con il suo accesso (null se non ha accesso). */
export async function ruolo(c: Centro, token: string) {
  if (!token || !c.url) return null;
  const h = { apikey: c.chiave ?? '', Authorization: `Bearer ${token}` };
  const u = await fetch(`${c.url}/auth/v1/user`, { headers: h });
  if (!u.ok) return null;
  const { id } = await u.json();
  const p = await fetch(`${c.url}/rest/v1/profiles?select=role&id=eq.${encodeURIComponent(id)}`, { headers: h });
  const [profilo] = p.ok ? await p.json() : [];
  return (profilo?.role as string | undefined) ?? null;
}
