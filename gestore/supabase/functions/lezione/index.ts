// Il cliente paga una lezione con il bonifico istantaneo direttamente dall'app, con il suo accesso al database del
// centro (il gestore controlla lì che la prenotazione sia sua e ancora da pagare).
//   banche  le banche da cui si può pagare (vuoto se il pagamento dalla banca è spento)
//   paga    prepara il bonifico dal conto del cliente (banca scelta e IBAN) al conto del centro e torna la pagina
//           della banca dove confermarlo; al ritorno (funzione pagamento) la lezione si segna pagata da sola

import { db, funzione, json, messaggio, preflight, type Centro } from '../_shared/comune.ts';
import { ibanValido } from '../_shared/costi.ts';
import { causaleLezione, leggi, utente } from '../_shared/lezioni.ts';
import { bancheConPagamento, disponi, pagaOraSpento } from '../_shared/paga.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const body = await req.json().catch(() => ({}));
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
  const { data } = await db.from('centri').select('*').eq('codice', String(body.codice ?? '').toUpperCase()).eq('stato', 'pronto').maybeSingle();
  const c = data as Centro | null;
  const io = c ? await utente(c, token) : null;
  if (!c || !io) return json({ errore: 'Accedi al tuo centro per pagare dalla banca.' }, 403);

  try {
    switch (body.azione) {
      case 'banche':
        return json({ banche: pagaOraSpento() ? [] : (await bancheConPagamento()).map(({ nome, paese }) => ({ nome, paese })) });
      case 'paga': {
        if (pagaOraSpento()) return json({ errore: 'Il pagamento dalla banca non è attivo: usa i dati del bonifico.' }, 400);
        const iban = String(body.iban ?? '').toUpperCase().replace(/\s/g, '');
        if (!ibanValido(iban)) return json({ errore: 'Il tuo IBAN non è valido: controllalo.' }, 400);
        const id = String(body.prenotazione ?? '');
        const [b] = await leggi(c, token, `bookings?select=id,user_id,day,start_min,price_cents,pay,paid,status,dogs(name)&id=eq.${encodeURIComponent(id)}`);
        if (!b || b.user_id !== io) return json({ errore: 'Prenotazione non trovata.' }, 404);
        if (b.paid) return json({ errore: 'Questa lezione è già pagata.' }, 400);
        if (b.status !== 'active' || b.pay !== 'transfer' || !(b.price_cents > 0)) return json({ errore: 'Questa lezione non si paga con bonifico.' }, 400);
        const [conto] = await leggi(c, token, 'transfer_settings?select=enabled,holder,iban&id=eq.1');
        if (!conto?.enabled || !conto.iban) return json({ errore: 'Il centro non ha attivato il bonifico.' }, 400);
        const banca = (await bancheConPagamento()).find((x) => x.nome === body.banca?.nome && x.paese === body.banca?.paese);
        if (!banca) return json({ errore: 'Scegli la tua banca.' }, 400);
        const state = crypto.randomUUID();
        const p = await disponi({
          banca,
          tipo: banca.tipo,
          importo_cents: b.price_cents,
          iban: conto.iban,
          intestatario: conto.holder || c.campo,
          causale: causaleLezione(b, b.dogs?.name ?? ''),
          state,
          ritorno: funzione('pagamento'),
          privato: true,
          da_iban: iban,
        });
        await db.from('pagamenti_lezioni').insert({ centro: c.id, prenotazione: b.id, importo_cents: b.price_cents, state, payment_id: p.payment_id, stato: 'RCVD' });
        return json({ url: p.url });
      }
      default:
        return json({ errore: 'Azione sconosciuta.' }, 400);
    }
  } catch (e) {
    console.error(`${c.codice}: ${messaggio(e)}`);
    return json({ errore: 'La banca non risponde in questo momento. Riprova più tardi o usa i dati del bonifico.' }, 502);
  }
});
