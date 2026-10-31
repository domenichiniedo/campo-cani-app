// Pagamento con carta tramite Nexi XPay (pagina di pagamento di Nexi). Gira su Supabase, mai nell'app.
// Per ora SOLO nell'ambiente di prova di Nexi: nessun pagamento vero, si paga con le carte di prova di Nexi.
//
// La chiamano:
// - l'app del cliente ({"azione": "paga", "booking": id}, con il suo accesso): crea l'ordine e torna l'indirizzo
//   della pagina di Nexi;
// - l'app ({"azione": "rimborsa", "booking": id}) dopo la disdetta di una lezione pagata con carta: il cliente o il
//   proprietario;
// - il proprietario ({"azione": "stato"}) per sapere se la funzione è installata;
// - Nexi, con la notifica dell'esito (POST con securityToken) e con il ritorno del cliente (GET ?ordine=...).
// Ogni esito si controlla anche chiedendo l'ordine a Nexi: la lezione si segna pagata solo se Nexi dice che lo è.
//
// Secrets (facoltativi): NEXI_API_KEY, la chiave API di prova del tuo terminale Nexi. Senza, si usa la chiave di
// prova pubblica di Nexi. Si pubblica con:  supabase functions deploy nexi --no-verify-jwt

import { admin, env } from '../_shared/common.ts';
import { esito } from './esito.ts';

// Ambiente di prova di Nexi. Per l'ambiente vero servirà una decisione a parte: qui non c'è nessun interruttore.
const NEXI = 'https://xpaysandbox.nexigroup.com/api/phoenix-0.0/psp/api/v1';
// Chiave di prova pubblicata da Nexi (canale Nexi, pagina di pagamento nuova, contabilizzazione immediata).
const CHIAVE_PROVA = 'bc0c116f-77c1-4286-9613-8b00539cf3a1';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const pagina = (titolo: string, testo: string) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titolo}</title>` +
      `<body style="font-family:system-ui;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5"><h1 style="font-size:1.4rem">${titolo}</h1><p>${testo}</p></body>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );

// deno-lint-ignore no-explicit-any
type Any = any;

