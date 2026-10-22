import { useColorScheme } from 'react-native';

import { useSession } from '@/lib/session';

// Un colore per ogni tipo di lezione, nell'ordine in cui le lezioni sono in Impostazioni.
// bg è il fondo del blocco, bar la striscia a sinistra (e il pallino), text il testo.

export type LessonColor = { bg: string; bar: string; text: string };

const LIGHT: LessonColor[] = [
  { bg: '#e3eefb', bar: '#2f6fb5', text: '#173a63' },
  { bg: '#fbeadf', bar: '#c2611f', text: '#5c2b0b' },
  { bg: '#f1e6f7', bar: '#8a4bb0', text: '#3f1d55' },
  { bg: '#e2f4f4', bar: '#1f8a8a', text: '#0d3d3d' },
  { bg: '#fbf3d8', bar: '#b38a12', text: '#4f3c06' },
  { bg: '#fbe3e8', bar: '#c03a5a', text: '#5a1324' },
];

const DARK: LessonColor[] = [
  { bg: '#1a2a3d', bar: '#6ea8e8', text: '#dbe8f7' },
  { bg: '#3a2618', bar: '#e89558', text: '#f7e2d2' },
  { bg: '#2e2138', bar: '#c08ae0', text: '#eddcf7' },
  { bg: '#16302f', bar: '#5cc6c6', text: '#d4f0f0' },
  { bg: '#352d14', bar: '#e0bd4e', text: '#f5ebc9' },
  { bg: '#3a1a22', bar: '#e8798f', text: '#f7d9df' },
];

const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

/** Colore di un tipo di lezione (anche disattivata: allora dipende dal suo id). */
export function useLessonColors() {
  const { lessonTypes } = useSession();
  const palette = useColorScheme() === 'dark' ? DARK : LIGHT;
  return (id: string | null | undefined): LessonColor => {
    const i = lessonTypes.findIndex((t) => t.id === id);
    return palette[(i >= 0 ? i : hash(id ?? '')) % palette.length];
  };
}
