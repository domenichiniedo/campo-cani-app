// Legge i bonifici in entrata sul tuo conto (Enable Banking, solo lettura), li abbina agli addebiti dei centri
// e rinnova la licenza di chi ha pagato. La usano controlla-bonifici (pg_cron ogni 6 ore) e il pannello.

import { allungaLicenza } from './addebiti.ts';
import { accredito, enableBanking } from './banca.ts';
import { db, messaggio, oggi, type Centro } from './comune.ts';
import { abbina, piuGiorni, type Accredito } from './costi.ts';

/** Segna pagati gli addebiti e allunga la licenza del centro (se non deve altro). */
export async function segnaPagati(centro: string, addebiti: string[], giorno = oggi()) {
  if (!addebiti.length) return;
  await db.from('addebiti').update({ stato: 'pagato', errore: '', pagato_il: giorno }).in('id', addebiti);
  const { data: c } = await db.from('centri').select('*').eq('id', centro).single();
  if (c) await allungaLicenza(c as Centro);
}

/** Gli addebiti scaduti e non pagati passano a "non pagato": la licenza intanto è scaduta da sola. */
async function scaduti() {
  await db.from('addebiti').update({ stato: 'non_pagato' }).eq('stato', 'inviato').is('fattura', null).lt('scadenza', oggi());
}

type Esito = { letti: number; nuovi: number; abbinati: number; non_riconosciuti: number };

export async function controllaBonifici(): Promise<Esito> {
  const { data: b } = await db.from('banca').select('*').eq('id', 1).single();
  const esito: Esito = { letti: 0, nuovi: 0, abbinati: 0, non_riconosciuti: 0 };
  try {
    if (!b?.conto) throw new Error('Conto non collegato: collegalo dal pannello (Banca).');
    if (b.valido_fino && new Date(b.valido_fino) < new Date()) throw new Error('Il permesso di leggere il conto è scaduto: ricollega la banca dal pannello.');
    // Qualche giorno indietro: le banche a volte contabilizzano tardi.
    const da = piuGiorni(b.ultimo_controllo ? oggi(new Date(b.ultimo_controllo)) : piuGiorni(oggi(), -30), -3);
    const letti: Accredito[] = [];
    const date: Record<string, string> = {};
    let chiave: string | undefined;
    for (let pagine = 0; pagine < 50; pagine++) {
      const q = new URLSearchParams({ date_from: da });
      if (chiave) q.set('continuation_key', chiave);
      const r = await enableBanking('GET', `/accounts/${encodeURIComponent(b.conto)}/transactions?${q}`);
      for (const m of r.transactions ?? []) {
        const a = accredito(m);
        if (a) {
          letti.push(a);
          date[a.id] = a.data || oggi();
        }
      }
      chiave = r.continuation_key || undefined;
      if (!chiave) break;
    }
    esito.letti = letti.length;

    const ids = [...new Set(letti.map((a) => a.id))];
    const visti = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db.from('movimenti').select('id').in('id', ids.slice(i, i + 200));
      for (const r of data ?? []) visti.add(r.id);
    }
    const nuovi = letti.filter((a) => !visti.has(a.id) && (visti.add(a.id), true));
    esito.nuovi = nuovi.length;
    await db.from('banca').update({ ultimo_controllo: new Date().toISOString(), errore: '' }).eq('id', 1);
    if (!nuovi.length) return esito;

    const [{ data: centri }, { data: aperti }] = await Promise.all([
      db.from('centri').select('id, codice, iban'),
      db.from('addebiti').select('id, centro, mese, importo_cents').in('stato', ['inviato', 'non_pagato']).is('fattura', null).gt('importo_cents', 0),
    ]);
    let ancora = aperti ?? [];
    for (const a of nuovi) {
      const x = abbina(a, centri ?? [], ancora);
      ancora = ancora.filter((y) => !x.addebiti.includes(y.id));
      // Gli altri accrediti del tuo conto (stipendio, rimborsi...) non si salvano: solo quelli di un centro.
      if (!x.centro && !/K9/i.test(a.causale + ' ' + a.nome)) continue;
      await db.from('movimenti').insert({ id: a.id, data: date[a.id], importo_cents: a.importo_cents, iban: a.iban, nome: a.nome, causale: a.causale, centro: x.centro, addebiti: x.addebiti });
      if (x.centro && x.addebiti.length) {
        esito.abbinati++;
        await segnaPagati(x.centro, x.addebiti, date[a.id]);
      } else esito.non_riconosciuti++;
    }
    return esito;
  } catch (e) {
    await db.from('banca').update({ errore: messaggio(e) }).eq('id', 1);
    throw e;
  } finally {
    await scaduti();
  }
}
