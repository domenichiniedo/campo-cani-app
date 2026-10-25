import { useEffect, useSyncExternalStore } from 'react';

import { ownerOnly } from '@/lib/edition';

/**
 * I paragrafi di una pagina nel menu laterale del programma per Windows: la pagina li elenca, il menu li mostra
 * sotto il suo nome e la pagina apre solo quello scelto. Sul telefono la pagina resta tutta di seguito.
 */
export type SectionItem = { id: string; title: string };
type PageSections = { items: SectionItem[]; open: string };

export const sectionMenu = ownerOnly;

let pages: Record<string, PageSections> = {};
const listeners = new Set<() => void>();

function change(page: string, next: PageSections) {
  pages = { ...pages, [page]: next };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const NONE: PageSections = { items: [], open: '' };

/** I paragrafi della pagina e quello aperto, per il menu laterale. */
export function usePageSections(page: string): PageSections {
  return useSyncExternalStore(subscribe, () => pages[page] ?? NONE);
}

export function openSection(page: string, id: string) {
  const p = pages[page];
  if (p && p.open !== id) change(page, { ...p, open: id });
}

/**
 * La pagina dichiara i suoi paragrafi e riceve quello da mostrare: null quando si vedono tutti (sul telefono).
 * Se il paragrafo aperto sparisce (per esempio cambiando piano) si apre il primo.
 */
export function useSections(page: string, items: SectionItem[]): string | null {
  const key = items.map((x) => `${x.id}\u0000${x.title}`).join('\u0001');
  useEffect(() => {
    if (!sectionMenu) return;
    const p = pages[page];
    const open = p && items.some((x) => x.id === p.open) ? p.open : (items[0]?.id ?? '');
    change(page, { items, open });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, key]);
  const p = usePageSections(page);
  if (!sectionMenu) return null;
  return items.some((x) => x.id === p.open) ? p.open : (items[0]?.id ?? '');
}
