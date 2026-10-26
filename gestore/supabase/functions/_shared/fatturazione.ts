// I dati per fatturare a un centro, come li chiede l'app alla registrazione (src/lib/billing.ts, stessi controlli).
// Solo calcoli, senza database: le prove sono in gestore_test.ts.

export type Fatturazione = {
  /** Persona (nome e cognome, telefono, codice fiscale) o associazione e società (tutti i dati). */
  tipo: 'persona' | 'associazione';
  telefono: string;
  ragione_sociale: string;
  partita_iva: string;
  codice_fiscale: string;
  indirizzo: string;
  cap: string;
  comune: string;
  provincia: string;
  codice_sdi: string;
  pec: string;
};

export const CAMPI_FATTURA = ['tipo', 'telefono', 'ragione_sociale', 'partita_iva', 'codice_fiscale', 'indirizzo', 'cap', 'comune', 'provincia', 'codice_sdi', 'pec'] as const;

const DISPARI: Record<string, number> = {
  '0': 1, '1': 0, '2': 5, '3': 7, '4': 9, '5': 13, '6': 15, '7': 17, '8': 19, '9': 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
  N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};
const pari = (c: string) => (/\d/.test(c) ? Number(c) : c.charCodeAt(0) - 65);

/** Partita IVA: 11 cifre con la cifra di controllo. */
export function partitaIvaValida(s: string) {
  if (!/^\d{11}$/.test(s)) return false;
  let somma = 0;
  for (let i = 0; i < 10; i++) {
    let n = Number(s[i]);
    if (i % 2 === 1) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
    somma += n;
  }
  return (10 - (somma % 10)) % 10 === Number(s[10]);
}

/** Codice fiscale di persona (16 caratteri) o di società e associazioni (11 cifre). */
export function codiceFiscaleValido(s: string) {
  if (/^\d{11}$/.test(s)) return partitaIvaValida(s);
  if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(s)) return false;
  let somma = 0;
  for (let i = 0; i < 15; i++) somma += i % 2 === 0 ? DISPARI[s[i]] : pari(s[i]);
  return String.fromCharCode(65 + (somma % 26)) === s[15];
}

const codice = (v: unknown) => String(v ?? '').replace(/\s/g, '').toUpperCase();
const testo = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

/**
 * I dati puliti e controllati, o l'errore da mostrare nell'app. Con `nuovo` (la registrazione dall'app) servono
 * anche i dati obbligatori del tipo scelto; nel pannello si controlla solo che quelli scritti siano giusti, così
 * si possono correggere anche i centri registrati prima. Le app vecchie non mandano il tipo: per loro basta il nome.
 */
export function leggiFatturazione(v: unknown, nuovo = false): { dati: Fatturazione } | { errore: string } {
  const f = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const dati: Fatturazione = {
    tipo: f.tipo === 'persona' ? 'persona' : 'associazione',
    telefono: testo(f.telefono, 30),
    ragione_sociale: testo(f.ragione_sociale, 120),
    partita_iva: codice(f.partita_iva).replace(/^IT/, ''),
    codice_fiscale: codice(f.codice_fiscale),
    indirizzo: testo(f.indirizzo, 120),
    cap: testo(f.cap, 5),
    comune: testo(f.comune, 80),
    provincia: testo(f.provincia, 2).toUpperCase(),
    codice_sdi: codice(f.codice_sdi),
    pec: testo(f.pec, 120).toLowerCase(),
  };
  const persona = dati.tipo === 'persona';
  if (dati.ragione_sociale.length < 2) return { errore: persona ? 'Scrivi nome e cognome.' : 'Scrivi nome e cognome o la ragione sociale.' };
  if (nuovo && f.tipo !== undefined) {
    if (persona && dati.ragione_sociale.split(/\s+/).length < 2) return { errore: 'Scrivi nome e cognome.' };
    if (!persona && dati.ragione_sociale.length < 3) return { errore: "Scrivi la ragione sociale dell'associazione o della società." };
    if (dati.telefono.replace(/\D/g, '').length < 6) return { errore: 'Scrivi il numero di telefono.' };
    if (!dati.codice_fiscale) return { errore: 'Scrivi il codice fiscale.' };
    if (!persona && (!dati.indirizzo || !dati.cap || !dati.comune || !dati.provincia)) {
      return { errore: 'Scrivi la sede: via e numero, CAP, comune e provincia.' };
    }
  }
  if (dati.telefono && dati.telefono.replace(/\D/g, '').length < 6) return { errore: 'Scrivi il numero di telefono.' };
  if (dati.partita_iva && !partitaIvaValida(dati.partita_iva)) return { errore: 'La partita IVA non è valida: sono 11 cifre.' };
  if (dati.codice_fiscale && !codiceFiscaleValido(dati.codice_fiscale)) {
    return { errore: 'Il codice fiscale non è valido. Controlla le lettere e i numeri.' };
  }
  if (persona && /^\d{11}$/.test(dati.codice_fiscale)) return { errore: 'Il codice fiscale di una persona ha 16 lettere e cifre.' };
  if (dati.cap && !/^\d{5}$/.test(dati.cap)) return { errore: 'Il CAP deve avere 5 cifre.' };
  if (dati.provincia && !/^[A-Z]{2}$/.test(dati.provincia)) return { errore: 'La provincia va scritta con la sigla, per esempio BO.' };
  if (dati.codice_sdi && !/^[A-Z0-9]{7}$/.test(dati.codice_sdi)) return { errore: 'Il codice destinatario ha 7 lettere o cifre.' };
  if (dati.pec && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dati.pec)) return { errore: 'La PEC non è un indirizzo email valido.' };
  return { dati };
}
