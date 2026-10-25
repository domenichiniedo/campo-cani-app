import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { dayKey, today } from '@/lib/format';
import { centreStatus, gestoreEnabled, isCentreCode } from '@/lib/gestore';
import { t } from '@/lib/i18n';
import { expiredText, isExpired, licensingEnabled, longer, readLicense, type License } from '@/lib/license';
import { sameOr, useWhenActive } from '@/lib/refresh';
import { connectTo, hasEnvConfig, supabase } from '@/lib/supabase';

// Con la licenza attiva (chiave pubblica in license-key.ts) l'app si apre solo con un codice
// valido, che dice anche a quale database collegarsi. Il codice più recente sta nel database
// del centro: quando il centro rinnova, vale subito per tutti i suoi clienti.
// Al posto della licenza si può scrivere il codice corto del centro (K9-XXXXXX): la licenza la dà il gestore.
// Clienti e trainer possono essere iscritti a più centri: l'app ricorda tutti quelli aperti sul dispositivo e si
// passa dall'uno all'altro senza riscrivere il codice. Ogni centro ha il suo database, e il suo accesso.

const STORE = 'campo-cani-licenza';
const CENTRES = 'campo-cani-centri';

/** Un centro già aperto su questo dispositivo. */
export type SavedCentre = { id: string; url: string; campo: string; code: string };

type State =
  | { kind: 'checking' }
  | { kind: 'open'; license: License | null }
  | { kind: 'activate'; reason: string }
  | { kind: 'not-configured' };

type Ctx = {
  license: License | null;
  activate: (code: string) => Promise<string | null>;
  /** I centri aperti su questo dispositivo, compreso quello di adesso. */
  centres: SavedCentre[];
  /** Torna alla schermata del codice per aggiungere un centro; da lì si torna ai centri salvati. */
  addCentre: () => void;
  /** Toglie un centro dalla lista (non quello aperto). */
  forget: (c: SavedCentre) => void;
};

const LicenseContext = createContext<Ctx>({ license: null, activate: async () => null, centres: [], addCentre: () => {}, forget: () => {} });
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

