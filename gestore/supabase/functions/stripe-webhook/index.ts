// Eventi di Stripe (Developers → Webhooks, con l'indirizzo di questa funzione). Servono:
//   checkout.session.completed  il centro ha firmato il mandato SEPA: parte la preparazione del database
//   invoice.paid                l'addebito del mese è andato a buon fine: si allunga la licenza
//   invoice.payment_failed      l'addebito non è andato: la licenza non si rinnova
// Segreti: STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET (whsec_..., dalla pagina del webhook).

import { allungaLicenza } from '../_shared/addebiti.ts';
import { db, env, json, sveglia, type Centro } from '../_shared/comune.ts';
import { firmaStripe, stripe } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  const payload = await req.text();
  if (!(await firmaStripe(payload, req.headers.get('Stripe-Signature') ?? '', env('STRIPE_WEBHOOK_SECRET')))) {
    return json({ errore: 'Firma di Stripe non valida.' }, 400);
  }
  const evento = JSON.parse(payload);
  const o = evento.data?.object ?? {};

  if (evento.type === 'checkout.session.completed' && o.mode === 'setup' && o.metadata?.centro) {
    const intento = await stripe('GET', `/setup_intents/${o.setup_intent}`);
    const metodo = typeof intento.payment_method === 'string' ? intento.payment_method : intento.payment_method?.id;
    if (!metodo) return json({ errore: 'Mandato senza metodo di pagamento.' }, 400);
    // Il mandato diventa il modo di pagamento predefinito delle fatture del centro.
    await stripe('POST', `/customers/${o.customer}`, { invoice_settings: { default_payment_method: metodo } });
    await db.from('centri').update({ stripe_metodo: metodo }).eq('id', o.metadata.centro);
    await db.from('centri').update({ stato: 'progetto' }).eq('id', o.metadata.centro).eq('stato', 'mandato');
    sveglia();
  }

  if (evento.type === 'invoice.paid' || evento.type === 'invoice.payment_failed') {
    const pagato = evento.type === 'invoice.paid';
    const { data: a } = await db.from('addebiti').update({ stato: pagato ? 'pagato' : 'non_pagato' }).eq('fattura', o.id).select('centro').maybeSingle();
    if (a && pagato) {
      const { data: c } = await db.from('centri').select('*').eq('id', a.centro).single();
      await allungaLicenza(c as Centro);
    }
  }

  return json({ ricevuto: true });
});
