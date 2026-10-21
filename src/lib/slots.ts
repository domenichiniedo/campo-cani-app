import { STEP, slotDate } from '@/lib/format';
import type { BusySlot } from '@/lib/types';

export type SlotState = 'free' | 'taken' | 'mine' | 'past';

/**
 * Inizi possibili per una lezione di `dur` minuti in un giorno: ogni mezz'ora
 * coperta deve essere aperta. Lo stato dice se si può prenotare.
 */
export function startsFor(day: string, open: number[], busy: BusySlot[], dur: number, now = new Date()) {
  const openSet = new Set(open);
  const dayBusy = busy.filter((b) => b.day === day);
  const out: { start: number; state: SlotState }[] = [];
  for (const start of [...open].sort((a, b) => a - b)) {
    let fits = true;
    for (let m = start; m < start + dur; m += STEP) if (!openSet.has(m)) fits = false;
    if (!fits) continue;
    const hit = dayBusy.find((b) => start < b.start_min + b.dur_min && b.start_min < start + dur);
    const state: SlotState = hit ? (hit.mine ? 'mine' : 'taken') : slotDate(day, start) <= now ? 'past' : 'free';
    out.push({ start, state });
  }
  return out;
}
