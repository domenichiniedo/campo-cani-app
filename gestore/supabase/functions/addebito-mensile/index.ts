// Il primo del mese fa il conto del mese prima di ogni centro: canone del piano (diviso a giorni se il piano è
// cambiato o il centro si è registrato a metà mese) più la quota per ogni prenotazione pagata al campo, con
// bonifico o con carta al centro, anche se poi è stata annullata. Le lezioni scalate da un pacchetto non
// contano: si conta invece il 2% (pacchetti_bp del piano) del prezzo di ogni pacchetto attivato nel mese.
// Il centro a prezzo fisso paga solo il fisso del piano, senza quote.
// Il centro vede l'addebito nell'app (Impostazioni → Licenza) con IBAN, causale e codice QR, e lo paga con un
// bonifico istantaneo sul tuo conto: controlla-bonifici lo trova nei movimenti e rinnova la licenza.
// Se non arriva entro la scadenza (il giorno GIORNI_PER_PAGARE del mese, 3 di solito) la licenza scade e l'app
// del centro si blocca finché il pagamento non arriva.
// La chiama pg_cron il primo del mese con x-webhook-secret. Per rifare un mese: body {"mese": "AAAA-MM"}.
// Si può rilanciare senza paura: un centro già addebitato per quel mese viene saltato.

import { allungaLicenza, applicaCambiPrenotati, cambi, prezzi } from '../_shared/addebiti.ts';
import { daCron, db, json, messaggio, oggi, type Centro } from '../_shared/comune.ts';
import { causale, contoDelMese, giorniPerPagare, scadenzaLicenza, type Prezzi } from '../_shared/costi.ts';
import { managementApi } from '../_shared/supabase-api.ts';

const meseDopo = (mese: string) => {
  const [y, m] = mese.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
const mesePrima = (mese: string) => {
  const [y, m] = mese.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};
const euro = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

async function addebita(c: Centro, mese: string, listino: Prezzi) {
  // Disdetto: dopo l'ultimo mese non si addebita più niente.
  if (c.disdetta && `${mese}-01` > c.disdetta) return `disdetto dal ${c.disdetta}`;
  const { data: fatto } = await db.from('addebiti').select('id, stato').eq('centro', c.id).eq('mese', mese).maybeSingle();
  if (fatto && fatto.stato !== 'da_fare') return `già fatto (${fatto.stato})`;

  const righe = (await managementApi('POST', `/projects/${c.progetto}/database/query`, {
    // Contano anche le prenotazioni annullate; non quelle pagate con un pacchetto.
    query: `select day::text as g, count(*)::int as n from public.bookings where pay in ('onsite', 'transfer', 'online') and day >= '${mese}-01' and day < '${meseDopo(mese)}-01' group by day;`,
  })) as { g: string; n: number }[];
  // I pacchetti attivati nel mese (anche se poi annullati), giorno per giorno, con il loro prezzo.
  const attivati = (await managementApi('POST', `/projects/${c.progetto}/database/query`, {
    query: `select (activated_at at time zone 'Europe/Rome')::date::text as g, sum(price_cents)::int as c from public.client_packages where activated_at is not null and (activated_at at time zone 'Europe/Rome')::date >= '${mese}-01' and (activated_at at time zone 'Europe/Rome')::date < '${meseDopo(mese)}-01' group by 1;`,
  })) as { g: string; c: number }[];
  const conto = contoDelMese({
    mese,
    dal: oggi(new Date(c.creato)),
    cambi: await cambi(c.id),
    attuale: c.piano,
    formula: c.formula,
    prezzi: listino,
    canone: c.canone_cents,
    tariffa: c.tariffa_cents,
    fisso: c.fisso_cents,
    prenotazioni: Object.fromEntries(righe.map((r) => [r.g.slice(0, 10), r.n])),
    pacchetti: Object.fromEntries(attivati.map((r) => [r.g.slice(0, 10), r.c])),
  });
  // Il bonus del centro (crediti dal pannello o da un codice bonus) si scala dal conto, finché c'è.
  const { data: crediti } = await db.from('crediti').select('residuo_cents').eq('centro', c.id).gt('residuo_cents', 0);
  const bonus = Math.min(conto.importo_cents, (crediti ?? []).reduce((s, x) => s + x.residuo_cents, 0));
  const importo = conto.importo_cents - bonus;
  const { error } = await db
    .from('addebiti')
    .upsert(
      {
        centro: c.id,
        mese,
        prenotazioni: conto.prenotazioni,
        canone_cents: conto.canone_cents,
        pacchetti_cents: conto.pacchetti_cents,
        importo_cents: importo,
        bonus_cents: bonus,
        stato: importo ? 'inviato' : 'zero',
        scadenza: scadenzaLicenza(`${mese}-01`, giorniPerPagare()),
        causale: causale(c.codice, mese),
      },
      { onConflict: 'centro,mese' },
    );
  if (error) throw new Error(error.message);
  // Dopo il conto: se qui qualcosa va storto il centro paga meno, mai due volte il bonus.
  if (bonus) {
    const { error: e } = await db.rpc('scala_crediti', { p_centro: c.id, p_importo: bonus });
    if (e) console.error(`${c.codice} ${mese}: bonus non scalato: ${e.message}`);
  }
  const conBonus = bonus ? ` (bonus ${euro(bonus)} €)` : '';
  if (!importo) {
    await allungaLicenza(c);
    return `niente da pagare${conBonus}`;
  }
  return `${conto.prenotazioni} prenotazioni, ${euro(importo)} €${conBonus}`;
}

Deno.serve(async (req) => {
  if (!daCron(req)) return json({ errore: 'Non autorizzato.' }, 401);
  const body = await req.json().catch(() => ({}));
  const mese = /^\d{4}-\d{2}$/.test(body.mese ?? '') ? body.mese : mesePrima(oggi().slice(0, 7));
  // I passaggi a un piano più piccolo prenotati partono oggi, il primo del mese (non quando si rifà un mese vecchio).
  if (!body.mese) await applicaCambiPrenotati().catch((e) => console.error(`piani prenotati: ${messaggio(e)}`));
  const listino = await prezzi();
  const { data } = await db.from('centri').select('*').eq('stato', 'pronto').order('creato');
  const esito: Record<string, string> = {};
  for (const c of (data ?? []) as Centro[]) {
    try {
      esito[c.codice] = await addebita(c, mese, listino);
    } catch (e) {
      esito[c.codice] = `errore: ${messaggio(e)}`;
      await db.from('addebiti').update({ errore: messaggio(e) }).eq('centro', c.id).eq('mese', mese);
      console.error(`${c.codice} ${mese}: ${messaggio(e)}`);
    }
  }
  return json({ mese, centri: esito });
});
