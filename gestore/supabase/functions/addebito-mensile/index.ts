// Il primo del mese fa il conto del mese prima di ogni centro: canone del piano (diviso a giorni se il piano è
// cambiato o il centro si è registrato a metà mese) più la quota per ogni prenotazione non disdetta pagata al campo,
// con bonifico o con carta al centro (le lezioni scalate da un pacchetto non contano).
// Il centro vede l'addebito nell'app (Impostazioni → Licenza) con IBAN, causale e codice QR, e lo paga con un
// bonifico istantaneo sul tuo conto: controlla-bonifici lo trova nei movimenti e rinnova la licenza.
// Se non arriva entro la scadenza (il giorno GIORNI_PER_PAGARE del mese, 3 di solito) la licenza scade e l'app
// del centro si blocca finché il pagamento non arriva.
// La chiama pg_cron il primo del mese con x-webhook-secret. Per rifare un mese: body {"mese": "AAAA-MM"}.
// Si può rilanciare senza paura: un centro già addebitato per quel mese viene saltato.

import { allungaLicenza, cambi, prezzi } from '../_shared/addebiti.ts';
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
  const { data: fatto } = await db.from('addebiti').select('id, stato').eq('centro', c.id).eq('mese', mese).maybeSingle();
  if (fatto && fatto.stato !== 'da_fare') return `già fatto (${fatto.stato})`;

  const righe = (await managementApi('POST', `/projects/${c.progetto}/database/query`, {
    // Contano anche le prenotazioni annullate; non quelle pagate con un pacchetto.
    query: `select day::text as g, count(*)::int as n from public.bookings where pay in ('onsite', 'transfer', 'online') and day >= '${mese}-01' and day < '${meseDopo(mese)}-01' group by day;`,
  })) as { g: string; n: number }[];
  const conto = contoDelMese({
    mese,
    dal: oggi(new Date(c.creato)),
    cambi: await cambi(c.id),
    attuale: c.piano,
    prezzi: listino,
    canone: c.canone_cents,
    tariffa: c.tariffa_cents,
    prenotazioni: Object.fromEntries(righe.map((r) => [r.g.slice(0, 10), r.n])),
  });
  const importo = conto.importo_cents;
  const { error } = await db
    .from('addebiti')
    .upsert(
      {
        centro: c.id,
        mese,
        prenotazioni: conto.prenotazioni,
        canone_cents: conto.canone_cents,
        importo_cents: importo,
        stato: importo ? 'inviato' : 'zero',
        scadenza: scadenzaLicenza(`${mese}-01`, giorniPerPagare()),
        causale: causale(c.codice, mese),
      },
      { onConflict: 'centro,mese' },
    );
  if (error) throw new Error(error.message);
  if (!importo) {
    await allungaLicenza(c);
    return 'niente da pagare';
  }
  return `${conto.prenotazioni} prenotazioni, ${euro(importo)} €`;
}

Deno.serve(async (req) => {
  if (!daCron(req)) return json({ errore: 'Non autorizzato.' }, 401);
  const body = await req.json().catch(() => ({}));
  const mese = /^\d{4}-\d{2}$/.test(body.mese ?? '') ? body.mese : mesePrima(oggi().slice(0, 7));
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
