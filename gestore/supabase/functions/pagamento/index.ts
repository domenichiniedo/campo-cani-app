// La banca del centro torna qui dopo "Paga ora" (state = la parola casuale del pagamento). Si legge com'è andato
// il bonifico e, se è partito, si controllano subito i movimenti del tuo conto: così la licenza si rinnova senza
// aspettare il controllo delle 6 ore.
// Qui torna anche la banca del cliente che paga una lezione dall'app (funzione lezione): se il bonifico è partito,
// la lezione si segna pagata subito nel database del centro.

import { enableBanking } from '../_shared/banca.ts';
import { controllaBonifici } from '../_shared/bonifici.ts';
import { db, messaggio } from '../_shared/comune.ts';
import { aggiornaLezione, type PagamentoLezione } from '../_shared/lezioni.ts';
import { PARTITO, RIFIUTATO } from '../_shared/paga.ts';

const pagina = (titolo: string, testo: string, status = 200) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titolo}</title>` +
      `<body style="font-family:system-ui;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5"><h1 style="font-size:1.4rem">${titolo}</h1><p>${testo}</p></body>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );

/** Il ritorno dalla banca del cliente dopo il bonifico di una lezione. */
async function lezione(p: PagamentoLezione, u: URL) {
  if (u.searchParams.get('error')) {
    await db.from('pagamenti_lezioni').update({ stato: 'CANC', errore: String(u.searchParams.get('error_description') ?? u.searchParams.get('error')).slice(0, 300) }).eq('id', p.id);
    return pagina('Pagamento annullato', 'Il bonifico non è partito. Torna all\'app: puoi riprovare o usare i dati del bonifico.', 400);
  }
  try {
    const stato = await aggiornaLezione(p);
    if (RIFIUTATO.includes(stato)) return pagina('Pagamento rifiutato', 'La banca non ha fatto partire il bonifico. Torna all\'app e riprova, o usa i dati del bonifico.', 400);
    if (PARTITO.includes(stato)) return pagina('Lezione pagata', 'Grazie! Il bonifico è partito e la lezione è segnata come pagata. Puoi chiudere questa pagina e tornare all\'app.');
    return pagina('Bonifico in corso', 'La banca sta ancora lavorando il bonifico: appena parte la lezione si segna pagata da sola. Puoi tornare all\'app.');
  } catch (e) {
    console.error(messaggio(e));
    return pagina('Pagamento in verifica', 'Non riesco a leggere lo stato del bonifico. Se lo hai confermato nella tua banca, la lezione si segna pagata da sola entro qualche ora.', 502);
  }
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const state = u.searchParams.get('state') ?? '';
  const { data: l } = await db.from('pagamenti_lezioni').select('*').eq('state', state).maybeSingle();
  if (l) return lezione(l as PagamentoLezione, u);
  const { data: p } = await db.from('pagamenti').select('id, payment_id').eq('state', state).maybeSingle();
  if (!p?.payment_id) return pagina('Pagamento non trovato', 'Questo link non è più valido. Torna all\'app e riprova da "Paga ora".', 400);
  if (u.searchParams.get('error')) {
    await db.from('pagamenti').update({ stato: 'CANC', errore: String(u.searchParams.get('error_description') ?? u.searchParams.get('error')).slice(0, 300) }).eq('id', p.id);
    return pagina('Pagamento annullato', 'Il bonifico non è partito. Torna all\'app: puoi riprovare da "Paga ora" o usare i dati del bonifico.', 400);
  }
  try {
    const r = await enableBanking('GET', `/payments/${encodeURIComponent(p.payment_id)}`);
    const stato = String(r.status ?? '');
    await db.from('pagamenti').update({ stato, errore: String(r.status_reason_information?.status_reason_description ?? '').slice(0, 300) }).eq('id', p.id);
    if (RIFIUTATO.includes(stato)) return pagina('Pagamento rifiutato', 'La banca non ha fatto partire il bonifico. Torna all\'app e riprova, o usa i dati del bonifico.', 400);
    // Un bonifico istantaneo arriva in pochi secondi: se il conto lo mostra già, la licenza si rinnova adesso.
    await controllaBonifici().catch((e) => console.error(`controllo dopo Paga ora: ${messaggio(e)}`));
    return pagina('Bonifico partito', 'Grazie! Appena il bonifico arriva la licenza si rinnova da sola: di solito subito, al massimo entro qualche ora. Puoi chiudere questa pagina e tornare all\'app.');
  } catch (e) {
    console.error(messaggio(e));
    return pagina('Pagamento in verifica', 'Non riesco a leggere lo stato del bonifico. Se lo hai confermato nella tua banca, la licenza si rinnova appena arriva.', 502);
  }
});
