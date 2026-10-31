// L'abbonamento del centro, dall'app (Impostazioni → Licenza), con l'accesso del proprietario al database del
// suo centro: il gestore controlla lì che sia davvero un proprietario.
//   vedi    piano, a consumo o fisso, prezzi dei piani, cosa c'è da pagare (con IBAN e causale per il bonifico
//           istantaneo), scadenza e lo storico dei conti degli ultimi 24 mesi
//   cambia  cambia piano o formula (consumo, fisso) da oggi: canone e quote si dividono a giorni nell'addebito
//           del mese; con un piano nuovo torna la licenza nuova
//           (un piano più piccolo parte dal primo del mese dopo)
//   iban    l'IBAN da cui il centro fa i bonifici (obbligatorio), per riconoscerli anche senza causale e per "Paga ora"
//   disdici disdetta con un mese di preavviso, solo con i conti pagati: il servizio finisce alla fine del mese dopo
//   tieni   annulla la disdetta, finché il servizio non è finito
//   banche  le banche da cui si può usare "Paga ora" (vuoto se è spento)
//   paga    "Paga ora": prepara il bonifico istantaneo di un addebito nella banca del centro e torna la sua pagina

import { cambiaPiano, debiti, prezzi } from '../_shared/addebiti.ts';
import { db, funzione, json, messaggio, oggi, preflight, ruolo, type Centro } from '../_shared/comune.ts';
import { bancheConPagamento, disponi, pagaOraSpento } from '../_shared/paga.ts';
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
  // Lo storico: tutti i conti già fatti, pagati e no, dal più recente.
  const { data: storico } = await db
    .from('addebiti')
    .select('id, mese, prenotazioni, importo_cents, bonus_cents, stato, scadenza, pagato_il')
    .eq('centro', c.id)
    .neq('stato', 'da_fare')
    .order('mese', { ascending: false })
    .limit(24);
  const { data: crediti } = await db.from('crediti').select('residuo_cents').eq('centro', c.id).gt('residuo_cents', 0);
  return {
    piano: c.piano,
    formula: c.formula,
    // Il piano più piccolo o la formula già scelti, e da quando valgono.
    piano_prossimo: c.piano_prossimo,
    formula_prossima: c.formula_prossima,
    piano_dal: c.piano_prossimo || c.formula_prossima ? primoDelMeseDopo(oggi()) : null,
    // Disdetto: l'ultimo giorno del servizio; e da quando finirebbe se lo disdicesse oggi.
    disdetta: c.disdetta,
    disdetta_se_oggi: fineDelMeseDopo(oggi()),
    piani,
    iban_centro: c.iban,
    scade: c.scade,
    bonifico: { iban: conto?.bonifico_iban ?? '', intestatario: conto?.bonifico_intestatario ?? '' },
    da_pagare: aperti ?? [],
    storico: storico ?? [],
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
      case 'banche':
        return json({ banche: pagaOraSpento() ? [] : (await bancheConPagamento()).map(({ nome, paese }) => ({ nome, paese })) });
      case 'paga': {
        if (pagaOraSpento()) return json({ errore: 'Il pagamento dalla banca non è attivo: usa i dati del bonifico.' }, 400);
        const { data: a } = await db
          .from('addebiti')
          .select('id, importo_cents, causale, stato')
          .eq('id', String(body.addebito ?? ''))
          .eq('centro', c.id)
          .in('stato', ['inviato', 'non_pagato'])
          .maybeSingle();
        if (!a || !(a.importo_cents > 0)) return json({ errore: 'Questo conto è già pagato.' }, 400);
        if (!c.iban) return json({ errore: "Scrivi l'IBAN da cui paghi il piano." }, 400);
        const banca = (await bancheConPagamento()).find((x) => x.nome === body.banca?.nome && x.paese === body.banca?.paese);
        if (!banca) return json({ errore: 'Scegli la tua banca.' }, 400);
        const { data: conto } = await db.from('banca').select('bonifico_iban, bonifico_intestatario').eq('id', 1).maybeSingle();
        if (!conto?.bonifico_iban) return json({ errore: "Il gestore non ha ancora indicato l'IBAN per il pagamento. Riprova più tardi." }, 400);
        const state = crypto.randomUUID();
        const p = await disponi({
          banca,
          tipo: banca.tipo,
          importo_cents: a.importo_cents,
          iban: conto.bonifico_iban,
          intestatario: conto.bonifico_intestatario || 'Club Manager',
          causale: a.causale,
          state,
          ritorno: funzione('pagamento'),
          da_iban: c.iban,
        });
        await db.from('pagamenti').insert({ centro: c.id, addebito: a.id, state, payment_id: p.payment_id, stato: 'RCVD' });
        return json({ url: p.url });
      }
      case 'iban': {
        const iban = String(body.iban ?? '').toUpperCase().replace(/\s/g, '');
        if (!iban) return json({ errore: "Scrivi l'IBAN da cui paghi il piano." }, 400);
        if (!ibanValido(iban)) return json({ errore: 'IBAN non valido.' }, 400);
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
