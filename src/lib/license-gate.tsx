import * as Linking from 'expo-linking';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { dayKey, today } from '@/lib/format';
import { expiredText, isExpired, licensingEnabled, longer, readLicense, type License } from '@/lib/license';
import { connectTo, hasEnvConfig, supabase } from '@/lib/supabase';

// Con la licenza attiva (chiave pubblica in license-key.ts) l'app si apre solo con un codice
// valido, che dice anche a quale database collegarsi. Il codice più recente sta nel database
// del centro: quando il centro rinnova, vale subito per tutti i suoi clienti.

const STORE = 'campo-cani-licenza';

type State =
  | { kind: 'checking' }
  | { kind: 'open'; license: License | null }
  | { kind: 'activate'; reason: string }
  | { kind: 'not-configured' };

type Ctx = { license: License | null; activate: (code: string) => Promise<string | null> };

const LicenseContext = createContext<Ctx>({ license: null, activate: async () => null });
export const useLicense = () => useContext(LicenseContext);

const read = () => {
  try {
    return localStorage.getItem(STORE) ?? '';
  } catch {
    return '';
  }
};
const write = (code: string) => {
  try {
    localStorage.setItem(STORE, code);
  } catch {}
};

/** Codice dal link di attivazione: campocaniapp://attiva?codice=... */
const codeFromUrl = (url: string | null) => {
  if (!url) return '';
  const q = Linking.parse(url).queryParams?.codice;
  return typeof q === 'string' ? q : '';
};

/** Apre la licenza: collega il database e prende il codice più recente salvato dal centro. */
async function open(code: string): Promise<State & { code?: string }> {
  const r = readLicense(code);
  if (!r.ok) return { kind: 'activate', reason: r.reason };
  let best = r.license;
  let bestCode = code;
  if (best.url && best.chiave) connectTo(best.url, best.chiave);
  else if (!hasEnvConfig) return { kind: 'activate', reason: 'Questa licenza non indica il database del centro.' };
  const { data } = await supabase.from('settings').select('license_code').eq('id', 1).maybeSingle();
  const stored = (data?.license_code as string | undefined) ?? '';
  if (stored && stored !== code) {
    const s = readLicense(stored);
    // Vale solo un codice firmato per lo stesso centro e lo stesso database.
    if (s.ok && s.license.id === best.id && s.license.url === best.url && longer(s.license, best) === s.license) {
      best = s.license;
      bestCode = stored;
    }
  }
  if (isExpired(best, dayKey(today()))) return { kind: 'activate', reason: expiredText(best) };
  return { kind: 'open', license: best, code: bestCode };
}

export function LicenseGate({ children, activation }: { children: ReactNode; activation: (reason: string) => ReactNode }) {
  const [state, setState] = useState<State>(
    licensingEnabled ? { kind: 'checking' } : hasEnvConfig ? { kind: 'open', license: null } : { kind: 'not-configured' },
  );
  const linked = Linking.useURL();

  const activate = useCallback(async (code: string) => {
    const next = await open(code.trim());
    if (next.kind !== 'open') return next.kind === 'activate' ? next.reason : 'Licenza non valida.';
    write(next.code ?? code.trim());
    setState({ kind: 'open', license: next.license });
    return null;
  }, []);

  useEffect(() => {
    if (!licensingEnabled) return;
    const code = codeFromUrl(linked) || read();
    const next: Promise<State & { code?: string }> = code ? open(code) : Promise.resolve({ kind: 'activate', reason: '' });
    next.then((n) => {
      if (n.kind === 'open') write(n.code ?? code);
      setState(n);
    });
  }, [linked]);

  if (state.kind === 'checking') return null;
  if (state.kind === 'not-configured') return activation('');
  if (state.kind === 'activate') {
    return <LicenseContext.Provider value={{ license: null, activate }}>{activation(state.reason)}</LicenseContext.Provider>;
  }
  return (
    // Cambiando centro, tutto ciò che sta sotto riparte da capo con il nuovo database.
    <LicenseContext.Provider value={{ license: state.license, activate }} key={state.license?.url ?? 'env'}>
      {children}
    </LicenseContext.Provider>
  );
}
