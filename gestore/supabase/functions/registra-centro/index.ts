// Un centro si registra dall'app: nome, email del titolare, piano, dati per la fattura e l'IBAN da cui pagherà (obbligatorio). Riceve il suo
// codice (K9-XXXXXX) e il gestore prepara subito il database. Ogni mese il centro ti paga con un bonifico istantaneo
// sul tuo conto e il gestore lo trova da solo; l'IBAN del centro aiuta a riconoscerlo anche senza causale.
// Si chiama senza accesso (chi si registra non ha ancora un account): per questo i limiti qui sotto.

import { db, env, json, oggi, preflight, sveglia } from '../_shared/comune.ts';
import { ibanValido } from '../_shared/costi.ts';
import { leggiFatturazione } from '../_shared/fatturazione.ts';

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
  // A consumo (canone + quota per prenotazione) o a prezzo fisso al mese.
  const formula = String(body.formula ?? 'consumo');
  if (formula !== 'consumo' && formula !== 'fisso') return json({ errore: 'Scegli a consumo o fisso.' }, 400);
  const iban = String(body.iban ?? '').toUpperCase().replace(/\s/g, '');
  if (!iban) return json({ errore: "Scrivi l'IBAN da cui paghi il piano." }, 400);
  if (!ibanValido(iban)) return json({ errore: 'IBAN non valido.' }, 400);
  // Ragione sociale, partita IVA o codice fiscale, sede e SDI o PEC: per fatturargli canone e prenotazioni.
  const fattura = leggiFatturazione(body.fattura);
  if ('errore' in fattura) return json({ errore: fattura.errore }, 400);
  // Codice bonus (facoltativo): si controlla prima, così chi lo sbaglia lo corregge prima di registrarsi.
  const bonus = String(body.bonus ?? '').trim().toUpperCase();
  if (bonus) {
    const { data: b } = await db.from('codici_bonus').select('attivo, scade, usi_max, usati').eq('codice', bonus).maybeSingle();
    if (!b || !b.attivo || (b.scade && b.scade < oggi()) || (b.usi_max !== null && b.usati >= b.usi_max))
      return json({ errore: 'Codice bonus non valido o scaduto. Correggilo o lascialo vuoto.' }, 400);
  }

  // Ogni centro costa un progetto Supabase: si limita chi prova a registrarne tanti.
  const giorno = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count: stessaEmail } = await db.from('centri').select('id', { count: 'exact', head: true }).eq('email', email).gte('creato', giorno);
  const { count: tutti } = await db.from('centri').select('id', { count: 'exact', head: true }).gte('creato', giorno);
  if ((stessaEmail ?? 0) >= 3) return json({ errore: 'Hai già registrato dei centri oggi con questa email. Riprova domani.' }, 429);
  if ((tutti ?? 0) >= Number(env('MAX_CENTRI_AL_GIORNO') || 20)) return json({ errore: 'Troppe registrazioni oggi. Riprova domani.' }, 429);

  let centro: { id: string; codice: string } | null = null;
  for (let i = 0; i < 5 && !centro; i++) {
    // Canone, quota per prenotazione e fisso: quelli del piano (tabella piani), finché non ne fai di apposta dal pannello.
    const { data, error } = await db
      .from('centri')
      .insert({ codice: nuovoCodice(), campo, email, piano, formula, iban, ...fattura.dati, stato: 'progetto' })
      .select('id, codice')
      .single();
    if (data) centro = data;
    else if (error?.code !== '23505') return json({ errore: error?.message ?? 'Registrazione non riuscita.' }, 500);
  }
  if (!centro) return json({ errore: 'Registrazione non riuscita, riprova.' }, 500);
  await db.from('cambi_piano').insert({ centro: centro.id, piano, formula, dal: oggi(), da: 'registrazione' });
  const { data: credito } = bonus ? await db.rpc('usa_codice_bonus', { p_codice: bonus, p_centro: centro.id }) : { data: 0 };

  sveglia();
  return json({ codice: centro.codice, bonus_cents: Number(credito) || 0 });
});
