-- Campo Cani: del cane anche il numero di microchip (facoltativo ma consigliato), maschio o femmina, se è
-- sterilizzato e una nota del cliente su obiettivi e situazione attuale, che leggono il centro e i trainer.
-- E la penalità automatica: se a lezione finita nessuno ha fatto entrare il cane in campo, è un'assenza.
-- Da eseguire nel SQL Editor di Supabase dopo 0022_voto_lezioni.sql.

-- 15 cifre (ISO 11784), vuoto se il cliente non lo mette.
alter table public.dogs add column chip text not null default '' check (chip = '' or chip ~ '^[0-9]{15}$');
alter table public.dogs add column goals text not null default '' check (length(goals) <= 500);
-- M o F, vuoto se non detto; sterilizzato: null se non detto.
alter table public.dogs add column sex text not null default '' check (sex in ('', 'M', 'F'));
alter table public.dogs add column neutered boolean;

-- L'iscrizione lo legge dai cani mandati dall'app: handle_new_user è in 0024_clienti_societa.sql.

-- ---------------------------------------------------------------
-- Penalità automatica se il cane non entra in campo
-- ---------------------------------------------------------------
-- Il trainer o il proprietario fanno entrare il cane ("Fai entrare in campo"). Un'ora dopo la fine della lezione,
-- se non è entrato, il cliente ha la penalità "Assenza senza disdetta". Il proprietario la spegne dalle Impostazioni.
alter table public.settings add column noshow_penalty boolean not null default true;
-- Valgono solo le lezioni da adesso in poi: quelle di prima non avevano l'obbligo di entrare.
alter table public.settings add column noshow_since timestamptz not null default now();
-- Già controllata: la penalità si dà una volta sola e, se il trainer la toglie, non torna.
alter table public.bookings add column noshow_done boolean not null default false;
create index bookings_noshow on public.bookings (day) where status = 'active' and not noshow_done and checked_in_at is null;

create function public.penalize_no_shows() returns int
language plpgsql security definer set search_path = public as $$
declare
  s public.settings;
  n int;
begin
  select * into s from public.settings where id = 1;
  if s.id is null or not s.noshow_penalty then return 0; end if;
  with fatte as (
    update public.bookings b set noshow_done = true
    where b.status = 'active' and not b.noshow_done and b.checked_in_at is null
      and (b.day + make_interval(mins => b.start_min)) >= (s.noshow_since at time zone 'Europe/Rome')
      and (b.day + make_interval(mins => b.start_min + b.dur_min + 60)) < (now() at time zone 'Europe/Rome')
    returning b.id, b.dog_id
  )
  insert into public.penalties (dog_id, booking_id, reason)
  select f.dog_id, f.id, 'Assenza senza disdetta' from fatte f
  where not exists (select 1 from public.penalties p where p.booking_id = f.id);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.penalize_no_shows() from public, anon;
-- La chiama l'app di chiunque entri (clienti, trainer, proprietario): fa sempre e solo questo controllo.
grant execute on function public.penalize_no_shows() to authenticated;

-- Il cane fatto entrare dopo (per esempio entro l'ora): l'assenza automatica di quella lezione si toglie da sola.
create function public.checked_in_clears_no_show() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.penalties where booking_id = new.id and reason = 'Assenza senza disdetta';
  return new;
end $$;
create trigger bookings_checked_in_clears_no_show after update of checked_in_at on public.bookings
  for each row when (new.checked_in_at is not null and old.checked_in_at is null and new.noshow_done)
  execute function public.checked_in_clears_no_show();
