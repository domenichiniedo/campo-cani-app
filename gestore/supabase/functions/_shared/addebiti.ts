// Dopo un addebito pagato (o un mese senza prenotazioni) la licenza del centro si allunga fino alla fine
// del mese dopo. Se l'addebito non va a buon fine la licenza non si rinnova e scade da sola: circa un mese di tolleranza.
// Un centro sospeso dal pannello non si rinnova, se non a mano (forza).
import { db, env, oggi, type Centro } from './comune.ts';
import { fineMese } from './licenza.ts';
import { rinnova, type Ambiente } from './passi.ts';
import { managementApi } from './supabase-api.ts';

/** Quanto serve per firmare e scrivere le licenze (non per creare progetti). */
export const ambiente = (): Ambiente => ({ api: managementApi, seme: env('LICENZA_SERVER_PRIVATA'), org: '', regione: '', oggi: oggi(), password: () => '', smtp: null });

export async function allungaLicenza(c: Centro, forza = false) {
  if (c.sospeso && !forza) return;
  const a = ambiente();
  const modifiche = await rinnova(c, a, fineMese(a.oggi, 1));
  await db.from('centri').update(modifiche).eq('id', c.id);
}
