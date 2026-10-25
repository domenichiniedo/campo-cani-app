// La banca torna qui dopo che hai dato il permesso di leggere il conto (dal pannello: Banca → Collega).
// Controlla che il ritorno sia quello chiesto (state), apre la sessione di Enable Banking e salva il conto da
// leggere: quello con l'IBAN in BANCA_IBAN, se c'è, altrimenti il primo. Solo lettura: nessun pagamento.

import { enableBanking } from '../_shared/banca.ts';
import { db, env, messaggio } from '../_shared/comune.ts';

const pagina = (titolo: string, testo: string, status = 200) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titolo}</title>` +
      `<body style="font-family:system-ui;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5"><h1 style="font-size:1.4rem">${titolo}</h1><p>${testo}</p></body>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );

const pulito = (s: string) => s.toUpperCase().replace(/\s/g, '');

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const code = u.searchParams.get('code');
  const state = u.searchParams.get('state');
  if (u.searchParams.get('error')) return pagina('Collegamento annullato', 'La banca non ha dato il permesso. Riprova dal pannello.', 400);
  const { data: b } = await db.from('banca').select('attesa').eq('id', 1).single();
  if (!code || !state || !b?.attesa || state !== b.attesa) return pagina('Collegamento non valido', 'Questo link non è più valido. Riprova dal pannello.', 400);
  try {
    const s = await enableBanking('POST', '/sessions', { code });
    // deno-lint-ignore no-explicit-any
    const conti: any[] = s.accounts ?? [];
    const voluto = pulito(env('BANCA_IBAN'));
    const conto = conti.find((c) => voluto && pulito(c.account_id?.iban ?? '') === voluto) ?? conti[0];
    if (!conto?.uid) throw new Error('La banca non ha dato nessun conto da leggere.');
    await db
      .from('banca')
      .update({ sessione: s.session_id, conto: conto.uid, iban: conto.account_id?.iban ?? '', valido_fino: s.access?.valid_until ?? null, attesa: null, errore: '' })
      .eq('id', 1);
    return pagina('Conto collegato', 'Il gestore ora legge i bonifici in entrata e rinnova da solo le licenze dei centri che pagano. Puoi chiudere questa pagina.');
  } catch (e) {
    await db.from('banca').update({ errore: messaggio(e) }).eq('id', 1);
    return pagina('Collegamento non riuscito', messaggio(e).replace(/[<>&]/g, ''), 502);
  }
});
