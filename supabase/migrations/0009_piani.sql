-- Campo Cani: piani Base, Professional e Pro dell'app venduta.
-- Il piano e il numero massimo di clienti stanno nella licenza firmata; qui serve solo
-- sapere quanti clienti ha il centro, anche prima di accedere (al momento dell'iscrizione).
-- Da eseguire nel SQL Editor di Supabase dopo 0008_licenza.sql.

create function public.client_count() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.profiles where role = 'client'
$$;
grant execute on function public.client_count() to anon, authenticated;
