// Il primo del mese conta le prenotazioni del mese prima di ogni centro e le addebita con Stripe Billing:
// una fattura Stripe (prenotazioni × tariffa) pagata in automatico con il mandato SEPA del centro, che la riceve
// anche per email. Si contano solo le prenotazioni non disdette pagate al campo o con bonifico al centro: quelle pagate online
// (quando si accenderanno) avranno la tua parte trattenuta direttamente da Stripe.
// La chiama pg_cron il primo del mese con x-webhook-secret. Per rifare un mese: body {"mese": "AAAA-MM"}.
// Si può rilanciare senza paura: un centro già addebitato per quel mese viene saltato.

import { allungaLicenza } from '../_shared/addebiti.ts';
import { daCron, db, json, messaggio, oggi, type Centro } from '../_shared/comune.ts';
import { managementApi } from '../_shared/supabase-api.ts';
import { stripe } from '../_shared/stripe.ts';

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

const meseDopo = (mese: string) => {
  const [y, m] = mese.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
const mesePrima = (mese: string) => {
  const [y, m] = mese.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};
const euro = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

async function addebita(c: Centro, mese: string) {
  const { data: fatto } = await db.from('addebiti').select('id, stato').eq('centro', c.id).eq('mese', mese).maybeSingle();
  if (fatto && fatto.stato !== 'da_fare') return `già fatto (${fatto.stato})`;

  const [{ n }] = (await managementApi('POST', `/projects/${c.progetto}/database/query`, {
    query: `select count(*)::int as n from public.bookings where status = 'active' and pay in ('onsite', 'transfer') and day >= '${mese}-01' and day < '${meseDopo(mese)}-01';`,
  })) as { n: number }[];
  const importo = n * c.tariffa_cents;
  const { data: a, error } = await db
    .from('addebiti')
    .upsert({ centro: c.id, mese, prenotazioni: n, importo_cents: importo, stato: importo ? 'da_fare' : 'zero' }, { onConflict: 'centro,mese' })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  if (!importo) {
    await allungaLicenza(c);
    return 'nessuna prenotazione';
  }
  if (!c.stripe_cliente || !c.stripe_metodo) throw new Error('Il centro non ha un mandato SEPA: addebito da fare a mano.');

  const [y, m] = mese.split('-').map(Number);
  const descrizione = `Prenotazioni di ${MESI[m - 1]} ${y}: ${n} × ${euro(c.tariffa_cents)} €`;
  // Le chiavi di idempotenza evitano doppioni se la funzione si interrompe e si rilancia.
  const fattura = await stripe(
    'POST',
    '/invoices',
    {
      customer: c.stripe_cliente,
      collection_method: 'charge_automatically',
      default_payment_method: c.stripe_metodo,
      auto_advance: true,
      currency: 'eur',
      description: `K9 Manager – ${c.campo}`,
      metadata: { centro: c.id, mese },
    },
    `fattura-${a.id}`,
  );
  await stripe('POST', '/invoiceitems', { customer: c.stripe_cliente, invoice: fattura.id, amount: importo, currency: 'eur', description: descrizione }, `voce-${a.id}`);
  await stripe('POST', `/invoices/${fattura.id}/finalize`, { auto_advance: true }, `chiudi-${a.id}`);
  await db.from('addebiti').update({ stato: 'inviato', fattura: fattura.id, errore: '' }).eq('id', a.id);
  return `${n} prenotazioni, ${euro(importo)} €`;
}

Deno.serve(async (req) => {
  if (!daCron(req)) return json({ errore: 'Non autorizzato.' }, 401);
  const body = await req.json().catch(() => ({}));
  const mese = /^\d{4}-\d{2}$/.test(body.mese ?? '') ? body.mese : mesePrima(oggi().slice(0, 7));
  const { data } = await db.from('centri').select('*').eq('stato', 'pronto').order('creato');
  const esito: Record<string, string> = {};
  for (const c of (data ?? []) as Centro[]) {
    try {
      esito[c.codice] = await addebita(c, mese);
    } catch (e) {
      esito[c.codice] = `errore: ${messaggio(e)}`;
      await db.from('addebiti').update({ errore: messaggio(e) }).eq('centro', c.id).eq('mese', mese);
      console.error(`${c.codice} ${mese}: ${messaggio(e)}`);
    }
  }
  return json({ mese, centri: esito });
});
