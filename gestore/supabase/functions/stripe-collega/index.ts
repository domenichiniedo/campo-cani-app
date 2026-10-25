// Il proprietario di un centro collega il conto Stripe dove riceverà i pagamenti online dei clienti
// (Stripe Connect, conto Express collegato al tuo). Lo chiama l'app da Impostazioni, con l'accesso del
// proprietario al database del suo centro: il gestore controlla lì che sia davvero un proprietario.
// Risponde con lo stato del conto e, finché il centro non ha finito di inserire i suoi dati, con il link
// alla pagina di Stripe dove farlo (documento, partita IVA, IBAN: per legge li chiede Stripe, non noi).

import { db, funzione, json, messaggio, preflight, ruolo, type Centro } from '../_shared/comune.ts';
import { stripe } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const body = await req.json().catch(() => ({}));
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
  const { data } = await db.from('centri').select('*').eq('codice', String(body.codice ?? '').toUpperCase()).eq('stato', 'pronto').maybeSingle();
  const c = data as Centro | null;
  if (!c || !token || (await ruolo(c, token)) !== 'owner') return json({ errore: 'Solo il proprietario del centro può collegare il conto Stripe.' }, 403);

  try {
    let conto = c.stripe_conto;
    if (!conto) {
      const nuovo = await stripe(
        'POST',
        '/accounts',
        {
          type: 'express',
          country: 'IT',
          email: c.email,
          business_profile: { name: c.campo },
          capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
          metadata: { centro: c.id, codice: c.codice },
        },
        `conto-${c.id}`,
      );
      conto = nuovo.id as string;
      await db.from('centri').update({ stripe_conto: conto }).eq('id', c.id);
    }
    const a = await stripe('GET', `/accounts/${conto}`);
    const attivo = !!(a.charges_enabled && a.details_submitted);
    if (attivo !== c.stripe_attivo) await db.from('centri').update({ stripe_attivo: attivo }).eq('id', c.id);
    if (attivo) return json({ stato: 'attivo' });
    const link = await stripe('POST', '/account_links', {
      account: conto,
      type: 'account_onboarding',
      refresh_url: `${funzione('centro')}?fatto=stripe-scaduto`,
      return_url: `${funzione('centro')}?fatto=stripe`,
    });
    return json({ stato: a.details_submitted ? 'in_verifica' : 'da_completare', link: link.url });
  } catch (e) {
    console.error(`${c.codice}: ${messaggio(e)}`);
    return json({ errore: 'Stripe non risponde in questo momento. Riprova più tardi.' }, 502);
  }
});
