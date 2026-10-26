import { t } from '@/lib/i18n';
import type { Profile } from '@/lib/types';

const ODD: Record<string, number> = {
  '0': 1, '1': 0, '2': 5, '3': 7, '4': 9, '5': 13, '6': 15, '7': 17, '8': 19, '9': 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
  N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};

const even = (ch: string) => (/\d/.test(ch) ? Number(ch) : ch.charCodeAt(0) - 65);

const normalizeTaxCode = (s: string) => s.replace(/\s/g, '').toUpperCase();

/** Partita IVA italiana: 11 cifre con la cifra di controllo (anche con IT davanti). */
function isValidVat(raw: string): boolean {
  const s = normalizeTaxCode(raw).replace(/^IT/, '');
  if (!/^\d{11}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let n = Number(s[i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return (10 - (sum % 10)) % 10 === Number(s[10]);
}

/** Codice fiscale di persona (16 caratteri, con carattere di controllo) o partita IVA (11 cifre). */
function isValidTaxCode(raw: string): boolean {
  const s = normalizeTaxCode(raw);
  if (/^[A-Z0-9]{16}$/.test(s)) {
    if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(s)) return false;
    let sum = 0;
    for (let i = 0; i < 15; i++) sum += i % 2 === 0 ? ODD[s[i]] : even(s[i]);
    return String.fromCharCode(65 + (sum % 26)) === s[15];
  }
  return isValidVat(s);
}

export type ClientKind = 'persona' | 'societa';

/** I dati per la fattura di un cliente: solo le associazioni e le società la possono chiedere. */
export type BillingDraft = {
  company: string;
  vat: string;
  taxCode: string;
  street: string;
  zip: string;
  city: string;
  province: string;
  sdi: string;
  pec: string;
};

export const emptyBilling: BillingDraft = { company: '', vat: '', taxCode: '', street: '', zip: '', city: '', province: '', sdi: '', pec: '' };

export const billingFromProfile = (p: Profile | null): BillingDraft => ({
  company: p?.company_name ?? '',
  vat: p?.vat_number ?? '',
  taxCode: p?.tax_code ?? '',
  street: p?.billing_street ?? '',
  zip: p?.billing_zip ?? '',
  city: p?.billing_city ?? '',
  province: p?.billing_province ?? '',
  sdi: p?.sdi_code ?? '',
  pec: p?.pec ?? '',
});

/** Messaggio d'errore per il primo dato mancante o sbagliato, oppure null se è tutto a posto. */
export function billingError(b: BillingDraft): string | null {
  if (b.company.trim().length < 2) return t("Scrivi la ragione sociale dell'associazione o della società.");
  if (b.vat.trim() && !isValidVat(b.vat)) return t('La partita IVA non è valida: sono 11 cifre.');
  if (!isValidTaxCode(b.taxCode)) return t('Il codice fiscale non è valido. Controlla le lettere e i numeri.');
  if (!b.street.trim()) return t('Inserisci via e numero civico per la fatturazione.');
  if (!/^\d{5}$/.test(b.zip.trim())) return t('Il CAP deve avere 5 cifre.');
  if (!b.city.trim()) return t('Inserisci il comune per la fatturazione.');
  if (b.province.trim() && !/^[A-Za-z]{2}$/.test(b.province.trim())) return t('La provincia va scritta con la sigla, per esempio BO.');
  if (b.sdi.trim() && !/^[A-Z0-9]{7}$/.test(normalizeTaxCode(b.sdi))) return t('Il codice destinatario ha 7 lettere o cifre.');
  if (b.pec.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.pec.trim())) return t('La PEC non è un indirizzo email valido.');
  return null;
}

/** Colonne del profilo pronte da salvare. */
export const billingColumns = (b: BillingDraft) => ({
  company_name: b.company.trim(),
  vat_number: normalizeTaxCode(b.vat).replace(/^IT/, ''),
  tax_code: normalizeTaxCode(b.taxCode),
  billing_street: b.street.trim(),
  billing_zip: b.zip.trim(),
  billing_city: b.city.trim(),
  billing_province: b.province.trim().toUpperCase(),
  sdi_code: normalizeTaxCode(b.sdi),
  pec: b.pec.trim().toLowerCase(),
});

/**
 * Quello che si salva della scelta persona/società: una persona ha solo lo scontrino; una società la fattura
 * se la chiede, con i suoi dati.
 */
export const docColumns = (kind: ClientKind, wantsInvoice: boolean, b: BillingDraft) =>
  kind === 'societa' && wantsInvoice
    ? { client_kind: kind, doc_pref: 'invoice' as const, ...billingColumns(b) }
    : { client_kind: kind, doc_pref: 'receipt' as const };

/** L'errore dei dati per la fattura, solo se servono. */
export const docError = (kind: ClientKind, wantsInvoice: boolean, b: BillingDraft) => (kind === 'societa' && wantsInvoice ? billingError(b) : null);

const hasBilling = (p: Profile | null) =>
  !!p && !!p.tax_code && !!p.billing_street && !!p.billing_zip && !!p.billing_city;

/** Chi non vuole la fattura non deve dare codice fiscale e indirizzo (come billing_ok nel database). */
export const billingOk = (p: Profile | null) => !!p && (p.doc_pref === 'receipt' || hasBilling(p));

export const billingLine = (p: Pick<Profile, 'billing_street' | 'billing_zip' | 'billing_city' | 'billing_province'>) =>
  [p.billing_street, [p.billing_zip, p.billing_city, p.billing_province && `(${p.billing_province})`].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');

/** Dati per fatturare al centro il canone e le prenotazioni: come li vuole la fattura elettronica. */
export type CentreBilling = {
  /** Persona (nome e cognome, telefono, codice fiscale) o associazione e società (tutti i dati). */
  tipo: 'persona' | 'associazione';
  /** Il telefono del titolare. */
  telefono: string;
  ragione_sociale: string;
  partita_iva: string;
  codice_fiscale: string;
  indirizzo: string;
  cap: string;
  comune: string;
  provincia: string;
  /** Codice destinatario del Sistema di Interscambio (7 caratteri); vuoto se usa la PEC o nessuno dei due. */
  codice_sdi: string;
  pec: string;
};

export const emptyCentreBilling: CentreBilling = {
  tipo: 'persona',
  telefono: '',
  ragione_sociale: '',
  partita_iva: '',
  codice_fiscale: '',
  indirizzo: '',
  cap: '',
  comune: '',
  provincia: '',
  codice_sdi: '',
  pec: '',
};

/** I dati puliti come li salva il gestore: maiuscole dove servono, senza spazi nei codici. */
export const cleanCentreBilling = (raw: CentreBilling): CentreBilling => {
  const b = { ...emptyCentreBilling, ...raw };
  return {
    tipo: b.tipo === 'persona' ? 'persona' : 'associazione',
    telefono: b.telefono.trim(),
    ragione_sociale: b.ragione_sociale.trim(),
    partita_iva: normalizeTaxCode(b.partita_iva).replace(/^IT/, ''),
    codice_fiscale: normalizeTaxCode(b.codice_fiscale),
    indirizzo: b.indirizzo.trim(),
    cap: b.cap.trim(),
    comune: b.comune.trim(),
    provincia: b.provincia.trim().toUpperCase(),
    codice_sdi: normalizeTaxCode(b.codice_sdi),
    pec: b.pec.trim().toLowerCase(),
  };
};

/**
 * Il primo dato per la fattura del centro mancante o sbagliato, oppure null (come il gestore, fatturazione.ts).
 * Con `nuovo` (la registrazione) servono anche i dati obbligatori del tipo; nel pannello solo che siano giusti.
 */
export function centreBillingError(raw: CentreBilling, nuovo = false): string | null {
  const b = cleanCentreBilling(raw);
  const persona = b.tipo === 'persona';
  if (b.ragione_sociale.length < 2) return persona ? t('Scrivi nome e cognome.') : t('Scrivi nome e cognome o la ragione sociale.');
  if (nuovo) {
    if (persona && b.ragione_sociale.split(/\s+/).length < 2) return t('Scrivi nome e cognome.');
    if (!persona && b.ragione_sociale.length < 3) return t("Scrivi la ragione sociale dell'associazione o della società.");
    if (b.telefono.replace(/\D/g, '').length < 6) return t('Scrivi il numero di telefono.');
    if (!b.codice_fiscale) return t('Scrivi il codice fiscale.');
    if (!persona && (!b.indirizzo || !b.cap || !b.comune || !b.provincia)) return t('Scrivi la sede: via e numero, CAP, comune e provincia.');
  }
  if (b.telefono && b.telefono.replace(/\D/g, '').length < 6) return t('Scrivi il numero di telefono.');
  if (b.partita_iva && !isValidVat(b.partita_iva)) return t('La partita IVA non è valida: sono 11 cifre.');
  if (b.codice_fiscale && !isValidTaxCode(b.codice_fiscale)) return t('Il codice fiscale non è valido. Controlla le lettere e i numeri.');
  if (persona && /^\d{11}$/.test(b.codice_fiscale)) return t('Il codice fiscale di una persona ha 16 lettere e cifre.');
  if (b.cap && !/^\d{5}$/.test(b.cap)) return t('Il CAP deve avere 5 cifre.');
  if (b.provincia && !/^[A-Z]{2}$/.test(b.provincia)) return t('La provincia va scritta con la sigla, per esempio BO.');
  if (b.codice_sdi && !/^[A-Z0-9]{7}$/.test(b.codice_sdi)) return t('Il codice destinatario ha 7 lettere o cifre.');
  if (b.pec && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.pec)) return t('La PEC non è un indirizzo email valido.');
  return null;
}

/** I dati per la fattura del centro in poche righe, per il pannello del gestore. */
export const centreBillingLines = (b: CentreBilling) =>
  [
    b.tipo === 'persona' ? `${b.ragione_sociale} (persona)` : b.ragione_sociale,
    b.telefono && `Tel. ${b.telefono}`,
    [b.partita_iva && `P.IVA ${b.partita_iva}`, b.codice_fiscale && b.codice_fiscale !== b.partita_iva && `CF ${b.codice_fiscale}`].filter(Boolean).join(' · '),
    [b.indirizzo, [b.cap, b.comune, b.provincia && `(${b.provincia})`].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    [b.codice_sdi && `SDI ${b.codice_sdi}`, b.pec && `PEC ${b.pec}`].filter(Boolean).join(' · '),
  ].filter(Boolean);
