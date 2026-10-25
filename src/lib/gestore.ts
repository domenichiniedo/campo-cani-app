import type { CentreBilling } from '@/lib/billing';
import { t } from '@/lib/i18n';

// Il server gestore (cartella gestore/): registra i centri nuovi e prepara il loro database.
// L'indirizzo è quello delle sue funzioni, per esempio https://xxxx.supabase.co/functions/v1.
// Vuoto: niente registrazione dall'app, i centri si attivano solo con il codice di licenza.

const BASE = (process.env.EXPO_PUBLIC_GESTORE_URL ?? '').replace(/\/+$/, '');

export const gestoreEnabled = BASE.length > 0;

/**
 * Il link per i clienti di un centro del gestore (anche nel QR code): su Android apre l'app già sul centro, e chi
 * non ha l'app va a scaricarla. Vedi la funzione invito del gestore.
 */
export const inviteLink = (codice: string) => `${BASE}/invito?codice=${encodeURIComponent(codice)}`;

/** Codice del centro, quello corto da dare a clienti e trainer (K9-XXXXXX). */
export const isCentreCode = (s: string) => /^K9-?[A-Z0-9]{6}$/i.test(s.trim());
const centreCode = (s: string) => s.trim().toUpperCase().replace(/^K9-?/, 'K9-');

// Nella demo (mobile-demo/build.mjs) le licenze di prova non sono di un centro registrato: l'abbonamento usa questo
// codice e lo gestisce il finto gestore (demo-backend.js), così dalle Impostazioni si prova anche il cambio di piano.
const DEMO_CENTRE = process.env.EXPO_PUBLIC_DEMO_CENTRE ?? '';

/** Il codice del centro di una licenza, per vedere e cambiare l'abbonamento; null se il centro non è del gestore. */
export const subscriptionCode = (licenseId: string) => (!gestoreEnabled ? null : isCentreCode(licenseId) ? licenseId : DEMO_CENTRE || null);

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

/** Registra un centro nuovo, con i dati per fatturargli (e l'IBAN da cui pagherà, se lo dà): torna il suo codice. */
/** bonus: codice bonus del gestore (facoltativo); torna il credito che ha dato, in centesimi. */
export const registerCentre = (campo: string, email: string, piano: string, formula: Formula, iban: string, fattura: CentreBilling, bonus = '') =>
  call<{ codice: string; bonus_cents?: number }>('registra-centro', { campo, email, piano, formula, iban, fattura, bonus });

/** Come il centro paga il piano: canone + quota per prenotazione (consumo) o una cifra fissa al mese. */
export type Formula = 'consumo' | 'fisso';

/** fisso_cents manca se il gestore non ha ancora il prezzo fisso. */
export type PlanPrice = { canone_cents: number; tariffa_cents: number; fisso_cents?: number | null };

/** I prezzi dei piani, per chi sta per registrare un centro. */
export const planPrices = () => call<{ piani: Partial<Record<string, PlanPrice>> }>('centro', { prezzi: true }).then((r) => r.piani);

export type Due = { id: string; mese: string; prenotazioni: number; canone_cents: number; importo_cents: number; stato: 'inviato' | 'non_pagato'; causale: string; scadenza: string | null };

export type Subscription = {
  piano: string;
  formula?: Formula;
  piani: Record<string, PlanPrice>;
  iban_centro: string;
  scade: string | null;
  /** Il conto del gestore dove il centro paga con il bonifico istantaneo. */
  bonifico: { iban: string; intestatario: string };
  da_pagare: Due[];
  /** Bonus che resta da scalare dai prossimi conti, in centesimi. */
  credito_cents?: number;
};

/** Piano, prezzi e cosa c'è da pagare; solo il proprietario, con il suo accesso. */
export const subscription = (codice: string, token: string) => call<Subscription>('abbonamento', { codice, azione: 'vedi' }, token);

/** Cambia piano o formula da oggi: torna anche la licenza (nuova se è cambiato il piano) da attivare subito. */
export const changePlan = (codice: string, piano: string, formula: Formula, token: string) =>
  call<Subscription & { licenza: string }>('abbonamento', { codice, azione: 'cambia', piano, formula }, token);

/** L'IBAN da cui il centro paga, per riconoscere i suoi bonifici. */
export const setCentreIban = (codice: string, iban: string, token: string) => call<Subscription>('abbonamento', { codice, azione: 'iban', iban }, token);

export const centreStatus = (codice: string) => call<{ stato: CentreState; campo: string; licenza: string | null }>('centro', { codice: centreCode(codice) });

