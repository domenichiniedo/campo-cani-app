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

/** Cambia piano e formula da oggi, con la licenza nuova se il piano è cambiato. */
async function subito(c: Centro, piano: Piano, formula: Formula, da: 'app' | 'pannello'): Promise<Centro> {
  if (c.piano === piano && c.formula === formula) return c;
  const nuovo = { ...c, piano, formula };
  const licenza = c.piano !== piano && c.stato === 'pronto' && c.scade ? await rinnova(nuovo, ambiente(), c.scade) : {};
  await db.from('centri').update({ piano, formula, ...licenza }).eq('id', c.id);
  await db.from('cambi_piano').insert({ centro: c.id, piano, formula, dal: oggi(), da });
  return { ...nuovo, ...licenza };
}

/**
 * Cambia il piano del centro, o come lo paga (a consumo o fisso): lo segna per l'addebito (canone e quote si
 * dividono a giorni). Con un piano nuovo firma anche una licenza nuova con la stessa scadenza, che l'app prende
 * perché è più recente.
 * Dall'app un piano superiore vale da oggi; un piano più piccolo e il passaggio fra consumo e fisso partono dal
 * primo del mese dopo (li applica addebito-mensile). Una nuova scelta annulla quella già prenotata. Dal pannello
 * tutto vale da oggi.
 */
export async function cambiaPiano(c: Centro, piano: Piano, da: 'app' | 'pannello', formula: Formula = c.formula): Promise<Centro> {
  const g = oggi();
  if (c.piano_prossimo || c.formula_prossima) {
    await db.from('cambi_piano').delete().eq('centro', c.id).gt('dal', g);
    await db.from('centri').update({ piano_prossimo: null, formula_prossima: null }).eq('id', c.id);
    c = { ...c, piano_prossimo: null, formula_prossima: null };
  }
  if (da === 'pannello') return await subito(c, piano, formula, da);
  // Un piano superiore subito, con la formula di adesso.
  if (piuPiccolo(c.piano, piano)) c = await subito(c, piano, c.formula, da);
  if (c.piano === piano && c.formula === formula) return c;
  await db.from('cambi_piano').insert({ centro: c.id, piano, formula, dal: primoDelMeseDopo(g), da });
  const prossimi = { piano_prossimo: piano !== c.piano ? piano : null, formula_prossima: formula !== c.formula ? formula : null };
  await db.from('centri').update(prossimi).eq('id', c.id);
  return { ...c, ...prossimi };
}

/**
 * Il primo del mese: i centri con un piano più piccolo o una formula prenotati ci passano, con la licenza nuova
 * se cambia il piano (cambi_piano ha già la riga dal primo del mese, per l'addebito).
 */
export async function applicaCambiPrenotati() {
  const g = oggi();
  const { data } = await db.from('centri').select('*').or('piano_prossimo.not.is.null,formula_prossima.not.is.null');
  for (const c of (data ?? []) as Centro[]) {
    const { data: ultimo } = await db
      .from('cambi_piano')
      .select('piano, formula')
      .eq('centro', c.id)
      .lte('dal', g)
      .order('dal', { ascending: false })
      .order('creato', { ascending: false })
      .limit(1)
      .maybeSingle();
    const piano = c.piano_prossimo ?? c.piano;
    const formula = c.formula_prossima ?? c.formula;
    if (ultimo?.piano !== piano || ultimo?.formula !== formula) continue;
    const nuovo = { ...c, piano, formula, piano_prossimo: null, formula_prossima: null };
    const licenza = piano !== c.piano && c.stato === 'pronto' && c.scade ? await rinnova(nuovo, ambiente(), c.scade) : {};
    await db.from('centri').update({ piano, formula, piano_prossimo: null, formula_prossima: null, ...licenza }).eq('id', c.id);
  }
}
