import { createClient } from '@supabase/supabase-js';

import type { CentreBilling } from '@/lib/billing';
import { demoCall } from '@/lib/gestore-demo';

// Il pannello "K9 Gestore" entra nel progetto Supabase del gestore con un tuo utente (email e password)
// e chiede tutto alla funzione "pannello", che controlla che tu sia fra gli AMMINISTRATORI.

const FUNCTIONS = (process.env.EXPO_PUBLIC_GESTORE_URL ?? '').replace(/\/+$/, '');
const KEY = process.env.EXPO_PUBLIC_GESTORE_KEY ?? '';

/** Demo con dati finti, senza server (workflow "Pannello del gestore" con "demo"). */
export const adminDemo = process.env.EXPO_PUBLIC_PANNELLO_DEMO === '1';

export const adminConfigured = adminDemo || (FUNCTIONS.length > 0 && KEY.length > 0);

/** Il progetto Supabase del gestore: anche l'accesso con Google passa da qui. */
export const adminUrl = FUNCTIONS.replace(/\/functions\/v1$/, '');
export const adminKey = KEY;

export const admin = createClient(adminUrl || 'http://localhost', KEY || 'missing', {
  auth: { storage: localStorage, storageKey: 'k9-gestore-accesso', autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

/** Un centro, con i dati per fatturargli (vuoti nei centri registrati prima che l'app li chiedesse). */
export type AdminCentre = CentreBilling & {
  id: string;
  codice: string;
  campo: string;
  email: string;
  piano: 'base' | 'professional' | 'pro';
  stato: 'mandato' | 'progetto' | 'avvio' | 'database' | 'chiavi' | 'licenza' | 'pronto' | 'errore';
  errore: string;
  /** Prezzi fatti apposta per il centro; null = quelli del piano. */
  tariffa_cents: number | null;
  canone_cents: number | null;
  /** Come paga il piano: canone + quote (consumo) o una cifra fissa al mese. */
  formula: 'consumo' | 'fisso';
  /** Prezzo fisso fatto apposta per il centro; null = quello del piano. */
  fisso_cents: number | null;
  /** Piano più piccolo scelto dal centro, che parte dal primo del mese dopo. */
  piano_prossimo?: 'base' | 'professional' | 'pro' | null;
  /** Formula scelta dal centro, che parte dal primo del mese dopo. */
  formula_prossima?: 'consumo' | 'fisso' | null;
  /** Disdetto: ultimo giorno del servizio. */
  disdetta?: string | null;
  /** IBAN da cui il centro paga, per riconoscere i suoi bonifici. */
  iban: string;
  scade: string | null;
  sospeso: boolean;
  creato: string;
  /** Il progetto Supabase del centro (null finché non è creato) e le migrazioni dell'app già caricate. */
  progetto?: string | null;
  migrazioni?: number;
  /** Stato del progetto su Supabase (ACTIVE_HEALTHY, INACTIVE...), MANCANTE se è stato cancellato, null se non si sa. */
  db_stato?: string | null;
};

/** Un progetto Supabase del tuo account: il database di un centro, del gestore o un altro tuo. */
export type DbProject = {
  ref: string;
  nome: string;
  stato: string;
  regione: string;
  creato: string | null;
  centro: { id: string; campo: string; codice: string } | null;
  gestore: boolean;
};

/** Il database di un centro: solo numeri, nessun dato dei clienti. righe è una stima di Postgres. */
export type CentreDatabase = {
  stato: string;
  regione: string;
  creato: string | null;
  postgres: string;
  mb: number;
  utenti: number;
  tabelle: { nome: string; righe: number }[];
  migrazioni: number;
  migrazioni_app: number;
  link: string;
};

export type Charge = {
  id: string;
  centro: string;
  mese: string;
  prenotazioni: number;
  canone_cents: number;
  /** Quota sui pacchetti attivati nel mese, già compresa in importo_cents. */
  pacchetti_cents?: number;
  importo_cents: number;
  /** Bonus scalato dal conto: importo_cents è già al netto. */
  bonus_cents: number;
  stato: 'da_fare' | 'zero' | 'inviato' | 'pagato' | 'non_pagato';
  fattura: string | null;
  errore: string;
  /** Entro questo giorno va pagato, poi l'app del centro si blocca. */
  scadenza: string | null;
  causale: string;
  pagato_il: string | null;
};

/** pacchetti_bp: la quota sul prezzo dei pacchetti attivati, in centesimi di punto (100 = 1%). */
export type PlanRow = { piano: AdminCentre['piano']; canone_cents: number; tariffa_cents: number; fisso_cents: number; pacchetti_bp: number };

/** Il tuo conto: IBAN per i bonifici dei centri e collegamento in sola lettura con Enable Banking. */
export type Bank = {
  bonifico_iban: string;
  bonifico_intestatario: string;
  banca: string;
  paese: string;
  tipo: 'personal' | 'business';
  iban: string;
  valido_fino: string | null;
  ultimo_controllo: string | null;
  errore: string;
  collegata: boolean;
  /** Ci sono i segreti di Enable Banking sul gestore. */
  abilitata: boolean;
};

/** Un bonifico in entrata con "K9" o di un centro che non paga nessun addebito: da abbinare a mano. */
export type Movement = { id: string; data: string; importo_cents: number; iban: string; nome: string; causale: string; centro: string | null };

/** Un file da scaricare in una Release di GitHub. */
export type ReleaseFile = { id: number; nome: string; url: string; mb: number; scaricato: number; data: string };
export type Release = { id: number; tag: string; titolo: string; data: string; note: string; file: ReleaseFile[] };
/** Una build di GitHub Actions: stato queued/in_progress/completed, esito success/failure/cancelled. */
export type BuildRun = { id: number; nome: string; stato: string; esito: string | null; quando: string; url: string; titolo: string };
/** Le app su GitHub; abilitato = c'è il token di GitHub sul gestore. */
export type AppVersions = { abilitato: boolean; rilasci: Release[]; build: BuildRun[]; lanci: { id: string; titolo: string }[] };

/** Un codice bonus per i centri nuovi: lo scrivono quando si registrano. usi_max null = senza limite. */
export type BonusCode = { codice: string; importo_cents: number; usi_max: number | null; usati: number; scade: string | null; nota: string; attivo: boolean; creato: string };
/** Il credito di un centro, dal pannello (codice null) o da un codice bonus: si scala dai conti del mese. */
export type Credit = { id: string; centro: string; importo_cents: number; residuo_cents: number; codice: string | null; nota: string; creato: string };

export type AdminData = {
  oggi: string;
  centri: AdminCentre[];
  addebiti: Charge[];
  piani: PlanRow[];
  banca: Bank;
  movimenti: Movement[];
  codici: BonusCode[];
  crediti: Credit[];
};

// Accesso: nella demo basta una qualsiasi email e password.
let demoIn = false;
const demoListeners = new Set<(signedIn: boolean) => void>();
const demoSet = (v: boolean) => {
  demoIn = v;
  demoListeners.forEach((l) => l(v));
};

export async function adminSignedIn() {
  if (adminDemo) return demoIn;
  const { data } = await admin.auth.getSession();
  return !!data.session;
}

export function onAdminAuth(cb: (signedIn: boolean) => void) {
  if (adminDemo) {
    demoListeners.add(cb);
    return () => void demoListeners.delete(cb);
  }
  const { data } = admin.auth.onAuthStateChange((_e, s) => cb(!!s));
  return () => data.subscription.unsubscribe();
}

/** Errore da mostrare, oppure null se l'accesso è riuscito. */
export async function adminSignIn(email: string, password: string) {
  if (adminDemo) {
    demoSet(true);
    return null;
  }
  const { error } = await admin.auth.signInWithPassword({ email, password });
  return error ? (/Invalid login/i.test(error.message) ? 'Email o password non corretti.' : error.message) : null;
}

export function adminSignOut() {
  if (adminDemo) return demoSet(false);
  admin.auth.signOut();
}

export async function adminCall<T>(azione: string, body: object = {}): Promise<T> {
  if (adminDemo) return demoCall<T>(azione, body as Record<string, unknown>);
  const { data } = await admin.auth.getSession();
  let res: Response;
  try {
    res = await fetch(`${FUNCTIONS}/pannello`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
      body: JSON.stringify({ azione, ...body }),
    });
  } catch {
    throw new Error('Connessione assente. Controlla internet e riprova.');
  }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.errore ?? `Il gestore ha risposto ${res.status}.`);
  return out as T;
}
