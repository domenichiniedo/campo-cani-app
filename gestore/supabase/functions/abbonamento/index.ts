// L'abbonamento del centro, dall'app (Impostazioni → Licenza), con l'accesso del proprietario al database del
// suo centro: il gestore controlla lì che sia davvero un proprietario.
//   vedi    piano, prezzi dei piani, cosa c'è da pagare (con IBAN e causale per il bonifico istantaneo), scadenza
//   cambia  cambia piano da oggi: canone e quote si dividono a giorni nell'addebito del mese; torna la licenza nuova
//   iban    l'IBAN da cui il centro fa i bonifici, per riconoscerli anche senza causale

import { cambiaPiano, prezzi } from '../_shared/addebiti.ts';
import { db, json, messaggio, preflight, ruolo, type Centro } from '../_shared/comune.ts';
import { ibanValido, type Piano } from '../_shared/costi.ts';

const PIANI: Piano[] = ['base', 'professional', 'pro'];

async function vedi(c: Centro) {
  const listino = await prezzi();
  // I prezzi fatti apposta per il centro valgono per tutti i piani.
  const piani = Object.fromEntries(
    PIANI.map((p) => [p, { canone_cents: c.canone_cents ?? listino[p].canone_cents, tariffa_cents: c.tariffa_cents ?? listino[p].tariffa_cents }]),
  );
  const { data: conto } = await db.from('banca').select('bonifico_iban, bonifico_intestatario').eq('id', 1).maybeSingle();
  const { data: aperti } = await db
    .from('addebiti')
    .select('id, mese, prenotazioni, canone_cents, importo_cents, stato, causale, scadenza')
    .eq('centro', c.id)
    .in('stato', ['inviato', 'non_pagato'])
    .gt('importo_cents', 0)
    .order('mese');
  const { data: crediti } = await db.from('crediti').select('residuo_cents').eq('centro', c.id).gt('residuo_cents', 0);
  return {
    piano: c.piano,
    piani,
    iban_centro: c.iban,
    scade: c.scade,
    bonifico: { iban: conto?.bonifico_iban ?? '', intestatario: conto?.bonifico_intestatario ?? '' },
    da_pagare: aperti ?? [],
    // Il bonus che resta, da scalare dai prossimi conti.
    credito_cents: (crediti ?? []).reduce((s, x) => s + x.residuo_cents, 0),
  };
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const body = await req.json().catch(() => ({}));
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
  const { data } = await db.from('centri').select('*').eq('codice', String(body.codice ?? '').toUpperCase()).eq('stato', 'pronto').maybeSingle();
  let c = data as Centro | null;
  if (!c || !token || (await ruolo(c, token)) !== 'owner') return json({ errore: "Solo il proprietario del centro può vedere e cambiare l'abbonamento." }, 403);

  try {
    switch (body.azione) {
      case 'vedi':
        return json(await vedi(c));
      case 'cambia': {
        if (!PIANI.includes(body.piano)) return json({ errore: 'Piano non valido.' }, 400);
        if (c.sospeso) return json({ errore: 'Il centro è sospeso: scrivi al gestore.' }, 403);
        c = await cambiaPiano(c, body.piano, 'app');
        return json({ ...(await vedi(c)), licenza: c.licenza });
      }
      case 'iban': {
        const iban = String(body.iban ?? '').toUpperCase().replace(/\s/g, '');
        if (iban && !ibanValido(iban)) return json({ errore: 'IBAN non valido.' }, 400);
        await db.from('centri').update({ iban }).eq('id', c.id);
        return json(await vedi({ ...c, iban }));
      }
      default:
        return json({ errore: 'Azione sconosciuta.' }, 400);
    }
  } catch (e) {
    console.error(`${c.codice}: ${messaggio(e)}`);
    return json({ errore: 'Il gestore non risponde in questo momento. Riprova più tardi.' }, 502);
  }
});
