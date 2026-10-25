// Un centro si registra dall'app: nome, email del titolare, piano e (se vuole) l'IBAN da cui pagherà. Riceve il suo
// codice (K9-XXXXXX) e il gestore prepara subito il database. Ogni mese il centro ti paga con un bonifico istantaneo
// sul tuo conto e il gestore lo trova da solo; l'IBAN del centro aiuta a riconoscerlo anche senza causale.
// Si chiama senza accesso (chi si registra non ha ancora un account): per questo i limiti qui sotto.

import { db, env, json, oggi, preflight, sveglia } from '../_shared/comune.ts';
import { ibanValido } from '../_shared/costi.ts';

const PIANI = ['base', 'professional', 'pro'];
// Senza lettere e cifre che si confondono (0/O, 1/I/L).
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function nuovoCodice() {
  const r = crypto.getRandomValues(new Uint8Array(6));
  return `K9-${[...r].map((b) => ALFABETO[b % ALFABETO.length]).join('')}`;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ errore: 'Usa POST.' }, 405);
  const body = await req.json().catch(() => ({}));
  const campo = String(body.campo ?? '').trim().slice(0, 80);
  const email = String(body.email ?? '').trim().toLowerCase();
  const piano = String(body.piano ?? '');
  if (campo.length < 2) return json({ errore: 'Scrivi il nome del centro.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ errore: 'Email non valida.' }, 400);
  if (!PIANI.includes(piano)) return json({ errore: 'Scegli il piano.' }, 400);
  const iban = String(body.iban ?? '').toUpperCase().replace(/\s/g, '');
  if (iban && !ibanValido(iban)) return json({ errore: 'IBAN non valido.' }, 400);

  // Ogni centro costa un progetto Supabase: si limita chi prova a registrarne tanti.
  const giorno = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count: stessaEmail } = await db.from('centri').select('id', { count: 'exact', head: true }).eq('email', email).gte('creato', giorno);
  const { count: tutti } = await db.from('centri').select('id', { count: 'exact', head: true }).gte('creato', giorno);
  if ((stessaEmail ?? 0) >= 3) return json({ errore: 'Hai già registrato dei centri oggi con questa email. Riprova domani.' }, 429);
  if ((tutti ?? 0) >= Number(env('MAX_CENTRI_AL_GIORNO') || 20)) return json({ errore: 'Troppe registrazioni oggi. Riprova domani.' }, 429);

  let centro: { id: string; codice: string } | null = null;
  for (let i = 0; i < 5 && !centro; i++) {
    // Canone e quota per prenotazione: quelli del piano (tabella piani), finché non ne fai di apposta dal pannello.
    const { data, error } = await db
      .from('centri')
      .insert({ codice: nuovoCodice(), campo, email, piano, iban, stato: 'progetto' })
      .select('id, codice')
      .single();
    if (data) centro = data;
    else if (error?.code !== '23505') return json({ errore: error?.message ?? 'Registrazione non riuscita.' }, 500);
  }
  if (!centro) return json({ errore: 'Registrazione non riuscita, riprova.' }, 500);
  await db.from('cambi_piano').insert({ centro: centro.id, piano, dal: oggi(), da: 'registrazione' });

  sveglia();
  return json({ codice: centro.codice });
});
