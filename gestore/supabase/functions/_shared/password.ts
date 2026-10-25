// Il pannello cambia la password di chi entra in un centro: il titolare, un trainer o un cliente.
// Scrive solo la password nuova nel database del centro (mai quella vecchia, che nessuno può leggere)
// e chiude gli accessi aperti, così chi la conosceva prima deve rientrare con quella nuova.

import { lit, type Api } from './supabase-api.ts';

const LETTERE = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Una password da dettare a voce: 12 caratteri, senza quelli che si confondono (0/O, 1/l/I). */
export function passwordNuova() {
  const n = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(n, (x) => LETTERE[x % LETTERE.length]).join('');
}

/** Errore da mostrare, o null se la password va bene. */
export function passwordNonValida(p: string) {
  if (p.length < 8) return 'La password deve avere almeno 8 caratteri.';
  if (new TextEncoder().encode(p).length > 72) return 'La password è troppo lunga (al massimo 72 caratteri).';
  return null;
}

/** Cambia la password dell'utente con questa email nel progetto del centro. Ritorna il suo ruolo nel centro. */
export async function cambiaPassword(api: Api, progetto: string, email: string, password: string) {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error("Scrivi l'email di chi deve entrare.");
  const no = passwordNonValida(password);
  if (no) throw new Error(no);
  const righe = (await api('POST', `/projects/${progetto}/database/query`, {
    query: `with u as (
  update auth.users set encrypted_password = extensions.crypt(${lit(password)}, extensions.gen_salt('bf')), updated_at = now()
  where lower(email) = ${lit(e)} and deleted_at is null
  returning id
), fuori as (
  delete from auth.sessions where user_id in (select id from u)
)
select (select count(*) from u)::int as trovati, (select p.role from public.profiles p where p.id in (select id from u) limit 1) as ruolo;`,
  })) as { trovati: number; ruolo: string | null }[];
  if (!righe?.[0]?.trovati) throw new Error('In questo centro non c\'è nessuno con questa email.');
  return righe[0].ruolo ?? 'client';
}
