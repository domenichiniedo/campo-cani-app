// Invia a Fatture in Cloud le fatture "da inviare" e, se attivo, le trasmette allo SDI.
// Gira su Supabase (Edge Function), mai nell'app: usa il token di Fatture in Cloud e la
// chiave di servizio, che restano nei Secrets del progetto.
//
// La chiamano:
// - il Database Webhook su "insert" in invoices, con l'intestazione x-webhook-secret;
// - il proprietario dall'app ("Invia ora"), con il suo accesso.
//
// Secrets da impostare (vedi README):
//   FIC_ACCESS_TOKEN         token personale di Fatture in Cloud
//   FIC_SEND_TO_SDI          "si" per trasmettere davvero allo SDI; altrimenti solo prova
//   WEBHOOK_SECRET           una parola segreta a tua scelta, uguale a quella del webhook
// Facoltativi: se mancano, la funzione li ricava da sola.
//   FIC_COMPANY_ID           id dell'azienda (serve solo se il token ne vede più di una)
//   FIC_VAT_ID               id dell'aliquota (altrimenti quella del regime scelto nell'app)
//   FIC_PAYMENT_ACCOUNT_ID   id del conto su cui arrivano i pagamenti online

import { admin, allowed, env, type Doc } from '../_shared/common.ts';

const FIC = 'https://api-v2.fattureincloud.it';

type Invoice = Doc;

async function fic(path: string, body?: unknown) {
  const res = await fetch(`${FIC}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${env('FIC_ACCESS_TOKEN')}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = json?.error;
    const detail = e?.validation_result ? JSON.stringify(e.validation_result) : (e?.message ?? res.statusText);
    throw new Error(`Fatture in Cloud ${res.status}: ${detail}`);
  }
  return json;
}

/** Il documento come lo vuole Fatture in Cloud: prezzo IVA inclusa, già pagato. */
export function ficDocument(inv: Invoice, vatId: number, paymentAccountId?: number) {
  const code = (inv.buyer_tax_code ?? '').toUpperCase();
  const isVat = /^[0-9]{11}$/.test(code);
  const euros = inv.total_cents / 100;
  return {
    data: {
      type: 'invoice',
      date: inv.issued_on,
      entity: {
        name: inv.buyer_name,
        type: isVat ? 'company' : 'person',
        ...(isVat ? { vat_number: code } : { tax_code: code }),
        address_street: inv.buyer_street,
        address_postal_code: inv.buyer_zip,
        address_city: inv.buyer_city,
        address_province: inv.buyer_province,
        country: 'Italia',
      },
      use_gross_prices: true,
      e_invoice: true,
      // MP08: carta di pagamento.
      ei_data: { payment_method: 'MP08' },
      items_list: [{ name: inv.description, qty: 1, gross_price: euros, vat: { id: vatId } }],
      payments_list: [
        {
          amount: euros,
          due_date: inv.issued_on,
          paid_date: inv.issued_on,
          status: 'paid',
          ...(paymentAccountId ? { payment_account: { id: paymentAccountId } } : {}),
        },
      ],
    },
    options: { fix_payments: true },
  };
}

type Setup = { company: string; vatId: number; paymentAccountId?: number };

/** Azienda e aliquota: dai secrets se ci sono, altrimenti dall'account Fatture in Cloud. */
async function setup(): Promise<Setup> {
  let company = env('FIC_COMPANY_ID');
  if (!company) {
    const list = ((await fic('/user/companies')).data?.companies ?? []) as { id: number; name: string }[];
    if (list.length !== 1) {
      throw new Error(`Il token vede ${list.length} aziende: imposta il secret FIC_COMPANY_ID (${list.map((c) => `${c.id} ${c.name}`).join(', ')})`);
    }
    company = String(list[0].id);
  }
  let vatId = Number(env('FIC_VAT_ID'));
  if (!vatId) {
    const { data: cfg } = await admin.from('invoice_settings').select('tax_regime, vat_rate').eq('id', 1).single();
    const forfettario = cfg?.tax_regime === 'RF19';
    const rate = forfettario ? 0 : Number(cfg?.vat_rate ?? 22);
    const types = ((await fic(`/c/${company}/info/vat_types`)).data ?? []) as { id: number; value: number; ei_type?: string; is_disabled?: boolean }[];
    const match = types.find((t) => !t.is_disabled && Number(t.value) === rate && (!forfettario || t.ei_type === '2.2' || t.ei_type === 'N2.2'));
    if (!match) throw new Error(`Su Fatture in Cloud non trovo l'aliquota ${forfettario ? '0% N2.2' : `${rate}%`}: imposta il secret FIC_VAT_ID`);
    vatId = match.id;
  }
  return { company, vatId, paymentAccountId: Number(env('FIC_PAYMENT_ACCOUNT_ID')) || undefined };
}

async function sendOne(inv: Invoice, sendForReal: boolean, s: Setup) {
  let ref = inv.provider_ref;
  if (!ref) {
    const created = await fic(`/c/${s.company}/issued_documents`, ficDocument(inv, s.vatId, s.paymentAccountId));
    ref = String(created.data.id);
    // Salviamo subito l'id: se l'invio dopo fallisce, non si crea un doppione.
    await admin.from('invoices').update({ provider_ref: ref, number: created.data.number, year: created.data.year }).eq('id', inv.id);
  }
  await fic(`/c/${s.company}/issued_documents/${ref}/e_invoice/send`, { data: {}, options: { dry_run: !sendForReal } });
  if (sendForReal) {
    await admin.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString(), error: null }).eq('id', inv.id);
  }
}

Deno.serve(async (req) => {
  if (!(await allowed(req))) return new Response('Non autorizzato', { status: 401 });
  if (!env('FIC_ACCESS_TOKEN')) return Response.json({ error: 'Manca il secret FIC_ACCESS_TOKEN' }, { status: 500 });
  const sendForReal = env('FIC_SEND_TO_SDI').toLowerCase() === 'si';
  const { data, error } = await admin.from('invoices').select('*').eq('kind', 'invoice').eq('status', 'pending').order('created_at').limit(20);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const pending = (data ?? []) as Invoice[];
  if (!pending.length) return Response.json({ sendForReal, done: 0, failed: 0 });
  let s: Setup;
  try {
    s = await setup();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
  const done: string[] = [], failed: string[] = [];
  for (const inv of pending) {
    try {
      await sendOne(inv, sendForReal, s);
      done.push(inv.id);
    } catch (e) {
      failed.push(inv.id);
      await admin.from('invoices').update({ status: 'error', error: String((e as Error).message ?? e).slice(0, 500) }).eq('id', inv.id);
    }
  }
  return Response.json({ sendForReal, done: done.length, failed: failed.length });
});
