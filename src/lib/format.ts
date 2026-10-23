import { lang, locale, type Lang } from '@/lib/i18n';

export const STEP = 30;

const NAMES: Record<Lang, { short: string[]; days: string[]; months: string[] }> = {
  it: {
    short: ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'],
    days: ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'],
    months: ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'],
  },
  en: {
    short: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  },
  de: {
    short: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
    days: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
    months: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
  },
  fr: {
    short: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'],
    days: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
    months: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  },
  es: {
    short: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
    days: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
    months: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  },
};
const names = () => NAMES[lang()];

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

export const weekdayShort = (d: Date) => names().short[d.getDay()];
export const monthShort = (d: Date) => names().months[d.getMonth()].slice(0, 3);
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "martedì 21 ottobre", nella lingua scelta. */
export const longDay = (k: string) => {
  const d = fromKey(k);
  const n = names(), day = n.days[d.getDay()], month = n.months[d.getMonth()];
  switch (lang()) {
    case 'en':
      return `${day} ${d.getDate()} ${month}`;
    case 'de':
      return `${day}, ${d.getDate()}. ${month}`;
    case 'es':
      return `${day} ${d.getDate()} de ${month}`;
    default:
      return `${day} ${d.getDate()} ${month}`;
  }
};
/** Nome del mese ("ottobre"), nella lingua scelta. */
export const monthName = (m: number) => names().months[m];
export const euro = (cents: number) =>
  `€ ${(cents / 100).toLocaleString(locale(), { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const shortDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(locale()) : '');
export const timeOf = (iso: string) => {
  const d = new Date(iso);
  return hm(d.getHours() * 60 + d.getMinutes());
};
