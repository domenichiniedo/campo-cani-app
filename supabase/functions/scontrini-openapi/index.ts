// Scontrini elettronici con un registratore virtuale in cloud (Openapi, servizio IT-receipts):
// trasmette all'Agenzia delle Entrate gli scontrini "da emettere" dei clienti che li hanno
// scelti, quando in Impostazioni il modo dello scontrino è "Registratore in cloud".
//
// La chiamano il Database Webhook su "insert" in invoices e il proprietario ("Invia ora").
// Openapi risponde subito con lo scontrino in lavorazione: alle chiamate successive la
// funzione ne controlla lo stato e, quando è trasmesso, salva il numero del documento.
//
// Secrets (vedi README):
//   OPENAPI_TOKEN      token Openapi con permesso su invoice.openapi.com/IT-receipts
//   OPENAPI_FISCAL_ID  partita IVA configurata su Openapi
//   OPENAPI_LIVE       "si" per trasmettere davvero; altrimenti usa l'ambiente di prova
//   OPENAPI_VAT_CODE   facoltativo: codice IVA da usare (altrimenti l'aliquota scelta nell'app)
//   WEBHOOK_SECRET     come per le fatture

import { admin, allowed, env, type Doc } from '../_shared/common.ts';

const base = () => (env('OPENAPI_LIVE').toLowerCase() === 'si' ? 'https://invoice.openapi.com' : 'https://test.invoice.openapi.com');

async function api(path: string, body?: unknown) {
  const res = await fetch(`${base()}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${env('OPENAPI_TOKEN')}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    throw new Error(`Openapi ${res.status}: ${json?.message || json?.error || res.statusText}`);
  }
  return json.data;
}

/** Lo scontrino come lo vuole Openapi: una riga, prezzo IVA inclusa, pagato con carta. */
export function openapiReceipt(d: Doc, fiscalId: string, vatCode: string) {
  const euros = d.total_cents / 100;
  return {
    fiscal_id: fiscalId,
    items: [{ quantity: 1, description: d.description.slice(0, 100), unit_price: euros, vat_rate_code: vatCode, discount: 0, complimentary: false }],
    invoice_issuing: false,
    cash_payment_amount: 0,
    electronic_payment_amount: euros,
    ticket_restaurant_payment_amount: 0,
    ticket_restaurant_quantity: 0,
    services_uncollected_amount: 0,
    goods_uncollected_amount: 0,
    discount: 0,
  };
}

const vatCodeOf = (d: Doc) => env('OPENAPI_VAT_CODE') || d.nature || String(Number(d.vat_rate));

async function sendOne(d: Doc) {
  if (!d.provider_ref) {
    const r = await api('/IT-receipts', openapiReceipt(d, env('OPENAPI_FISCAL_ID'), vatCodeOf(d)));
    await admin.from('invoices').update({ provider_ref: String(r.id) }).eq('id', d.id);
    d.provider_ref = String(r.id);
  }
  // Openapi lavora in differita: controlliamo lo stato.
  const r = await api(`/IT-receipts/${d.provider_ref}`);
  if (r.status === 'failed') throw new Error(`Openapi: ${r.error_message || r.error_code || 'scontrino rifiutato'}`);
  if ((r.status === 'submitted' || r.status === 'ready') && r.document_number) {
    await admin
      .from('invoices')
      .update({ status: 'sent', sent_at: new Date().toISOString(), receipt_number: r.document_number, error: null })
      .eq('id', d.id);
    return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (!(await allowed(req))) return new Response('Non autorizzato', { status: 401 });
  const { data: cfg } = await admin.from('invoice_settings').select('receipt_mode').eq('id', 1).single();
  if (cfg?.receipt_mode !== 'cloud') return Response.json({ skipped: 'Il modo dello scontrino non è "Registratore in cloud"' });
  for (const k of ['OPENAPI_TOKEN', 'OPENAPI_FISCAL_ID']) {
    if (!env(k)) return Response.json({ error: `Manca il secret ${k}` }, { status: 500 });
  }
  const { data, error } = await admin.from('invoices').select('*').eq('kind', 'receipt').eq('status', 'pending').order('created_at').limit(20);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  let done = 0, waiting = 0, failed = 0;
  for (const d of (data ?? []) as Doc[]) {
    try {
      if (await sendOne(d)) done++;
      else waiting++;
    } catch (e) {
      failed++;
      await admin.from('invoices').update({ status: 'error', error: String((e as Error).message ?? e).slice(0, 500) }).eq('id', d.id);
    }
  }
  return Response.json({ live: base().startsWith('https://invoice'), done, waiting, failed });
});
