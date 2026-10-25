import 'expo-sqlite/localStorage/install';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { t, tKey } from '@/lib/i18n';

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
const NAMED = [
  tKey('{nome} ha già una lezione in questo orario'),
  tKey('{nome} non segue questo tipo di lezione'),
  tKey("{nome} non è disponibile a quell'ora"),
  tKey('{nome} è sospeso: non può entrare in campo'),
  tKey('Il campo è già occupato il {nome}'),
];

/** Il testo variabile di un messaggio con {nome}, se il messaggio ha quella forma. */
function namedPart(msg: string, key: string) {
  const [before, after] = key.split('{nome}');
  return msg.length > before.length + after.length && msg.startsWith(before) && msg.endsWith(after)
    ? msg.slice(before.length, msg.length - after.length)
    : null;
}

export function errorText(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (/Invalid login credentials/i.test(msg)) return t('Email o password non corretti.');
  if (/Email not confirmed/i.test(msg)) return t('Conferma prima la tua email con il codice che ti abbiamo mandato.');
  if (/User already registered/i.test(msg)) return t('Esiste già un account con questa email. Accedi o recupera la password.');
  if (/Password should be at least/i.test(msg)) return t('La password deve avere almeno 8 caratteri.');
  if (/Token has expired or is invalid/i.test(msg)) return t('Il codice non è valido o è scaduto. Richiedine uno nuovo.');
  if (/phone.*already.*registered|already been registered/i.test(msg)) return t('Questo cellulare è già usato da un altro account.');
  if (/phone provider|sending (sms|confirmation)|sms/i.test(msg)) return t('Il centro non ha ancora attivato gli SMS. Riprova più tardi o contatta il centro.');
  if (/only request this after/i.test(msg)) return t('Aspetta qualche secondo prima di chiedere un altro codice.');
  if (/network|fetch/i.test(msg)) return t('Connessione assente. Controlla internet e riprova.');
  // I messaggi del database sono in italiano: se c'è la traduzione si mostra quella.
  // Alcuni contengono un nome o una data ("Luca ha già una lezione..."): si traduce il resto.
  for (const k of NAMED) {
    const nome = namedPart(msg, k);
    if (nome !== null) return t(k, { nome });
  }
  return t(msg);
}
