// Il cliente paga una lezione dall'app con un bonifico istantaneo sul conto del centro: sceglie la sua banca, scrive
// il suo IBAN e conferma nella banca il bonifico già compilato (pagamento disposto con Enable Banking, come "Paga
// ora"). Quando la banca dice che è partito, la prenotazione si segna pagata da sola nel database del centro: il
// proprietario non deve più toccare "Incassa". Il gestore tiene solo id della prenotazione, importo e stato: niente
// nomi né IBAN dei clienti.

import { enableBanking } from './banca.ts';
import { db, messaggio, type Centro } from './comune.ts';
import { PARTITO, RIFIUTATO } from './paga.ts';
import { lit, managementApi, type Api } from './supabase-api.ts';

// deno-lint-ignore no-explicit-any
type Any = any;

export type PagamentoLezione = {
  id: string;
  centro: string;
  prenotazione: string;
  payment_id: string | null;
  stato: string;
  segnata: boolean;
};

/** Codice corto della prenotazione, come nell'app (src/lib/transfer.ts): il proprietario lo trova nell'estratto conto. */
export const codiceLezione = (id: string) => `K9-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

/** La causale del bonifico di una lezione: codice, cane e giorno (come quella del QR nell'app). */
export function causaleLezione(b: { id: string; day: string; start_min: number }, cane: string) {
  const [y, m, d] = b.day.split('-');
  const h = `${String(Math.floor(b.start_min / 60)).padStart(2, '0')}:${String(b.start_min % 60).padStart(2, '0')}`;
  return `${codiceLezione(b.id)} ${cane} ${d}/${m}/${y} ${h}`.slice(0, 140);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Segna pagata la lezione nel database del centro (solo se è con bonifico e non è già pagata). */
export async function segnaLezione(progetto: string, prenotazione: string, api: Api = managementApi) {
  if (!UUID.test(prenotazione)) throw new Error('Prenotazione non valida.');
  await api('POST', `/projects/${progetto}/database/query`, {
    query: `update public.bookings set paid = true where id = ${lit(prenotazione)} and pay = 'transfer' and not paid`,
  });
}

/** Legge dalla banca com'è andato il bonifico e, se è partito, segna pagata la lezione. Torna lo stato. */
export async function aggiornaLezione(p: PagamentoLezione): Promise<string> {
  if (!p.payment_id) return p.stato;
  const r = await enableBanking('GET', `/payments/${encodeURIComponent(p.payment_id)}`);
  const stato = String(r.status ?? '');
  const errore = String(r.status_reason_information?.status_reason_description ?? '').slice(0, 300);
  let segnata = p.segnata;
  if (PARTITO.includes(stato) && !segnata) {
    const { data: c } = await db.from('centri').select('progetto').eq('id', p.centro).maybeSingle();
    if (c?.progetto) {
      await segnaLezione(c.progetto, p.prenotazione);
      segnata = true;
    }
  }
  await db.from('pagamenti_lezioni').update({ stato, errore, segnata }).eq('id', p.id);
  return stato;
}

/**
 * I bonifici delle lezioni ancora in sospeso degli ultimi 3 giorni (per chi ha chiuso la pagina della banca prima
 * del ritorno): li ricontrolla controlla-bonifici.
 */
export async function controllaLezioni() {
  const da = new Date(Date.now() - 3 * 86400_000).toISOString();
  const { data } = await db.from('pagamenti_lezioni').select('*').eq('segnata', false).gt('creato', da).not('payment_id', 'is', null);
  let segnate = 0;
  for (const p of (data ?? []) as PagamentoLezione[]) {
    if (RIFIUTATO.includes(p.stato)) continue;
    try {
      if (PARTITO.includes(await aggiornaLezione(p))) segnate++;
    } catch (e) {
      console.error(`lezione ${p.prenotazione}: ${messaggio(e)}`);
    }
  }
  return segnate;
}

/** L'utente del centro che chiama (con il suo accesso), o null. */
export async function utente(c: Centro, token: string): Promise<string | null> {
  if (!token || !c.url) return null;
  const u = await fetch(`${c.url}/auth/v1/user`, { headers: { apikey: c.chiave ?? '', Authorization: `Bearer ${token}` } });
  if (!u.ok) return null;
  return ((await u.json()) as Any).id ?? null;
}

/** Una tabella del database del centro letta con l'accesso del cliente (i permessi del centro valgono anche qui). */
export async function leggi(c: Centro, token: string, q: string): Promise<Any[]> {
  const r = await fetch(`${c.url}/rest/v1/${q}`, { headers: { apikey: c.chiave ?? '', Authorization: `Bearer ${token}` } });
  return r.ok ? await r.json() : [];
}
