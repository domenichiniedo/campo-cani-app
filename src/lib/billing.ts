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

export type BillingDraft = { taxCode: string; street: string; zip: string; city: string; province: string };

export const emptyBilling: BillingDraft = { taxCode: '', street: '', zip: '', city: '', province: '' };

export const billingFromProfile = (p: Profile | null): BillingDraft => ({
  taxCode: p?.tax_code ?? '',
  street: p?.billing_street ?? '',
  zip: p?.billing_zip ?? '',
  city: p?.billing_city ?? '',
  province: p?.billing_province ?? '',
});

/** Messaggio d'errore per il primo dato mancante o sbagliato, oppure null se è tutto a posto. */
export function billingError(b: BillingDraft): string | null {
  if (!isValidTaxCode(b.taxCode)) return t('Il codice fiscale non è valido. Controlla le lettere e i numeri.');
  if (!b.street.trim()) return t('Inserisci via e numero civico per la fatturazione.');
  if (!/^\d{5}$/.test(b.zip.trim())) return t('Il CAP deve avere 5 cifre.');
  if (!b.city.trim()) return t('Inserisci il comune per la fatturazione.');
  if (b.province.trim() && !/^[A-Za-z]{2}$/.test(b.province.trim())) return t('La provincia va scritta con la sigla, per esempio BO.');
  return null;
}

/** Colonne del profilo pronte da salvare. */
export const billingColumns = (b: BillingDraft) => ({
  tax_code: normalizeTaxCode(b.taxCode),
  billing_street: b.street.trim(),
  billing_zip: b.zip.trim(),
  billing_city: b.city.trim(),
  billing_province: b.province.trim().toUpperCase(),
});

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

/** Il primo dato per la fattura del centro mancante o sbagliato, oppure null (come il gestore, fatturazione.ts). */
export function centreBillingError(raw: CentreBilling): string | null {
  const b = cleanCentreBilling(raw);
  // Basta il nome: anche un privato che organizza le lezioni apre un centro. Il resto, se c'è, dev'essere giusto.
  if (b.ragione_sociale.length < 2) return t('Scrivi nome e cognome o la ragione sociale.');
  if (b.partita_iva && !isValidVat(b.partita_iva)) return t('La partita IVA non è valida: sono 11 cifre.');
  if (b.codice_fiscale && !isValidTaxCode(b.codice_fiscale)) return t('Il codice fiscale non è valido. Controlla le lettere e i numeri.');
  if (b.cap && !/^\d{5}$/.test(b.cap)) return t('Il CAP deve avere 5 cifre.');
  if (b.provincia && !/^[A-Z]{2}$/.test(b.provincia)) return t('La provincia va scritta con la sigla, per esempio BO.');
  if (b.codice_sdi && !/^[A-Z0-9]{7}$/.test(b.codice_sdi)) return t('Il codice destinatario ha 7 lettere o cifre.');
  if (b.pec && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.pec)) return t('La PEC non è un indirizzo email valido.');
  return null;
}

/** I dati per la fattura del centro in poche righe, per il pannello del gestore. */
export const centreBillingLines = (b: CentreBilling) =>
  [
    b.ragione_sociale,
    [b.partita_iva && `P.IVA ${b.partita_iva}`, b.codice_fiscale && b.codice_fiscale !== b.partita_iva && `CF ${b.codice_fiscale}`].filter(Boolean).join(' · '),
    [b.indirizzo, [b.cap, b.comune, b.provincia && `(${b.provincia})`].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    [b.codice_sdi && `SDI ${b.codice_sdi}`, b.pec && `PEC ${b.pec}`].filter(Boolean).join(' · '),
  ].filter(Boolean);
