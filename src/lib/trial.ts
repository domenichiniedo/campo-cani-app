import { useEffect, useState } from 'react';

import { dayKey, today } from '@/lib/format';

// Versione di prova (Actions → App per Android con "giorni"): l'ultimo giorno valido, AAAA-MM-GG.
// Vuoto nelle versioni normali.
export const trialEnd = process.env.EXPO_PUBLIC_PROVA_FINO ?? '';

/** "26/10/2026" */
export const trialEndText = trialEnd.split('-').reverse().join('/');

/** true quando la prova è finita; si ricontrolla ogni minuto, anche con l'app aperta. */
export function useTrialOver() {
  const over = () => !!trialEnd && dayKey(today()) > trialEnd;
  const [isOver, setOver] = useState(over);
  useEffect(() => {
    if (!trialEnd) return;
    const id = setInterval(() => setOver(over()), 60000);
    return () => clearInterval(id);
  }, []);
  return isOver;
}
