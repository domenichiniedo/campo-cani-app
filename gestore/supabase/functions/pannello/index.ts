// Il tuo pannello (app "K9 Gestore"): tutti i centri, gli addebiti e le azioni a mano.
// Entri con un utente del progetto gestore (Authentication → Users → Add user) la cui email sta in
// AMMINISTRATORI (segreto, email separate da virgola). Nessun altro può chiamarla.

import { allungaLicenza, cambiaPiano } from '../_shared/addebiti.ts';
import { bancaSpenta, enableBanking } from '../_shared/banca.ts';
import { controllaBonifici, segnaPagati } from '../_shared/bonifici.ts';
import { db, env, funzione, json, messaggio, oggi, preflight, type Centro } from '../_shared/comune.ts';
import { ibanValido, piuGiorni, type Piano } from '../_shared/costi.ts';
import { CAMPI_FATTURA, leggiFatturazione } from '../_shared/fatturazione.ts';

const PIANI: Piano[] = ['base', 'professional', 'pro'];

/** Centesimi da 0 a 1000 €, o null (= quelli del piano) se si passa null. */
function centesimi(v: unknown, nullo = false) {
  if (v === null && nullo) return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0 || n > 100000) throw new Error('Prezzo non valido.');
  return n;
}

async function amministratore(req: Request) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
  if (!token) return false;
  const { data } = await db.auth.getUser(token);
  const ammessi = env('AMMINISTRATORI').toLowerCase().split(',').map((e) => e.trim()).filter(Boolean);
  return !!data.user?.email && ammessi.includes(data.user.email.toLowerCase());
}

