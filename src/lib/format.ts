export const STEP = 30;

const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const WEEKDAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Minuti dalla mezzanotte → "09:30". */
export const hm = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

/** "09:30" → 570, oppure null se il formato non è valido. */
export function parseHm(s: string): number | null {
  const r = /^(\d{1,2})[:.](\d{2})$/.exec(s.trim());
  if (!r) return null;
  const h = +r[1], m = +r[2];
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

export const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
/** Data locale → "2026-10-21". */
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const slotDate = (k: string, min: number) => {
  const d = fromKey(k);
  d.setMinutes(min);
  return d;
};
export const isDayKey = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(fromKey(s).getTime());

export const weekdayShort = (d: Date) => WEEKDAYS_SHORT[d.getDay()];
export const monthShort = (d: Date) => MONTHS[d.getMonth()].slice(0, 3);
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "martedì 21 ottobre" */
export const longDay = (k: string) => {
  const d = fromKey(k);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
export const euro = (cents: number) =>
  `€ ${(cents / 100).toLocaleString('it-IT', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const shortDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('it-IT') : '');
export const timeOf = (iso: string) => {
  const d = new Date(iso);
  return hm(d.getHours() * 60 + d.getMinutes());
};
