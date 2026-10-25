// Ogni 6 ore (pg_cron, con x-webhook-secret) legge i bonifici in entrata sul tuo conto, riconosce quelli dei
// centri (codice K9-XXXXXX nella causale o IBAN del centro), segna pagati gli addebiti e rinnova le licenze.
// Gli addebiti con la scadenza passata diventano "non pagato": la licenza è già scaduta e l'app del centro è
// bloccata finché il bonifico non arriva.
// Ricontrolla anche i bonifici delle lezioni pagate dall'app rimasti in sospeso, e segna pagate quelle partite.

import { controllaBonifici } from '../_shared/bonifici.ts';
import { daCron, json, messaggio } from '../_shared/comune.ts';
import { controllaLezioni } from '../_shared/lezioni.ts';
import { pagaOraSpento } from '../_shared/paga.ts';

Deno.serve(async (req) => {
  if (!daCron(req)) return json({ errore: 'Non autorizzato.' }, 401);
  const lezioni = pagaOraSpento() ? 0 : await controllaLezioni().catch((e) => (console.error(`lezioni: ${messaggio(e)}`), 0));
  try {
    return json({ ...(await controllaBonifici()), lezioni });
  } catch (e) {
    console.error(messaggio(e));
    return json({ errore: messaggio(e) }, 502);
  }
});
