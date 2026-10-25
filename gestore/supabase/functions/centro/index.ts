// Stato di un centro dal suo codice: l'app lo chiede mentre il centro si prepara, e quando un cliente o un trainer
// scrive il codice del centro. Risponde con la licenza (che contiene indirizzo e publishable key del database:
// dati pubblici, protetti dai permessi del database) e mai con dati dei clienti.
// Con {"prezzi": true} risponde con i prezzi dei piani, che l'app mostra a chi sta per registrare un centro.

import { db, json, preflight } from '../_shared/comune.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const q = new URL(req.url).searchParams;

  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  if (body.prezzi) {
    const { data } = await db.from('piani').select('*');
    return json({
      piani: Object.fromEntries(
        (data ?? []).map((p) => [p.piano, { canone_cents: p.canone_cents, tariffa_cents: p.tariffa_cents, fisso_cents: p.fisso_cents ?? null }]),
      ),
    });
  }
  const codice = String(body.codice ?? q.get('codice') ?? '').trim().toUpperCase().replace(/^K9(?!-)/, 'K9-');
  if (!/^K9-[A-Z0-9]{6}$/.test(codice)) return json({ errore: 'Codice del centro non valido.' }, 400);
  const { data: c } = await db.from('centri').select('stato, campo, licenza').eq('codice', codice).maybeSingle();
  if (!c) return json({ errore: 'Nessun centro con questo codice.' }, 404);
  return json({ stato: c.stato, campo: c.campo, licenza: c.stato === 'pronto' ? c.licenza : null });
});
