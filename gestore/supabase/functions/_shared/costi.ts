// Quanto paga un centro in un mese, e fino a quando vale la sua licenza. Solo calcoli, senza database:
// le funzioni passano i dati e le prove li controllano.

export type Piano = 'base' | 'professional' | 'pro';
/** Come paga il centro: canone + quota per prenotazione, oppure una cifra fissa al mese. */
export type Formula = 'consumo' | 'fisso';
/** pacchetti_bp: la quota sul prezzo dei pacchetti attivati, in centesimi di punto (100 = 1%). */
export type Prezzi = Record<Piano, { canone_cents: number; tariffa_cents: number; fisso_cents: number; pacchetti_bp: number }>;
export type Cambio = { piano: Piano; dal: string; formula?: Formula };

const pad = (n: number) => String(n).padStart(2, '0');

/** I giorni del mese AAAA-MM, come AAAA-MM-GG. */
export function giorniDelMese(mese: string) {
  const [y, m] = mese.split('-').map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${mese}-${pad(i + 1)}`);
}

/** Piano e formula di un giorno: l'ultimo cambio con data non successiva (i cambi vanno in ordine). */
export function pianoDel(giorno: string, cambi: Cambio[], attuale: Piano, formula: Formula = 'consumo'): { piano: Piano; formula: Formula } {
  let c: Cambio | null = null;
  for (const x of cambi) if (x.dal <= giorno) c = x;
  c ??= cambi[0] ?? null;
  return c ? { piano: c.piano, formula: c.formula ?? 'consumo' } : { piano: attuale, formula };
}

export type Conto = { canone_cents: number; prenotazioni: number; quote_cents: number; pacchetti_cents: number; importo_cents: number };

/**
 * Canone e quote di un mese. Il canone si divide a giorni fra i piani avuti nel mese, contando solo dal giorno
 * di registrazione; ogni prenotazione paga la quota del piano del suo giorno, e ogni pacchetto attivato una
 * percentuale del suo prezzo. Nei giorni a prezzo fisso il canone è il fisso del piano e non ci sono quote.
 * I prezzi fatti apposta per il centro (non null) valgono al posto di quelli del piano.
 */
export function contoDelMese(a: {
  mese: string;
  dal: string;
  cambi: Cambio[];
  attuale: Piano;
  formula?: Formula;
  prezzi: Prezzi;
  canone: number | null;
  tariffa: number | null;
  fisso?: number | null;
  prenotazioni: Record<string, number>;
  /** Prezzo dei pacchetti attivati ogni giorno, in centesimi. */
  pacchetti?: Record<string, number>;
}): Conto {
  const giorni = giorniDelMese(a.mese);
  let canone = 0;
  let quote = 0;
  let pacchetti = 0;
  let n = 0;
  for (const g of giorni) {
    const d = pianoDel(g, a.cambi, a.attuale, a.formula);
    const p = a.prezzi[d.piano];
    const fisso = d.formula === 'fisso';
    if (g >= a.dal) canone += (fisso ? (a.fisso ?? p.fisso_cents) : (a.canone ?? p.canone_cents)) / giorni.length;
    const k = a.prenotazioni[g] ?? 0;
    n += k;
    if (fisso) continue;
    quote += k * (a.tariffa ?? p.tariffa_cents);
    pacchetti += ((a.pacchetti?.[g] ?? 0) * p.pacchetti_bp) / 10000;
  }
  const c = Math.round(canone);
  const pk = Math.round(pacchetti);
  return { canone_cents: c, prenotazioni: n, quote_cents: quote, pacchetti_cents: pk, importo_cents: c + quote + pk };
}

/** Giorni per pagare dopo l'addebito del mese: poi la licenza scade e l'app del centro si blocca. */
export const giorniPerPagare = () => Number(Deno.env.get('GIORNI_PER_PAGARE') || 3);

/** Il giorno `giorni` del mese dopo quello di `oggi`: fin lì vale la licenza, poi l'app si blocca. */
export function scadenzaLicenza(oggi: string, giorni: number) {
  const [y, m] = oggi.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, Math.max(1, giorni)));
  return d.toISOString().slice(0, 10);
}

/** I piani dal più piccolo al più grande. */
export const PIANI_IN_ORDINE: Piano[] = ['base', 'professional', 'pro'];

/** Il piano `a` è più piccolo di `b`. */
export const piuPiccolo = (a: Piano, b: Piano) => PIANI_IN_ORDINE.indexOf(a) < PIANI_IN_ORDINE.indexOf(b);

/** Il primo giorno del mese dopo quello di `giorno`: da lì parte un piano più piccolo. */
export function primoDelMeseDopo(giorno: string) {
  const [y, m] = giorno.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

/** L'ultimo giorno del mese dopo quello di `giorno`: la fine del servizio con un mese di preavviso. */
export function fineDelMeseDopo(giorno: string) {
  const [y, m] = giorno.split('-').map(Number);
  return new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
}

/** Più `giorni` giorni a una data AAAA-MM-GG. */
export function piuGiorni(giorno: string, giorni: number) {
  const [y, m, d] = giorno.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + giorni)).toISOString().slice(0, 10);
}

/** IBAN scritto bene (senza spazi, maiuscolo) e con le cifre di controllo giuste. */
export function ibanValido(iban: string) {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const n = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (l) => String(l.charCodeAt(0) - 55));
  let r = 0;
  for (const d of n) r = (r * 10 + Number(d)) % 97;
  return r === 1;
}

/** La causale del bonifico: il codice del centro e il mese. */
export const causale = (codice: string, mese: string) => `${codice} ${mese}`;

// ---------------------------------------------------------------------------------------------------------
// Riconoscere i bonifici
// ---------------------------------------------------------------------------------------------------------

export type Accredito = { id: string; importo_cents: number; iban: string; nome: string; causale: string };
export type CentroDaPagare = { id: string; codice: string; iban: string };
export type Aperto = { id: string; centro: string; mese: string; importo_cents: number };
export type Abbinamento = { centro: string | null; addebiti: string[] };

const pulito = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Di quale centro è un bonifico e quali addebiti paga. Il centro si riconosce dal codice nella causale (anche
 * scritto senza trattino) o dall'IBAN da cui parte. Se la causale nomina un mese da pagare si paga quello,
 * altrimenti i mesi più vecchi finché l'importo basta. Importo che non copre nemmeno un mese: centro
 * riconosciuto, niente pagato, lo guardi tu dal pannello.
 */
export function abbina(a: Accredito, centri: CentroDaPagare[], aperti: Aperto[]): Abbinamento {
  const testo = pulito(a.causale + ' ' + a.nome);
  const iban = pulito(a.iban);
  const c =
    centri.find((x) => testo.includes(pulito(x.codice))) ??
    (iban ? centri.find((x) => x.iban && pulito(x.iban) === iban) : undefined);
  if (!c) return { centro: null, addebiti: [] };
  const suoi = aperti.filter((x) => x.centro === c.id).sort((x, y) => x.mese.localeCompare(y.mese));
  const scritto = suoi.find((x) => testo.includes(pulito(x.mese)) && x.importo_cents <= a.importo_cents);
  if (scritto) return { centro: c.id, addebiti: [scritto.id] };
  const pagati: string[] = [];
  let resto = a.importo_cents;
  for (const x of suoi) {
    if (x.importo_cents > resto) break;
    pagati.push(x.id);
    resto -= x.importo_cents;
  }
  return { centro: c.id, addebiti: pagati };
}
