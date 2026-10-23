// Un centro si registra dall'app: nome, email del titolare e piano. Riceve il suo codice (K9-XXXXXX) e il link
// di Stripe per firmare il mandato SEPA. Firmato il mandato, il gestore prepara da solo il database.
// Si chiama senza accesso (chi si registra non ha ancora un account): per questo i limiti qui sotto.
//
// Con SENZA_MANDATO=si (solo per provare, senza Stripe) salta il mandato e prepara subito il database.

import { db, env, funzione, json, messaggio, preflight, sveglia } from '../_shared/comune.ts';
import { stripe } from '../_shared/stripe.ts';

const PIANI = ['base', 'professional', 'pro'];
// Senza lettere e cifre che si confondono (0/O, 1/I/L).
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function nuovoCodice() {
  const r = crypto.getRandomValues(new Uint8Array(6));
  return `K9-${[...r].map((b) => ALFABETO[b % ALFABETO.length]).join('')}`;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ errore: 'Usa POST.' }, 405);
  const body = await req.json().catch(() => ({}));
  const campo = String(body.campo ?? '').trim().slice(0, 80);
  const email = String(body.email ?? '').trim().toLowerCase();
  const piano = String(body.piano ?? '');
  if (campo.length < 2) return json({ errore: 'Scrivi il nome del centro.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ errore: 'Email non valida.' }, 400);
  if (!PIANI.includes(piano)) return json({ errore: 'Scegli il piano.' }, 400);

  // Ogni centro costa un progetto Supabase: si limita chi prova a registrarne tanti.
  const giorno = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count: stessaEmail } = await db.from('centri').select('id', { count: 'exact', head: true }).eq('email', email).gte('creato', giorno);
  const { count: tutti } = await db.from('centri').select('id', { count: 'exact', head: true }).gte('creato', giorno);
  if ((stessaEmail ?? 0) >= 3) return json({ errore: 'Hai già registrato dei centri oggi con questa email. Riprova domani.' }, 429);
  if ((tutti ?? 0) >= Number(env('MAX_CENTRI_AL_GIORNO') || 20)) return json({ errore: 'Troppe registrazioni oggi. Riprova domani.' }, 429);

  const senzaMandato = env('SENZA_MANDATO') === 'si';
  let centro: { id: string; codice: string } | null = null;
  for (let i = 0; i < 5 && !centro; i++) {
    const { data, error } = await db
      .from('centri')
      .insert({ codice: nuovoCodice(), campo, email, piano, stato: senzaMandato ? 'progetto' : 'mandato', tariffa_cents: Number(env('TARIFFA_CENTESIMI') || 100) })
      .select('id, codice')
      .single();
    if (data) centro = data;
    else if (error?.code !== '23505') return json({ errore: error?.message ?? 'Registrazione non riuscita.' }, 500);
  }
  if (!centro) return json({ errore: 'Registrazione non riuscita, riprova.' }, 500);

  if (senzaMandato) {
    sveglia();
    return json({ codice: centro.codice, mandato: null });
  }

  try {
    const cliente = await stripe('POST', '/customers', { email, name: campo, metadata: { centro: centro.id, codice: centro.codice } }, `cliente-${centro.id}`);
    // Pagina di Stripe in modalità "setup": il centro mette l'IBAN e firma il mandato, senza pagare niente adesso.
    const sessione = await stripe(
      'POST',
      '/checkout/sessions',
      {
        mode: 'setup',
        currency: 'eur',
        customer: cliente.id,
        payment_method_types: ['sepa_debit'],
        locale: 'it',
        success_url: `${funzione('centro')}?fatto=mandato`,
        cancel_url: `${funzione('centro')}?fatto=annullato`,
        metadata: { centro: centro.id },
        setup_intent_data: { metadata: { centro: centro.id } },
      },
      `mandato-${centro.id}`,
    );
    await db.from('centri').update({ stripe_cliente: cliente.id }).eq('id', centro.id);
    return json({ codice: centro.codice, mandato: sessione.url });
  } catch (e) {
    await db.from('centri').update({ stato: 'errore', errore: messaggio(e) }).eq('id', centro.id);
    return json({ errore: 'Il pagamento con Stripe non è disponibile in questo momento. Riprova più tardi.' }, 502);
  }
});
