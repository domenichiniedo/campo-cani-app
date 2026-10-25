// "Paga ora": il centro paga il conto del mese con un bonifico istantaneo già compilato (importo, il tuo IBAN, la
// causale) che conferma nella sua banca. È un pagamento disposto con Enable Banking (PIS): la banca chiede sempre
// la conferma del centro, come vuole la PSD2. Poi controlla-bonifici trova il bonifico e rinnova la licenza.
// Si accende con PAGA_ORA=1 e serve l'abilitazione di Enable Banking ai pagamenti (in produzione la danno
// solo con un contratto: vedi gestore/README.md).
import { enableBanking } from './banca.ts';

const env = (k: string) => Deno.env.get(k) ?? '';

export const pagaOraSpento = () => env('PAGA_ORA') !== '1' || !env('ENABLE_BANKING_APP_ID') || !env('ENABLE_BANKING_CHIAVE');

// deno-lint-ignore no-explicit-any
type Any = any;

/** Il tipo di bonifico da chiedere alla banca: l'istantaneo se c'è, se no il SEPA normale; null se non paga in euro. */
export function tipoBonifico(pagamenti: Any[] | undefined): string | null {
  const euro = (pagamenti ?? []).filter((p) => (p.currencies ?? ['EUR']).includes('EUR') && !String(p.payment_type).startsWith('BULK'));
  const tipi = euro.map((p) => String(p.payment_type));
  return tipi.find((t) => /INST/.test(t)) ?? tipi.find((t) => t === 'SEPA') ?? null;
}

let cache: { quando: number; banche: { nome: string; paese: string; tipo: string }[] } | null = null;

/** Le banche italiane da cui si può disporre un bonifico in euro (tenute un'ora). */
export async function bancheConPagamento() {
  if (cache && Date.now() - cache.quando < 3600_000) return cache.banche;
  const r = await enableBanking('GET', '/aspsps?country=IT&service=PIS');
  const banche = ((r.aspsps ?? []) as Any[])
    .map((a) => ({ nome: String(a.name), paese: String(a.country), tipo: tipoBonifico(a.payments) }))
    .filter((a): a is { nome: string; paese: string; tipo: string } => !!a.tipo)
    .sort((a, b) => a.nome.localeCompare(b.nome));
  cache = { quando: Date.now(), banche };
  return banche;
}

/** Gli stati di un pagamento disposto che vogliono dire "partito" e quelli che vogliono dire "non partito". */
export const PARTITO = ['ACCC', 'ACSC', 'ACSP', 'ACWC', 'ACCP'];
export const RIFIUTATO = ['RJCT', 'CANC'];

/**
 * Prepara il bonifico nella banca di chi paga (il centro, o il cliente per una lezione): torna l'id del pagamento
 * e la pagina della banca. Con il conto di chi paga (da_iban) la banca lo trova già scelto: alcune banche lo vogliono.
 */
export async function disponi(a: {
  banca: { nome: string; paese: string };
  tipo: string;
  importo_cents: number;
  iban: string;
  intestatario: string;
  causale: string;
  state: string;
  ritorno: string;
  privato?: boolean;
  da_iban?: string;
}): Promise<{ payment_id: string; url: string }> {
  const r = await enableBanking('POST', '/payments', {
    aspsp: { name: a.banca.nome, country: a.banca.paese },
    payment_type: a.tipo,
    psu_type: a.privato ? 'personal' : 'business',
    language: 'it',
    state: a.state,
    redirect_url: a.ritorno,
    payment_request: {
      ...(a.da_iban ? { debtor_account: { identification: a.da_iban, scheme_name: 'IBAN' } } : {}),
      credit_transfer_transaction: [
        {
          beneficiary: { creditor: { name: a.intestatario }, creditor_account: { identification: a.iban, scheme_name: 'IBAN' } },
          instructed_amount: { amount: (a.importo_cents / 100).toFixed(2), currency: 'EUR' },
          remittance_information: [a.causale],
        },
      ],
    },
  });
  if (!r.url || !r.payment_id) throw new Error('La banca non ha preparato il bonifico.');
  return { payment_id: String(r.payment_id), url: String(r.url) };
}
