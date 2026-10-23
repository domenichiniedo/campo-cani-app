// Il tuo pannello (app "K9 Gestore"): tutti i centri, gli addebiti e le azioni a mano.
// Entri con un utente del progetto gestore (Authentication → Users → Add user) la cui email sta in
// AMMINISTRATORI (segreto, email separate da virgola). Nessun altro può chiamarla.

import { allungaLicenza, ambiente } from '../_shared/addebiti.ts';
import { db, env, funzione, json, messaggio, oggi, preflight, type Centro } from '../_shared/comune.ts';
import { rinnova } from '../_shared/passi.ts';

const PIANI = ['base', 'professional', 'pro'];

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
        const [centri, addebiti] = await Promise.all([
          db
            .from('centri')
            .select('id, codice, campo, email, piano, stato, errore, tariffa_cents, stripe_metodo, stripe_conto, stripe_attivo, scade, sospeso, creato')
            .order('creato', { ascending: false }),
          db.from('addebiti').select('id, centro, mese, prenotazioni, importo_cents, stato, fattura, errore').gte('mese', da.toISOString().slice(0, 7)).order('mese'),
        ]);
        if (centri.error || addebiti.error) throw new Error((centri.error ?? addebiti.error)!.message);
        return json({ oggi: oggi(), centri: centri.data, addebiti: addebiti.data });
      }
      case 'piano': {
        if (!PIANI.includes(b.piano)) throw new Error('Piano non valido.');
        const c = { ...(await centro(b.id)), piano: b.piano };
        // Licenza nuova con il piano nuovo e la stessa scadenza: l'app la prende perché è più recente.
        const licenza = c.stato === 'pronto' && c.scade ? await rinnova(c, ambiente(), c.scade) : {};
        await db.from('centri').update({ piano: b.piano, ...licenza }).eq('id', c.id);
        return json({ fatto: true });
      }
      case 'tariffa': {
        const cents = Math.round(Number(b.cents));
        if (!Number.isFinite(cents) || cents < 0 || cents > 10000) throw new Error('Tariffa non valida.');
        await db.from('centri').update({ tariffa_cents: cents }).eq('id', b.id);
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
        if (c.stato !== 'errore') throw new Error('Il centro non è in errore.');
        if (!c.stripe_metodo && env('SENZA_MANDATO') !== 'si') throw new Error('Il centro non ha firmato il mandato: deve registrarsi di nuovo.');
        // I passi si possono ripetere: si riparte dall'avvio se il progetto c'è già, altrimenti da capo.
        await db.from('centri').update({ stato: c.progetto ? 'avvio' : 'progetto', tentativi: 0, errore: '' }).eq('id', c.id);
        return json({ fatto: true });
      }
      case 'pagato': {
        // Pagato in un altro modo (bonifico): si segna e si allunga la licenza.
        const { data: a } = await db.from('addebiti').update({ stato: 'pagato', errore: '' }).eq('id', b.addebito).select('centro').single();
        if (a) await allungaLicenza(await centro(a.centro));
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
