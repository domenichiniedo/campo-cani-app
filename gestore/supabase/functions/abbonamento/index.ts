// L'abbonamento del centro, dall'app (Impostazioni → Licenza), con l'accesso del proprietario al database del
// suo centro: il gestore controlla lì che sia davvero un proprietario.
//   vedi    piano, a consumo o fisso, prezzi dei piani, cosa c'è da pagare (con IBAN e causale per il bonifico
//           istantaneo), scadenza
//   cambia  cambia piano o formula (consumo, fisso) da oggi: canone e quote si dividono a giorni nell'addebito
//           del mese; con un piano nuovo torna la licenza nuova
//           (un piano più piccolo parte dal primo del mese dopo)
//   iban    l'IBAN da cui il centro fa i bonifici, per riconoscerli anche senza causale
//   disdici disdetta con un mese di preavviso, solo con i conti pagati: il servizio finisce alla fine del mese dopo
//   tieni   annulla la disdetta, finché il servizio non è finito

import { cambiaPiano, debiti, prezzi } from '../_shared/addebiti.ts';
import { db, json, messaggio, oggi, preflight, ruolo, type Centro } from '../_shared/comune.ts';
import { fineDelMeseDopo, ibanValido, primoDelMeseDopo, type Formula, type Piano } from '../_shared/costi.ts';

const PIANI: Piano[] = ['base', 'professional', 'pro'];
const FORMULE: Formula[] = ['consumo', 'fisso'];

async function vedi(c: Centro) {
  const listino = await prezzi();
  // I prezzi fatti apposta per il centro valgono per tutti i piani.
  const piani = Object.fromEntries(
    PIANI.map((p) => [
      p,
      {
        canone_cents: c.canone_cents ?? listino[p].canone_cents,
        tariffa_cents: c.tariffa_cents ?? listino[p].tariffa_cents,
        fisso_cents: c.fisso_cents ?? listino[p].fisso_cents,
        pacchetti_bp: listino[p].pacchetti_bp,
      },
    ]),
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
    formula: c.formula,
    // Il piano più piccolo già scelto e da quando vale.
    piano_prossimo: c.piano_prossimo,
    piano_dal: c.piano_prossimo ? primoDelMeseDopo(oggi()) : null,
    // Disdetto: l'ultimo giorno del servizio; e da quando finirebbe se lo disdicesse oggi.
    disdetta: c.disdetta,
    disdetta_se_oggi: fineDelMeseDopo(oggi()),
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
        const piano = body.piano ?? c.piano;
        const formula = body.formula ?? c.formula;
        if (!PIANI.includes(piano)) return json({ errore: 'Piano non valido.' }, 400);
        if (!FORMULE.includes(formula)) return json({ errore: 'Scegli a consumo o fisso.' }, 400);
        if (c.sospeso) return json({ errore: 'Il centro è sospeso: scrivi al gestore.' }, 403);
        c = await cambiaPiano(c, piano, 'app', formula);
        return json({ ...(await vedi(c)), licenza: c.licenza });
      }
      case 'disdici': {
        if (c.disdetta) return json(await vedi(c));
        if ((await debiti(c)) > 0) return json({ errore: 'Prima paga i conti aperti: la disdetta si può chiedere solo con tutto pagato.' }, 400);
        const disdetta = fineDelMeseDopo(oggi());
        await db.from('centri').update({ disdetta, disdetta_chiesta: new Date().toISOString() }).eq('id', c.id);
        return json(await vedi({ ...c, disdetta }));
      }
      case 'tieni': {
        if (c.disdetta && c.disdetta < oggi()) return json({ errore: 'Il servizio è già finito: scrivi al gestore per riattivarlo.' }, 400);
        await db.from('centri').update({ disdetta: null, disdetta_chiesta: null }).eq('id', c.id);
        return json(await vedi({ ...c, disdetta: null }));
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
