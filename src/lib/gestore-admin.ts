import { createClient } from '@supabase/supabase-js';

// Il pannello "K9 Gestore" entra nel progetto Supabase del gestore con un tuo utente (email e password)
// e chiede tutto alla funzione "pannello", che controlla che tu sia fra gli AMMINISTRATORI.

const FUNCTIONS = (process.env.EXPO_PUBLIC_GESTORE_URL ?? '').replace(/\/+$/, '');
const KEY = process.env.EXPO_PUBLIC_GESTORE_KEY ?? '';

export const adminConfigured = FUNCTIONS.length > 0 && KEY.length > 0;

export const admin = createClient(FUNCTIONS.replace(/\/functions\/v1$/, '') || 'http://localhost', KEY || 'missing', {
  auth: { storage: localStorage, storageKey: 'k9-gestore-accesso', autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

export type AdminCentre = {
  id: string;
  codice: string;
  campo: string;
  email: string;
  piano: 'base' | 'professional' | 'pro';
  stato: 'mandato' | 'progetto' | 'avvio' | 'database' | 'chiavi' | 'licenza' | 'pronto' | 'errore';
  errore: string;
  tariffa_cents: number;
  stripe_metodo: string | null;
  stripe_conto: string | null;
  stripe_attivo: boolean;
  scade: string | null;
  sospeso: boolean;
  creato: string;
};

export type Charge = {
  id: string;
  centro: string;
  mese: string;
  prenotazioni: number;
  importo_cents: number;
  stato: 'da_fare' | 'zero' | 'inviato' | 'pagato' | 'non_pagato';
  fattura: string | null;
  errore: string;
};

export type AdminData = { oggi: string; centri: AdminCentre[]; addebiti: Charge[] };

export async function adminCall<T>(azione: string, body: object = {}): Promise<T> {
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
