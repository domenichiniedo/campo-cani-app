-- Campo Cani: la bacheca del centro (comunicazioni ed eventi) e le spese.
-- Bacheca: il proprietario scrive avvisi per i clienti (quelli importanti stanno in evidenza nella pagina Prenota) ed
-- eventi con giorno, ora, luogo e posti; il cliente li legge in app e per gli eventi preme "Partecipo". Il
-- proprietario vede quanti hanno letto un avviso e chi partecipa a un evento.
-- Spese: le uscite del centro (affitto, utenze, attrezzatura...), che vede solo il proprietario; nella pagina Incassi
-- si tolgono dall'incassato per il saldo del periodo.
-- Da eseguire nel SQL Editor di Supabase dopo 0025_tesseramento.sql.

-- ---------------------------------------------------------------
-- Bacheca
-- ---------------------------------------------------------------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'avviso' check (kind in ('avviso', 'evento')),
  title text not null check (length(trim(title)) between 1 and 120),
  body text not null default '' check (length(body) <= 4000),
  -- Avviso importante: in evidenza nella pagina Prenota finché il cliente non lo legge.
  important boolean not null default false,
  -- Solo per gli eventi: giorno, ora d'inizio (minuti dalla mezzanotte), luogo e posti (null: senza limite).
  event_day date,
  event_start int check (event_start between 0 and 1439),
  place text not null default '' check (length(place) <= 200),
  seats int check (seats > 0),
  -- Dopo questo giorno l'avviso non si vede più ai clienti; null: resta. Un evento sparisce dopo il suo giorno.
  visible_until date,
  created_at timestamptz not null default now(),
  check (kind <> 'evento' or event_day is not null)
);
create index on public.posts (created_at desc);

-- Chi partecipa a un evento.
create table public.post_rsvps (
  post_id uuid not null references public.posts on delete cascade,
  user_id uuid not null references public.profiles on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- Chi ha letto un avviso: per toglierlo dall'evidenza e per dire al proprietario quanti l'hanno visto.
create table public.post_reads (
  post_id uuid not null references public.posts on delete cascade,
  user_id uuid not null references public.profiles on delete cascade default auth.uid(),
  read_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- "Partecipo": solo agli eventi non ancora passati e con posti liberi.
create function public.guard_rsvp() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p public.posts;
begin
  select * into p from public.posts where id = new.post_id;
  if p.id is null or p.kind <> 'evento' then raise exception 'Evento non trovato'; end if;
  if p.event_day < (now() at time zone 'Europe/Rome')::date then raise exception 'L''evento è già passato'; end if;
  perform pg_advisory_xact_lock(hashtext('rsvp-' || p.id::text));
  if p.seats is not null and (select count(*) from public.post_rsvps where post_id = p.id) >= p.seats then
    raise exception 'L''evento è al completo';
  end if;
  return new;
end $$;
create trigger post_rsvps_guard before insert on public.post_rsvps
  for each row execute function public.guard_rsvp();

-- Quanti partecipano a ogni evento: il cliente vede solo la sua partecipazione, ma deve sapere i posti liberi.
create function public.event_seats_taken() returns table (post_id uuid, taken int)
language sql stable security definer set search_path = public as $$
  select r.post_id, count(*)::int from public.post_rsvps r group by r.post_id
$$;
revoke all on function public.event_seats_taken from anon;

alter table public.posts enable row level security;
alter table public.post_rsvps enable row level security;
alter table public.post_reads enable row level security;
create policy "bacheca letta da chi ha un account" on public.posts for select using (auth.uid() is not null);
create policy "bacheca del proprietario" on public.posts for all using (public.is_owner()) with check (public.is_owner());
create policy "partecipazioni proprie o proprietario" on public.post_rsvps for select using (user_id = auth.uid() or public.is_owner());
create policy "partecipo" on public.post_rsvps for insert with check (user_id = auth.uid());
create policy "non partecipo più" on public.post_rsvps for delete using (user_id = auth.uid() or public.is_owner());
create policy "letture proprie o proprietario" on public.post_reads for select using (user_id = auth.uid() or public.is_owner());
create policy "letto" on public.post_reads for insert with check (user_id = auth.uid());

-- ---------------------------------------------------------------
-- Spese
-- ---------------------------------------------------------------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  day date not null default ((now() at time zone 'Europe/Rome')::date),
  category text not null default 'Altro' check (length(trim(category)) between 1 and 60),
  description text not null default '' check (length(description) <= 200),
  amount_cents int not null check (amount_cents > 0),
  pay_method text not null default '' check (pay_method in ('', 'contanti', 'carta', 'bonifico')),
  created_at timestamptz not null default now()
);
create index on public.expenses (day);
alter table public.expenses enable row level security;
create policy "spese del proprietario" on public.expenses for all using (public.is_owner()) with check (public.is_owner());
