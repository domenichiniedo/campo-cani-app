import type { SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { t } from '@/lib/i18n';

// Accesso con Google. Ogni centro ha il suo progetto Supabase, quindi niente redirect (andrebbe registrato su
// Google l'indirizzo di ogni progetto): l'app si fa dare da Google un "ID token" e lo passa a Supabase con
// signInWithIdToken. Google lo dà in tre modi, secondo dove gira l'app:
//   - browser (iPhone e computer): il pulsante di Google (Google Identity Services);
//   - app Android (Capacitor): la scelta dell'account di Android, col plugin SocialLogin;
//   - programma Windows e Mac (Electron): il browser del computer, che torna al programma su 127.0.0.1.
// Google non lascia accedere dentro una WebView, per questo Android e il programma non usano il pulsante web.

/** Client OAuth "Applicazione web" di Google Cloud: pulsante web e app Android. */
const WEB_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
/** Client OAuth "App desktop": programma Windows e Mac. Il suo "segreto" per Google non è segreto. */
const DESKTOP_ID = process.env.EXPO_PUBLIC_GOOGLE_DESKTOP_CLIENT_ID ?? '';
const DESKTOP_SECRET = process.env.EXPO_PUBLIC_GOOGLE_DESKTOP_SECRET ?? '';

type Capacitor = { isNativePlatform?: () => boolean; nativePromise: (plugin: string, method: string, options?: object) => Promise<unknown> };
type Desktop = { googleLogin?: (o: object) => Promise<{ idToken: string; accessToken: string } | null> };

const w = (Platform.OS === 'web' ? globalThis : {}) as { Capacitor?: Capacitor; campoCaniDesktop?: Desktop };
const capacitor = w.Capacitor?.isNativePlatform?.() ? w.Capacitor : null;
const desktop = w.campoCaniDesktop?.googleLogin ? w.campoCaniDesktop : null;

/** Come si accede con Google qui: pulsante di Google, account del telefono, browser del computer, o niente. */
export const googleMode: 'web' | 'android' | 'desktop' | null =
  Platform.OS !== 'web' ? null
  : desktop ? (DESKTOP_ID ? 'desktop' : null)
  : capacitor ? (WEB_ID ? 'android' : null)
  : WEB_ID ? 'web' : null;

export const googleWebClientId = WEB_ID;

/** Il nonce lega il token a questo accesso: a Google va l'impronta, a Supabase il valore. */
export async function newNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const raw = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return { raw, hashed: Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('') };
}

/** Il progetto ha l'accesso con Google acceso? (Impostazioni pubbliche di Supabase Auth.) */
export async function googleEnabledOn(url: string, key: string) {
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/auth/v1/settings`, { headers: { apikey: key } });
    const s = (await res.json()) as { external?: { google?: boolean } };
    return !!s.external?.google;
  } catch {
    return false;
  }
}

let androidReady: Promise<unknown> | null = null;

/** Android e programma per computer: chiede l'account a Google e torna il token. null = annullato. */
async function nativeToken(hashed: string): Promise<{ idToken: string; accessToken?: string } | null> {
  if (googleMode === 'desktop') {
    return desktop!.googleLogin!({ clientId: DESKTOP_ID, clientSecret: DESKTOP_SECRET, nonce: hashed });
  }
  const cap = capacitor!;
  androidReady ??= cap.nativePromise('SocialLogin', 'initialize', { google: { webClientId: WEB_ID } });
  await androidReady;
  try {
    const r = (await cap.nativePromise('SocialLogin', 'login', {
      provider: 'google',
      options: { nonce: hashed, style: 'standard', forcePrompt: true },
    })) as { result?: { idToken?: string | null } };
    return r.result?.idToken ? { idToken: r.result.idToken } : null;
  } catch (e) {
    // Chi chiude la finestra di scelta dell'account non vede errori.
    if (/cancel/i.test((e as Error)?.message ?? '')) return null;
    throw e;
  }
}

/** Entra in Supabase con un token di Google. Torna l'errore da mostrare, o null. */
export async function signInWithGoogleToken(client: SupabaseClient, idToken: string, nonce: string, accessToken?: string) {
  const { error } = await client.auth.signInWithIdToken({ provider: 'google', token: idToken, nonce, access_token: accessToken });
  if (!error) return null;
  if (/provider.*(not enabled|disabled)|unsupported provider/i.test(error.message)) return t("Questo centro non ha ancora attivato l'accesso con Google.");
  return error.message;
}

/** Accesso con Google su Android e sul computer. Torna l'errore da mostrare, o null (anche se annullato). */
export async function nativeGoogleSignIn(client: SupabaseClient) {
  try {
    const { raw, hashed } = await newNonce();
    const tok = await nativeToken(hashed);
    if (!tok) return null;
    return await signInWithGoogleToken(client, tok.idToken, raw, tok.accessToken);
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    if (/network|fetch/i.test(msg)) return t('Connessione assente. Controlla internet e riprova.');
    return t('Accesso con Google non riuscito: {errore}', { errore: msg });
  }
}