async function centro(id: string) {
  const { data } = await db.from('centri').select('*').eq('id', id).single();
  if (!data) throw new Error('Centro non trovato.');
  return data as Centro;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (!(await amministratore(req))) return json({ errore: 'Non sei un amministratore del gestore.' }, 403);
  const b = await req.json().catch(() => ({}));
  try {
    switch (b.azione) {
      case 'dati': {
        const da = new Date();
        da.setUTCMonth(da.getUTCMonth() - 13);
        const [centri, addebiti, piani, banca, movimenti] = await Promise.all([
          db
            .from('centri')
            .select(`id, codice, campo, email, piano, stato, errore, tariffa_cents, canone_cents, iban, scade, sospeso, creato, ${CAMPI_FATTURA.join(', ')}`)
            .order('creato', { ascending: false }),
          db
            .from('addebiti')
            .select('id, centro, mese, prenotazioni, canone_cents, importo_cents, stato, fattura, errore, scadenza, causale, pagato_il')
            .gte('mese', da.toISOString().slice(0, 7))
            .order('mese'),
          db.from('piani').select('*'),
          db.from('banca').select('bonifico_iban, bonifico_intestatario, banca, paese, tipo, conto, iban, valido_fino, ultimo_controllo, errore').eq('id', 1).single(),
          // I bonifici con "K9" o di un centro che non pagano nessun addebito: da abbinare a mano.
          db.from('movimenti').select('id, data, importo_cents, iban, nome, causale, centro').eq('addebiti', '{}').gte('data', piuGiorni(oggi(), -120)).order('data', { ascending: false }),
        ]);
        const errore = centri.error ?? addebiti.error ?? piani.error ?? banca.error ?? movimenti.error;
        if (errore) throw new Error(errore.message);
        const { conto, ...resto } = banca.data!;
        return json({
          oggi: oggi(),
          centri: centri.data,
          addebiti: addebiti.data,
          piani: piani.data,
          banca: { ...resto, collegata: !!conto, abilitata: !bancaSpenta() },
          movimenti: movimenti.data,
        });
      }
      case 'piano': {
        if (!PIANI.includes(b.piano)) throw new Error('Piano non valido.');
        await cambiaPiano(await centro(b.id), b.piano, 'pannello');
        return json({ fatto: true });
      }
      case 'prezzi': {
        if (!PIANI.includes(b.piano)) throw new Error('Piano non valido.');
        await db.from('piani').update({ canone_cents: centesimi(b.canone_cents), tariffa_cents: centesimi(b.tariffa_cents) }).eq('piano', b.piano);
        return json({ fatto: true });
      }
      case 'tariffa':
        await db.from('centri').update({ tariffa_cents: centesimi(b.cents, true) }).eq('id', b.id);
        return json({ fatto: true });
      case 'centro': {
        // L'IBAN da cui paga un centro, i prezzi fatti apposta (null = quelli del piano) e i dati per la fattura.
        const m: Record<string, unknown> = {};
        if (b.fattura !== undefined) {
          const f = leggiFatturazione(b.fattura);
          if ('errore' in f) throw new Error(f.errore);
          Object.assign(m, f.dati);
        }
        if (b.iban !== undefined) {
          const iban = String(b.iban).toUpperCase().replace(/\s/g, '');
          if (iban && !ibanValido(iban)) throw new Error('IBAN non valido.');
          m.iban = iban;
        }
        if (b.canone_cents !== undefined) m.canone_cents = centesimi(b.canone_cents, true);
        if (b.tariffa_cents !== undefined) m.tariffa_cents = centesimi(b.tariffa_cents, true);
        await db.from('centri').update(m).eq('id', b.id);
        return json({ fatto: true });
      }
      case 'conto': {
        // Il tuo IBAN e l'intestatario: i centri li vedono nell'app per pagarti con il bonifico istantaneo.
        const iban = String(b.iban ?? '').toUpperCase().replace(/\s/g, '');
        const intestatario = String(b.intestatario ?? '').trim().slice(0, 70);
        if (!ibanValido(iban)) throw new Error('IBAN non valido.');
        if (intestatario.length < 2) throw new Error("Scrivi l'intestatario del conto.");
        await db.from('banca').update({ bonifico_iban: iban, bonifico_intestatario: intestatario }).eq('id', 1);
        return json({ fatto: true });
      }
      case 'banche': {
        const r = await enableBanking('GET', `/aspsps?country=${encodeURIComponent(b.paese || 'IT')}`);
        // deno-lint-ignore no-explicit-any
        return json({ banche: (r.aspsps ?? []).map((x: any) => ({ nome: x.name, paese: x.country, tipi: x.psu_types ?? ['personal'] })) });
      }
      case 'collega_banca': {
        // Il permesso di leggere il conto, per il tempo più lungo che la banca concede (di solito 90 o 180 giorni).
        const paese = String(b.paese || 'IT');
        const r = await enableBanking('GET', `/aspsps?country=${encodeURIComponent(paese)}`);
        // deno-lint-ignore no-explicit-any
        const banca = (r.aspsps ?? []).find((x: any) => x.name === b.banca);
        if (!banca) throw new Error('Banca non trovata.');
        const secondi = Math.min(Number(banca.maximum_consent_validity) || 90 * 86400, 180 * 86400);
        const attesa = crypto.randomUUID();
        const tipo = b.tipo === 'business' ? 'business' : 'personal';
        const a = await enableBanking('POST', '/auth', {
          access: { valid_until: new Date(Date.now() + secondi * 1000).toISOString() },
          aspsp: { name: banca.name, country: paese },
          state: attesa,
          redirect_url: funzione('banca'),
          psu_type: tipo,
        });
        await db.from('banca').update({ banca: banca.name, paese, tipo, attesa }).eq('id', 1);
        return json({ url: a.url });
      }
      case 'controlla':
        return json(await controllaBonifici());
      case 'abbina': {
        // Un bonifico non riconosciuto va a un addebito scelto da te.
        const { data: a } = await db.from('addebiti').select('id, centro').eq('id', b.addebito).single();
        if (!a) throw new Error('Addebito non trovato.');
        const { data: m } = await db.from('movimenti').update({ centro: a.centro, addebiti: [a.id] }).eq('id', b.movimento).select('data').single();
        if (!m) throw new Error('Bonifico non trovato.');
        await segnaPagati(a.centro, [a.id], m.data);
        return json({ fatto: true });
      }
      case 'rinnova':
        await allungaLicenza(await centro(b.id), true);
        return json({ fatto: true });
      case 'sospendi':
        await db.from('centri').update({ sospeso: !!b.sospeso }).eq('id', b.id);
        return json({ fatto: true });
      case 'riprova': {
        const c = await centro(b.id);
        // Anche i centri registrati quando serviva il mandato SEPA e rimasti ad aspettarlo.
        if (c.stato !== 'errore' && c.stato !== 'mandato') throw new Error('Il centro non è in errore.');
        // I passi si possono ripetere: si riparte dall'avvio se il progetto c'è già, altrimenti da capo.
        await db.from('centri').update({ stato: c.progetto ? 'avvio' : 'progetto', tentativi: 0, errore: '' }).eq('id', c.id);
        return json({ fatto: true });
      }
      case 'pagato': {
        // Pagato in un altro modo (bonifico non visto, contanti): si segna e si allunga la licenza.
        const { data: a } = await db.from('addebiti').select('centro').eq('id', b.addebito).single();
        if (a) await segnaPagati(a.centro, [b.addebito]);
        return json({ fatto: true });
      }
      case 'addebita': {
        const r = await fetch(funzione('addebito-mensile'), {
          method: 'POST',
          headers: { 'x-webhook-secret': env('WEBHOOK_SECRET'), 'Content-Type': 'application/json' },
          body: JSON.stringify(/^\d{4}-\d{2}$/.test(b.mese ?? '') ? { mese: b.mese } : {}),
        });
        return json(await r.json(), r.status);
      }
      default:
        return json({ errore: 'Azione sconosciuta.' }, 400);
    }
  } catch (e) {
    return json({ errore: messaggio(e) }, 400);
  }
});
