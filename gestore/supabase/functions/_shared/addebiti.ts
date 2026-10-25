// Dopo un addebito pagato (o un mese senza niente da pagare) la licenza del centro si allunga fino a pochi giorni
// dopo l'addebito del mese dopo (GIORNI_PER_PAGARE, 3 di solito). Se il centro non paga entro quel giorno la
// licenza scade e l'app si blocca, finché il pagamento non arriva.
// Un centro sospeso dal pannello non si rinnova, se non a mano (forza).
import { db, env, oggi, type Centro } from './comune.ts';
import { giorniPerPagare, piuPiccolo, primoDelMeseDopo, scadenzaLicenza, type Cambio, type Formula, type Piano, type Prezzi } from './costi.ts';
import { rinnova, type Ambiente } from './passi.ts';
import { managementApi } from './supabase-api.ts';

/** Quanto serve per firmare e scrivere le licenze (non per creare progetti). */
export const ambiente = (): Ambiente => ({ api: managementApi, seme: env('LICENZA_SERVER_PRIVATA'), org: '', regione: '', oggi: oggi(), password: () => '', smtp: null, sms: null });

/** Quanti addebiti il centro deve ancora pagare. */
export async function debiti(c: Centro) {
  const { count } = await db
    .from('addebiti')
    .select('id', { count: 'exact', head: true })
    .eq('centro', c.id)
    .in('stato', ['inviato', 'non_pagato'])
    .gt('importo_cents', 0);
  return count ?? 0;
}

export async function allungaLicenza(c: Centro, forza = false) {
  if (c.sospeso && !forza) return;
  // Disdetto e finito il servizio: la licenza arriva alla sua fine e non si rinnova più.
  if (c.disdetta && c.disdetta < oggi() && !forza) return;
  // Con un altro mese ancora da pagare la licenza resta com'è.
  if (!forza && (await debiti(c)) > 0) return;
  const a = ambiente();
  const modifiche = await rinnova(c, a, scadenzaLicenza(a.oggi, giorniPerPagare()));
  await db.from('centri').update(modifiche).eq('id', c.id);
}

export async function prezzi(): Promise<Prezzi> {
  const { data } = await db.from('piani').select('*');
  // I prezzi di partenza (0004_prezzi.sql e 0006_fisso_pacchetti.sql), se la tabella non li ha.
  const p: Prezzi = {
    base: { canone_cents: 590, tariffa_cents: 100, fisso_cents: 3900, pacchetti_bp: 200 },
    professional: { canone_cents: 2999, tariffa_cents: 60, fisso_cents: 7900, pacchetti_bp: 200 },
    pro: { canone_cents: 8000, tariffa_cents: 30, fisso_cents: 14900, pacchetti_bp: 200 },
  };
  for (const r of data ?? []) {
    const x = p[r.piano as Piano];
    p[r.piano as Piano] = { canone_cents: r.canone_cents, tariffa_cents: r.tariffa_cents, fisso_cents: r.fisso_cents ?? x.fisso_cents, pacchetti_bp: r.pacchetti_bp ?? x.pacchetti_bp };
  }
  return p;
}

export async function cambi(centro: string): Promise<Cambio[]> {
  const { data } = await db.from('cambi_piano').select('piano, dal, formula').eq('centro', centro).order('dal').order('creato');
  return (data ?? []) as Cambio[];
}

/**
 * Cambia il piano del centro, o come lo paga (a consumo o fisso), da oggi: lo segna per l'addebito (canone e
 * quote si dividono a giorni). Con un piano nuovo firma anche una licenza nuova con la stessa scadenza, che
 * l'app prende perché è più recente.
 * Dall'app un piano più piccolo parte dal primo del mese dopo (lo applica addebito-mensile): fino ad allora resta
 * quello di prima. Una nuova scelta annulla il passaggio già prenotato.
 */
export async function cambiaPiano(c: Centro, piano: Piano, da: 'app' | 'pannello', formula: Formula = c.formula): Promise<Centro> {
  const g = oggi();
  if (c.piano_prossimo) {
    await db.from('cambi_piano').delete().eq('centro', c.id).gt('dal', g);
    await db.from('centri').update({ piano_prossimo: null }).eq('id', c.id);
    c = { ...c, piano_prossimo: null };
  }
  if (da === 'app' && piuPiccolo(piano, c.piano)) {
    if (formula !== c.formula) {
      await db.from('centri').update({ formula }).eq('id', c.id);
      await db.from('cambi_piano').insert({ centro: c.id, piano: c.piano, formula, dal: g, da });
    }
    await db.from('cambi_piano').insert({ centro: c.id, piano, formula, dal: primoDelMeseDopo(g), da });
    await db.from('centri').update({ piano_prossimo: piano }).eq('id', c.id);
    return { ...c, formula, piano_prossimo: piano };
  }
  if (c.piano === piano && c.formula === formula) return c;
  const nuovo = { ...c, piano, formula };
  const licenza = c.piano !== piano && c.stato === 'pronto' && c.scade ? await rinnova(nuovo, ambiente(), c.scade) : {};
  await db.from('centri').update({ piano, formula, ...licenza }).eq('id', c.id);
  await db.from('cambi_piano').insert({ centro: c.id, piano, formula, dal: oggi(), da });
  return { ...nuovo, ...licenza };
}

/**
 * Il primo del mese: i centri con un piano più piccolo prenotato ci passano, con la licenza nuova (cambi_piano
 * ha già la riga dal primo del mese, per l'addebito).
 */
export async function applicaCambiPrenotati() {
  const g = oggi();
  const { data } = await db.from('centri').select('*').not('piano_prossimo', 'is', null);
  for (const c of (data ?? []) as Centro[]) {
    const { data: ultimo } = await db.from('cambi_piano').select('piano').eq('centro', c.id).lte('dal', g).order('dal', { ascending: false }).order('creato', { ascending: false }).limit(1).maybeSingle();
    if (ultimo?.piano !== c.piano_prossimo) continue;
    const nuovo = { ...c, piano: c.piano_prossimo!, piano_prossimo: null };
    const licenza = c.stato === 'pronto' && c.scade ? await rinnova(nuovo, ambiente(), c.scade) : {};
    await db.from('centri').update({ piano: nuovo.piano, piano_prossimo: null, ...licenza }).eq('id', c.id);
  }
}
