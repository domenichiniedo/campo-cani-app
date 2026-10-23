import 'expo-sqlite/localStorage/install';
import { useSyncExternalStore } from 'react';

import de from '@/locales/de';
import en from '@/locales/en';
import es from '@/locales/es';
import fr from '@/locales/fr';

// I testi dell'app sono scritti in italiano: per le altre lingue ogni frase italiana ha la sua traduzione.
// Quello che scrive il centro (lezioni, regolamento, pacchetti) resta come l'ha scritto.
export type Lang = 'it' | 'en' | 'de' | 'fr' | 'es';

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'it', label: 'Italiano' },
  { id: 'en', label: 'English' },
  { id: 'de', label: 'Deutsch' },
  { id: 'fr', label: 'Français' },
  { id: 'es', label: 'Español' },
];

const DICTS: Record<Exclude<Lang, 'it'>, Record<string, string>> = { en, de, fr, es };
const KEY = 'lingua';
const isLang = (v: unknown): v is Lang => LANGS.some((l) => l.id === v);

function deviceLang(): Lang {
  try {
    const code = Intl.DateTimeFormat().resolvedOptions().locale.slice(0, 2);
    return isLang(code) ? code : 'it';
  } catch {
    return 'it';
  }
}

function saved(): Lang | null {
  try {
    const v = localStorage.getItem(KEY);
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

let current: Lang = saved() ?? deviceLang();
const listeners = new Set<() => void>();

export const lang = () => current;

/** Locale per numeri e date ("it-IT", "en-GB", ...). */
export const locale = () => ({ it: 'it-IT', en: 'en-GB', de: 'de-DE', fr: 'fr-FR', es: 'es-ES' })[current];

export function setLang(l: Lang) {
  current = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {}
  listeners.forEach((f) => f());
}

/** La lingua scelta; il componente si ridisegna quando cambia. */
export const useLang = () =>
  useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => current,
  );

/**
 * Traduce una frase italiana nella lingua scelta. Le parti variabili si scrivono {nome}:
 * t('Ciao {nome}', { nome: 'Luca' }). Se manca la traduzione resta l'italiano.
 */
export function t(it: string, vars?: Record<string, string | number>): string {
  const s = current === 'it' ? it : (DICTS[current][it] ?? it);
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Segna una frase scritta fuori dai componenti (liste, costanti): si traduce poi con t() quando si mostra. */
export const tKey = (it: string) => it;
