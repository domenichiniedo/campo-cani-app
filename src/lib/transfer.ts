import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { Booking, TransferSettings } from '@/lib/types';

// Bonifico istantaneo sul conto del proprietario. L'app non tocca la banca: mostra al cliente IBAN,
// importo e causale (anche come QR da inquadrare con l'app della banca) e il proprietario, visto
// l'accredito, segna la lezione come pagata.

export const normalizeIban = (s: string) => s.replace(/\s/g, '').toUpperCase();

/** IBAN con il controllo mod 97 (vale per tutti i paesi SEPA). */
export function isValidIban(raw: string): boolean {
  const s = normalizeIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  if (s.startsWith('IT') && s.length !== 27) return false;
  const digits = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let rest = 0;
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  return rest === 1;
}

/** IBAN a gruppi di quattro, come sulle carte della banca. */
export const formatIban = (s: string) => normalizeIban(s).replace(/(.{4})(?=.)/g, '$1 ');

/** Codice corto della prenotazione, da cercare nell'estratto conto. */
export const transferRef = (b: Pick<Booking, 'id'>) => `K9-${b.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

/** Causale del bonifico: codice, cane e giorno della lezione. */
export const transferReason = (b: Pick<Booking, 'id' | 'day' | 'start_min'>, dog: string) => {
  const [y, m, d] = b.day.split('-');
  const h = `${String(Math.floor(b.start_min / 60)).padStart(2, '0')}:${String(b.start_min % 60).padStart(2, '0')}`;
  return `${transferRef(b)} ${dog} ${d}/${m}/${y} ${h}`.slice(0, 140);
};

/**
 * Testo del QR "SEPA" (EPC069-12): le app delle banche lo leggono e compilano il bonifico da sole.
 * Versione 002 (il BIC non serve), caratteri UTF-8, importo in euro con il punto.
 */
export const epcPayload = (holder: string, iban: string, cents: number, reason: string) =>
  ['BCD', '002', '1', 'SCT', '', holder.slice(0, 70), normalizeIban(iban), `EUR${(cents / 100).toFixed(2)}`, '', '', reason.slice(0, 140)].join(
    '\n',
  );

/** Il conto del proprietario, letto quando serve (null finché non arriva). */
export function useTransfer() {
  const [cfg, setCfg] = useState<TransferSettings | null>(null);
  useEffect(() => {
    let alive = true;
    supabase
      .from('transfer_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => alive && setCfg((data as TransferSettings | null) ?? null));
    return () => {
      alive = false;
    };
  }, []);
  return cfg;
}
