import { useEffect, useSyncExternalStore } from 'react';

/**
 * Le sottoschede di una pagina del proprietario: la pagina le elenca, il menu a sinistra le mostra sotto il suo nome
 * (e sul telefono anche una fila di schede in cima alla pagina) e la pagina mostra solo quella scelta.
 */
export type SectionItem = { id: string; title: string };
type PageSections = { items: SectionItem[]; open: string };

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

/** Le sottoschede della pagina e quella aperta, per il menu. */
export function usePageSections(page: string): PageSections {
  return useSyncExternalStore(subscribe, () => pages[page] ?? NONE);
}

export function openSection(page: string, id: string) {
  const p = pages[page];
  if (p && p.open !== id) change(page, { ...p, open: id });
}

/**
 * La pagina dichiara le sue sottoschede e riceve quella da mostrare. Se quella aperta sparisce (per esempio cambiando
 * piano) si apre la prima.
 */
export function useSections(page: string, items: SectionItem[]): string {
  const key = items.map((x) => `${x.id}\u0000${x.title}`).join('\u0001');
  useEffect(() => {
    const p = pages[page];
    const open = p && items.some((x) => x.id === p.open) ? p.open : (items[0]?.id ?? '');
    change(page, { items, open });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, key]);
  const p = usePageSections(page);
  return items.some((x) => x.id === p.open) ? p.open : (items[0]?.id ?? '');
}

/**
 * Il menu a sinistra sul telefono: chiuso, si apre con il tasto ☰ nella fascia in alto. `enabled` vale solo dove
 * il menu è a scomparsa (proprietario su schermo stretto); sul computer resta sempre aperto.
 */
type Drawer = { enabled: boolean; open: boolean };
let drawer: Drawer = { enabled: false, open: false };

function setDrawer(next: Drawer) {
  if (next.enabled === drawer.enabled && next.open === drawer.open) return;
  drawer = next;
  listeners.forEach((l) => l());
}

export function useDrawer(): Drawer {
  return useSyncExternalStore(subscribe, () => drawer);
}

export const openDrawer = () => setDrawer({ ...drawer, open: true });
export const closeDrawer = () => setDrawer({ ...drawer, open: false });
export const enableDrawer = (enabled: boolean) => setDrawer({ enabled, open: enabled && drawer.open });
