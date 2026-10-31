// Il link (e il QR code) che un centro dà ai suoi clienti e trainer: https://<ref>.supabase.co/functions/v1/invito?codice=K9-XXXXXX
// Su Android apre l'app già collegata al centro; se l'app non c'è porta a scaricarla (Google Play, o APP_ANDROID_LINK),
// e dopo l'installazione basta aprire di nuovo il link. Altrove risponde con il codice del centro da scrivere nell'app.
// Supabase mostra le pagine delle funzioni come testo semplice: per questo niente HTML.

import { db, env } from '../_shared/comune.ts';
import { daAndroid, intentAndroid, linkPlay } from '../_shared/invito.ts';

const testo = (s: string, status = 200) => new Response(s, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

Deno.serve(async (req) => {
  const codice = String(new URL(req.url).searchParams.get('codice') ?? '').trim().toUpperCase().replace(/^K9(?!-)/, 'K9-');
  if (!/^K9-[A-Z0-9]{6}$/.test(codice)) return testo('Codice del centro non valido.', 400);
  const { data: c } = await db.from('centri').select('campo, stato').eq('codice', codice).maybeSingle();
  if (!c) return testo('Nessun centro con questo codice.', 404);

  const pacchetto = env('APP_ANDROID_ID') || 'it.campocani.app';
  const scarica = env('APP_ANDROID_LINK') || linkPlay(pacchetto, codice);
  if (daAndroid(req.headers.get('user-agent') ?? '')) {
    return new Response(null, { status: 302, headers: { Location: intentAndroid(pacchetto, codice, scarica), 'Cache-Control': 'no-store' } });
  }
  return testo(
    `${c.campo}\n\nScarica l'app Club Manager e, alla prima apertura, scrivi il codice del centro:\n\n${codice}\n\nPer Android: ${scarica}\n`,
  );
});
