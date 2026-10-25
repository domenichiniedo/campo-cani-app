// Dopo un addebito pagato (o un mese senza niente da pagare) la licenza del centro si allunga fino a pochi giorni
// dopo l'addebito del mese dopo (GIORNI_PER_PAGARE, 3 di solito). Se il centro non paga entro quel giorno la
// licenza scade e l'app si blocca, finché il pagamento non arriva.
// Un centro sospeso dal pannello non si rinnova, se non a mano (forza).
import { db, env, oggi, type Centro } from './comune.ts';
import { giorniPerPagare, scadenzaLicenza, type Cambio, type Piano, type Prezzi } from './costi.ts';
import { rinnova, type Ambiente } from './passi.ts';
import { managementApi } from './supabase-api.ts';

/** Quanto serve per firmare e scrivere le licenze (non per creare progetti). */
export const ambiente = (): Ambiente => ({ api: managementApi, seme: env('LICENZA_SERVER_PRIVATA'), org: '', regione: '', oggi: oggi(), password: () => '', smtp: null, sms: null });

/** Quanti addebiti il centro deve ancora pagare. */
async function debiti(c: Centro) {
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
  // Con un altro mese ancora da pagare la licenza resta com'è.
  if (!forza && (await debiti(c)) > 0) return;
  const a = ambiente();
  const modifiche = await rinnova(c, a, scadenzaLicenza(a.oggi, giorniPerPagare()));
  await db.from('centri').update(modifiche).eq('id', c.id);
}

export async function prezzi(): Promise<Prezzi> {
  const { data } = await db.from('piani').select('*');
  // I prezzi di partenza (0004_prezzi.sql), se la tabella non li ha.
  const p: Prezzi = {
    base: { canone_cents: 590, tariffa_cents: 100 },
    professional: { canone_cents: 2999, tariffa_cents: 60 },
    pro: { canone_cents: 8000, tariffa_cents: 30 },
  };
  for (const r of data ?? []) p[r.piano as Piano] = { canone_cents: r.canone_cents, tariffa_cents: r.tariffa_cents };
  return p;
}

export async function cambi(centro: string): Promise<Cambio[]> {
  const { data } = await db.from('cambi_piano').select('piano, dal').eq('centro', centro).order('dal').order('creato');
  return (data ?? []) as Cambio[];
}

/**
 * Cambia il piano del centro da oggi: lo segna per l'addebito (canone e quote si dividono a giorni) e firma
 * una licenza nuova con il piano nuovo e la stessa scadenza, che l'app prende perché è più recente.
 */
export async function cambiaPiano(c: Centro, piano: Piano, da: 'app' | 'pannello'): Promise<Centro> {
  if (c.piano === piano) return c;
  const nuovo = { ...c, piano };
  const licenza = c.stato === 'pronto' && c.scade ? await rinnova(nuovo, ambiente(), c.scade) : {};
  await db.from('centri').update({ piano, ...licenza }).eq('id', c.id);
  await db.from('cambi_piano').insert({ centro: c.id, piano, dal: oggi(), da });
  return { ...nuovo, ...licenza };
}