const readCentres = (): SavedCentre[] => {
  try {
    const v = JSON.parse(localStorage.getItem(CENTRES) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const writeCentres = (list: SavedCentre[]) => {
  try {
    localStorage.setItem(CENTRES, JSON.stringify(list));
  } catch {}
};
const sameCentre = (a: { id: string; url?: string | null }, b: { id: string; url?: string | null }) => a.id === b.id && (a.url ?? '') === (b.url ?? '');

/** Ricorda il centro appena aperto (o aggiorna nome e codice di uno già salvato), senza cambiare l'ordine. */
function remember(code: string, l: License): SavedCentre[] {
  const list = readCentres();
  const entry = { id: l.id, url: l.url ?? '', campo: l.campo, code };
  const i = list.findIndex((x) => sameCentre(x, l));
  const next = i < 0 ? [...list, entry] : list.map((x, k) => (k === i ? entry : x));
  writeCentres(next);
  return next;
}

/** Nel browser e nell'app Android il link di attivazione arriva come ?codice=... nell'indirizzo: letto, si toglie. */
const clearLinkCode = () => {
  if (Platform.OS === 'web' && typeof history !== 'undefined' && /[?&]codice=/.test(location.search)) history.replaceState(null, '', location.pathname);
};

/** Il centro della licenza salvata sul dispositivo, anche scaduta (per mostrare al proprietario cosa pagare). */
export const storedCentre = () => {
  const r = readLicense(read());
  return r.ok ? r.license.id : '';
};

/** Codice dal link di attivazione: campocaniapp://attiva?codice=... */
const codeFromUrl = (url: string | null) => {
  if (!url) return '';
  const q = Linking.parse(url).queryParams?.codice;
  return typeof q === 'string' ? q : '';
};

/** Dal codice del centro alla sua licenza, chiedendola al gestore. */
async function fromCentreCode(code: string): Promise<{ code: string } | { reason: string }> {
  if (!gestoreEnabled) return { reason: t('Questo non è un codice di licenza K9 Manager.') };
  try {
    const s = await centreStatus(code);
    if (s.licenza) return { code: s.licenza };
    return { reason: s.stato === 'errore' ? t('Il centro non è stato attivato. Contatta il centro.') : t('Il centro si sta ancora preparando. Riprova tra qualche minuto.') };
  } catch (e) {
    return { reason: t((e as Error).message) };
  }
}

/** Apre la licenza: collega il database e prende il codice più recente salvato dal centro. */
async function open(given: string): Promise<State & { code?: string }> {
  let code = given;
  if (isCentreCode(code)) {
    const c = await fromCentreCode(code);
    if ('reason' in c) return { kind: 'activate', reason: c.reason };
    code = c.code;
  }
  const r = readLicense(code);
  if (!r.ok) return { kind: 'activate', reason: r.reason };
  let best = r.license;
  let bestCode = code;
  if (best.url && best.chiave) connectTo(best.url, best.chiave);
  else if (!hasEnvConfig) return { kind: 'activate', reason: t('Questa licenza non indica il database del centro.') };
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
  const [centres, setCentres] = useState<SavedCentre[]>(readCentres);

  /** Il centro aperto diventa quello di adesso, e resta nella lista dei centri del dispositivo. */
  const keep = useCallback((code: string, license: License | null) => {
    write(code);
    if (license) setCentres(remember(code, license));
  }, []);

  const activate = useCallback(
    async (code: string) => {
      const next = await open(code.trim());
      if (next.kind !== 'open') return next.kind === 'activate' ? next.reason : t('Licenza non valida.');
      keep(next.code ?? code.trim(), next.license);
      setState({ kind: 'open', license: next.license });
      return null;
    },
    [keep],
  );

  const addCentre = useCallback(() => setState({ kind: 'activate', reason: '' }), []);
  const forget = useCallback((c: SavedCentre) => {
    const next = readCentres().filter((x) => !sameCentre(x, c));
    writeCentres(next);
    setCentres(next);
  }, []);

  useEffect(() => {
    if (!licensingEnabled) return;
    // Un link (o un QR) di un altro centro lo aggiunge: quello di prima resta fra i centri salvati.
    const fromLink = codeFromUrl(linked);
    const code = fromLink || read();
    const next: Promise<State & { code?: string }> = code ? open(code) : Promise.resolve({ kind: 'activate', reason: '' });
    next.then((n) => {
      if (fromLink) clearLinkCode();
      if (n.kind === 'open') keep(n.code ?? code, n.license);
      setState(n);
    });
  }, [linked, keep]);

  // Rinnovi e cambi di piano fatti dal centro valgono senza chiudere l'app; una licenza scaduta la chiude.
  useWhenActive(() => {
    const code = read();
    if (!licensingEnabled || !code) return;
    open(code)
      .then((n) => {
        if (n.kind === 'open') keep(n.code ?? code, n.license);
        setState(sameOr<State>(n.kind === 'open' ? { kind: 'open', license: n.license } : n));
      })
      .catch(() => {});
  }, 5 * 60_000);

  if (state.kind === 'checking') return null;
  if (state.kind === 'not-configured') return activation('');
  const ctx = { activate, centres, addCentre, forget };
  if (state.kind === 'activate') {
    return <LicenseContext.Provider value={{ ...ctx, license: null }}>{activation(state.reason)}</LicenseContext.Provider>;
  }
  return (
    // Cambiando centro, tutto ciò che sta sotto riparte da capo con il nuovo database.
    <LicenseContext.Provider value={{ ...ctx, license: state.license }} key={`${state.license?.id ?? ''}|${state.license?.url ?? 'env'}`}>
      {children}
    </LicenseContext.Provider>
  );
}
