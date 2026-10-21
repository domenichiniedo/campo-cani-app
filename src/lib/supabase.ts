import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

export const isConfigured = supabaseUrl.length > 0 && supabasePublishableKey.length > 0;

export const supabase = createClient(supabaseUrl || 'http://localhost', supabasePublishableKey || 'missing', {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

/** Testo d'errore leggibile da un errore Supabase o JavaScript. */
export function errorText(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (/Invalid login credentials/i.test(msg)) return 'Email o password non corretti.';
  if (/Email not confirmed/i.test(msg)) return 'Conferma prima la tua email: ti abbiamo mandato un link.';
  if (/User already registered/i.test(msg)) return 'Esiste già un account con questa email. Accedi o recupera la password.';
  if (/Password should be at least/i.test(msg)) return 'La password deve avere almeno 8 caratteri.';
  if (/Token has expired or is invalid/i.test(msg)) return 'Il codice non è valido o è scaduto. Richiedine uno nuovo.';
  if (/network|fetch/i.test(msg)) return 'Connessione assente. Controlla internet e riprova.';
  return msg;
}
