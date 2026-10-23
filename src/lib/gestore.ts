import { t } from '@/lib/i18n';

// Il server gestore (cartella gestore/): registra i centri nuovi, prepara il loro database e collega Stripe.
// L'indirizzo è quello delle sue funzioni, per esempio https://xxxx.supabase.co/functions/v1.
// Vuoto: niente registrazione dall'app, i centri si attivano solo con il codice di licenza.

const BASE = (process.env.EXPO_PUBLIC_GESTORE_URL ?? '').replace(/\/+$/, '');

export const gestoreEnabled = BASE.length > 0;

/** Codice del centro, quello corto da dare a clienti e trainer (K9-XXXXXX). */
export const isCentreCode = (s: string) => /^K9-?[A-Z0-9]{6}$/i.test(s.trim());
export const centreCode = (s: string) => s.trim().toUpperCase().replace(/^K9-?/, 'K9-');

export type CentreState = 'mandato' | 'progetto' | 'avvio' | 'database' | 'chiavi' | 'licenza' | 'pronto' | 'errore';

async function call<T>(fn: string, body: object, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(t('Connessione assente. Controlla internet e riprova.'));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.errore ?? t('Il servizio non risponde. Riprova tra poco.'));
  return data as T;
}

/** Registra un centro nuovo: torna il suo codice e il link di Stripe per firmare il mandato SEPA. */
export const registerCentre = (campo: string, email: string, piano: string) =>
  call<{ codice: string; mandato: string | null }>('registra-centro', { campo, email, piano });

export const centreStatus = (codice: string) => call<{ stato: CentreState; campo: string; licenza: string | null }>('centro', { codice: centreCode(codice) });

/** Il conto Stripe del centro per i pagamenti online; solo il proprietario, con il suo accesso. */
export const connectStripe = (codice: string, token: string) =>
  call<{ stato: 'attivo' | 'in_verifica' | 'da_completare'; link?: string }>('stripe-collega', { codice }, token);
