// Stato di un centro dal suo codice: l'app lo chiede mentre il centro si prepara, e quando un cliente o un trainer
// scrive il codice del centro. Risponde con la licenza (che contiene indirizzo e publishable key del database:
// dati pubblici, protetti dai permessi del database) e mai con dati dei clienti.
// È anche la pagina di ritorno da Stripe (?fatto=...).

import { db, json, preflight, testo } from '../_shared/comune.ts';

const RITORNO: Record<string, string> = {
  mandato: 'Mandato firmato. Torna nell\'app K9 Manager: il tuo centro si sta preparando.',
  annullato: 'Mandato non firmato. Torna nell\'app K9 Manager per riprovare.',
  stripe: 'Fatto. Torna nell\'app K9 Manager.',
  'stripe-scaduto': 'Il link è scaduto. Torna nell\'app K9 Manager e premi di nuovo "Collega il conto Stripe".',
};

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const q = new URL(req.url).searchParams;
  const fatto = q.get('fatto');
  if (fatto) return testo(RITORNO[fatto] ?? RITORNO.stripe);

  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const codice = String(body.codice ?? q.get('codice') ?? '').trim().toUpperCase().replace(/^K9(?!-)/, 'K9-');
  if (!/^K9-[A-Z0-9]{6}$/.test(codice)) return json({ errore: 'Codice del centro non valido.' }, 400);
  const { data: c } = await db.from('centri').select('stato, campo, licenza').eq('codice', codice).maybeSingle();
  if (!c) return json({ errore: 'Nessun centro con questo codice.' }, 404);
  return json({ stato: c.stato, campo: c.campo, licenza: c.stato === 'pronto' ? c.licenza : null });
});
