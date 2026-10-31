import { dayKey, hm, longDay, today } from '@/lib/format';
import { t } from '@/lib/i18n';
import type { Post } from '@/lib/types';

// La bacheca del centro: avvisi per i clienti ed eventi con "Partecipo". Le date sono giorni (AAAA-MM-GG).

/** Quello che il cliente vede oggi: gli avvisi non scaduti e gli eventi da oggi in poi. */
export const visiblePosts = (list: Post[], day = dayKey(today())) =>
  list.filter((p) => (p.kind === 'evento' ? (p.event_day ?? '') >= day : !p.visible_until || p.visible_until >= day));

/** Prima gli eventi, dal più vicino; poi gli avvisi, dal più recente. */
export const sortPosts = (list: Post[]) =>
  [...list].sort((a, b) =>
    a.kind !== b.kind
      ? a.kind === 'evento'
        ? -1
        : 1
      : a.kind === 'evento'
        ? `${a.event_day}${a.event_start ?? 0}`.localeCompare(`${b.event_day}${b.event_start ?? 0}`)
        : b.created_at.localeCompare(a.created_at),
  );

/** "sabato 14 novembre, ore 10:00 · Campo A" */
export const eventWhen = (p: Post) =>
  [p.event_day ? longDay(p.event_day) + (p.event_start != null ? `, ${t('ore {ora}', { ora: hm(p.event_start) })}` : '') : '', p.place]
    .filter(Boolean)
    .join(' · ');

/** "31/12/2026" o "31/12" (anno di oggi) → "2026-12-31"; null se non è una data. */
export function parseDay(s: string): string | null {
  const r = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(s.trim());
  if (!r) return null;
  const y = r[3] ? (r[3].length === 2 ? 2000 + Number(r[3]) : Number(r[3])) : today().getFullYear();
  const d = new Date(y, Number(r[2]) - 1, Number(r[1]));
  if (d.getDate() !== Number(r[1]) || d.getMonth() !== Number(r[2]) - 1) return null;
  return dayKey(d);
}