async function nexi(method: 'GET' | 'POST', path: string, body?: unknown, extra: Record<string, string> = {}): Promise<Any> {
  const r = await fetch(`${NEXI}${path}`, {
    method,
    headers: { 'X-Api-Key': env('NEXI_API_KEY') || CHIAVE_PROVA, 'Correlation-Id': crypto.randomUUID(), 'Content-Type': 'application/json', ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const dati = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Nexi ${r.status}: ${dati.errors?.[0]?.description ?? JSON.stringify(dati).slice(0, 200)}`);
  return dati;
}

/** Un orderId di 18 caratteri, lettere maiuscole e cifre. */
function nuovoOrdine() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return 'K9' + [...crypto.getRandomValues(new Uint8Array(16))].map((b) => a[b % a.length]).join('');
}

const qui = () => `${env('SUPABASE_URL')}/functions/v1/nexi`;

async function chi(req: Request) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  if (!data.user) return null;
  const { data: p } = await admin.from('profiles').select('id, role').eq('id', data.user.id).maybeSingle();
  return p as { id: string; role: string } | null;
}

/** Chiede l'ordine a Nexi e, se è pagato per intero, segna pagati ordine e lezione. Torna lo stato dell'ordine. */
async function verifica(id: string): Promise<string> {
  const { data: o } = await admin.from('nexi_orders').select('*').eq('id', id).maybeSingle();
  if (!o) return 'sconosciuto';
  if (o.status !== 'created') return o.status;
  const e = esito(await nexi('GET', `/orders/${encodeURIComponent(id)}`), o.amount_cents);
  if (e.stato === 'created') return 'created';
  await admin.from('nexi_orders').update({ status: e.stato, operation_id: e.operazione, updated_at: new Date().toISOString() }).eq('id', id);
  if (e.stato === 'paid') await admin.from('bookings').update({ paid: true }).eq('id', o.booking_id);
  return e.stato;
}

async function paga(req: Request, booking: string) {
  const p = await chi(req);
  if (!p) return json({ error: 'Devi accedere per pagare.' }, 401);
  const { data: s } = await admin.from('settings').select('online_payments').eq('id', 1).single();
  if (!s?.online_payments) return json({ error: 'Il pagamento con carta non è attivo.' }, 400);
  const { data: b } = await admin.from('bookings').select('*').eq('id', booking).maybeSingle();
  if (!b || b.user_id !== p.id || b.status !== 'active') return json({ error: 'Prenotazione non trovata.' }, 404);
  if (b.pay !== 'online') return json({ error: 'Questa lezione non si paga con carta.' }, 400);
  if (b.paid) return json({ error: 'Questa lezione è già pagata.' }, 400);
  if (b.price_cents <= 0) return json({ error: 'Niente da pagare.' }, 400);
  const { data: campo } = await admin.from('settings').select('field_name').eq('id', 1).single();

  const id = nuovoOrdine();
  const importo = String(b.price_cents);
  const r = await nexi('POST', '/orders/hpp', {
    order: { orderId: id, amount: importo, currency: 'EUR', description: `Lezione del ${b.day.split('-').reverse().join('/')} - ${campo?.field_name ?? ''}`.slice(0, 120) },
    paymentSession: {
      actionType: 'PAY',
      amount: importo,
      language: 'ita',
      resultUrl: `${qui()}?ordine=${id}`,
      cancelUrl: `${qui()}?ordine=${id}&annullato=1`,
      notificationUrl: qui(),
    },
  });
  const { error } = await admin.from('nexi_orders').insert({ id, booking_id: b.id, user_id: p.id, amount_cents: b.price_cents, security_token: r.securityToken ?? '' });
  if (error) throw new Error(error.message);
  return json({ url: r.hostedPage, ordine: id, prova: true });
}

async function rimborsa(req: Request, booking: string) {
  const p = await chi(req);
  if (!p) return json({ error: 'Devi accedere.' }, 401);
  const { data: b } = await admin.from('bookings').select('id, user_id, status').eq('id', booking).maybeSingle();
  if (!b || (b.user_id !== p.id && p.role !== 'owner')) return json({ error: 'Prenotazione non trovata.' }, 404);
  if (b.status !== 'cancelled') return json({ error: 'Si rimborsa solo una lezione disdetta.' }, 400);
  const { data: o } = await admin.from('nexi_orders').select('*').eq('booking_id', b.id).eq('status', 'paid').maybeSingle();
  if (!o) return json({ rimborsato: false });
  if (!o.operation_id) return json({ error: 'Rimborso da fare dal pannello di Nexi.' }, 400);
  await nexi('POST', `/operations/${encodeURIComponent(o.operation_id)}/refunds`, { amount: String(o.amount_cents), currency: 'EUR' }, { 'Idempotency-Key': crypto.randomUUID() });
  await admin.from('nexi_orders').update({ status: 'refunded', updated_at: new Date().toISOString() }).eq('id', o.id);
  return json({ rimborsato: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    // Il cliente torna dalla pagina di Nexi.
    if (req.method === 'GET') {
      const q = new URL(req.url).searchParams;
      const id = q.get('ordine') ?? '';
      if (!/^[A-Z0-9]{1,18}$/.test(id)) return pagina('Pagamento', 'Torna nell\'app.');
      if (q.get('annullato')) return pagina('Pagamento annullato', 'Non hai pagato niente. Torna nell\'app: puoi pagare la lezione più tardi o al campo.');
      const stato = await verifica(id).catch(() => 'created');
      return stato === 'paid'
        ? pagina('Pagamento riuscito', 'La lezione è pagata. Torna nell\'app Club Manager.')
        : stato === 'failed'
          ? pagina('Pagamento non riuscito', 'La carta non è stata accettata. Torna nell\'app e riprova, oppure paga al campo.')
          : pagina('Pagamento in verifica', 'Nexi sta ancora confermando il pagamento: torna nell\'app tra qualche minuto.');
    }
    const body = await req.json().catch(() => ({}));
    // Notifica dell'esito da Nexi: vale solo con il token dato da Nexi per quell'ordine.
    if (body.securityToken && body.operation?.orderId) {
      const { data: o } = await admin.from('nexi_orders').select('security_token').eq('id', String(body.operation.orderId)).maybeSingle();
      if (!o || !o.security_token || o.security_token !== body.securityToken) return new Response('Notifica non valida', { status: 400 });
      await verifica(String(body.operation.orderId));
      return new Response(null, { status: 200 });
    }
    switch (body.azione) {
      case 'stato': {
        const p = await chi(req);
        if (p?.role !== 'owner') return json({ error: 'Solo il proprietario.' }, 403);
        return json({ pronto: true, prova: true });
      }
      case 'paga':
        return await paga(req, String(body.booking ?? ''));
      case 'verifica': {
        const p = await chi(req);
        if (!p) return json({ error: 'Devi accedere.' }, 401);
        const { data: o } = await admin.from('nexi_orders').select('id, user_id').eq('id', String(body.ordine ?? '')).maybeSingle();
        if (!o || (o.user_id !== p.id && p.role !== 'owner')) return json({ error: 'Ordine non trovato.' }, 404);
        return json({ stato: await verifica(o.id) });
      }
      case 'rimborsa':
        return await rimborsa(req, String(body.booking ?? ''));
      default:
        return json({ error: 'Azione sconosciuta.' }, 400);
    }
  } catch (e) {
    console.error((e as Error).message);
    return json({ error: 'Nexi non risponde in questo momento. Riprova più tardi.' }, 502);
  }
});
