// Prepara i database dei centri che hanno firmato il mandato, e aggiunge a quelli pronti le migrazioni nuove.
// La chiama pg_cron ogni minuto, con x-webhook-secret.
// Ogni giro lavora al massimo un minuto e mezzo; quello che resta lo fa il giro dopo.

import { daCron, db, env, json, messaggio, oggi, type Centro } from '../_shared/comune.ts';
import { MIGRAZIONI } from '../_shared/migrazioni.ts';
import { passo, type Ambiente } from '../_shared/passi.ts';
import { managementApi } from '../_shared/supabase-api.ts';

const TENTATIVI = 8;
const LIMITE_MS = 90_000;

const password = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18)))).replace(/[+/=]/g, 'x');

Deno.serve(async (req) => {
  if (!daCron(req)) return json({ errore: 'Non autorizzato.' }, 401);
  const inizio = Date.now();
  const ambiente: Ambiente = {
    api: managementApi,
    seme: env('LICENZA_SERVER_PRIVATA'),
    org: env('ORGANIZZAZIONE_SUPABASE'),
    regione: env('REGIONE_SUPABASE') || 'eu-central-1',
    oggi: oggi(),
    password,
    smtp: env('SMTP_HOST')
      ? { host: env('SMTP_HOST'), port: env('SMTP_PORT') || '587', user: env('SMTP_USER'), pass: env('SMTP_PASS'), from: env('SMTP_FROM') }
      : null,
    sms: env('TWILIO_ACCOUNT_SID')
      ? { sid: env('TWILIO_ACCOUNT_SID'), token: env('TWILIO_AUTH_TOKEN'), servizio: env('TWILIO_MESSAGE_SERVICE_SID') }
      : null,
    google: env('GOOGLE_CLIENT_ID')
      ? { id: env('GOOGLE_CLIENT_ID'), segreto: env('GOOGLE_CLIENT_SECRET'), altri: env('GOOGLE_ALTRI_CLIENT_ID') }
      : null,
    prova: env('PROVA') === '1',
  };
  const { data, error } = await db.rpc('prendi_centri', { p_quanti: 3, p_migrazioni: MIGRAZIONI.length });
  if (error) return json({ errore: error.message }, 500);
  const fatti: Record<string, string> = {};
  for (let c of (data ?? []) as Centro[]) {
    // Si va avanti con lo stesso centro finché c'è qualcosa da fare (l'attesa dell'avvio passa al giro dopo).
    while (Date.now() - inizio < LIMITE_MS) {
      let modifiche: Partial<Centro>;
      try {
        const p = await passo(c, ambiente);
        const avanza = p.stato !== undefined && p.stato !== c.stato;
        modifiche = { ...p, errore: '', ...(avanza ? { tentativi: 0 } : {}) };
      } catch (e) {
        const tentativi = c.tentativi + 1;
        modifiche = { errore: messaggio(e), tentativi, ...(tentativi >= TENTATIVI ? { stato: 'errore' as const } : {}) };
        console.error(`${c.codice} (${c.stato}): ${modifiche.errore}`);
      }
      await db.from('centri').update(modifiche).eq('id', c.id);
      const avanti = Object.keys(modifiche).some((k) => !['errore', 'tentativi'].includes(k));
      c = { ...c, ...modifiche };
      if (!avanti || modifiche.errore || (c.stato === 'pronto' && c.migrazioni >= MIGRAZIONI.length)) break;
    }
    await db.from('centri').update({ occupato_fino: null }).eq('id', c.id);
    fatti[c.codice] = c.errore ? `${c.stato}: ${c.errore}` : c.stato;
  }
  return json({ centri: fatti });
});
