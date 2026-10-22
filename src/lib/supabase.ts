import 'expo-sqlite/localStorage/install';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const envUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const envKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

/** C'è un database scritto nella build (la copia del tuo campo). */
export const hasEnvConfig = envUrl.length > 0 && envKey.length > 0;

const make = (url: string, key: string) =>
  createClient(url || 'http://localhost', key || 'missing', {
    auth: {
      storage: localStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

let current = make(envUrl, envKey);
let currentUrl = envUrl;

/** Collega l'app al database di un centro (dalla licenza). */
export function connectTo(url: string, key: string) {
  if (url === currentUrl) return;
  current.auth.stopAutoRefresh();
  current = make(url, key);
  currentUrl = url;
}

// Tutta l'app usa `supabase`: punta sempre al database collegato in quel momento.
export const supabase = new Proxy({} as SupabaseClient, {
  get: (_t, prop) => {
    const v = Reflect.get(current, prop);
    return typeof v === 'function' ? v.bind(current) : v;
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
