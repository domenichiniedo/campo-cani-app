-- Campo Cani: orari di disponibilità dei trainer, come quelli dei campi (mezz'ore aperte per giorno).
-- Un trainer per cui non hai mai impostato orari resta disponibile sempre, come prima.
-- Appena gli imposti un giorno, può avere lezioni solo nelle mezz'ore segnate.
-- Da eseguire nel SQL Editor di Supabase dopo 0010_prenota_proprietario.sql.

create table public.trainer_availability (
  trainer_id uuid not null references public.trainers on delete cascade,
  day date not null,
  slots int[] not null default '{}',
  primary key (trainer_id, day)
);
alter table public.trainer_availability enable row level security;
create policy "disponibilita trainer leggibile" on public.trainer_availability for select to authenticated using (true);
create policy "disponibilita trainer proprietario" on public.trainer_availability for all using (public.is_owner()) with check (public.is_owner());

-- Stesso controllo di 0002 (tipo di lezione e sovrapposizioni), più la disponibilità.
create or replace function public.guard_trainer() returns trigger
language plpgsql security definer set search_path = public as $$
declare tr public.trainers; av int[]; m int;
begin
  if new.trainer_id is null or new.status <> 'active' then return new; end if;
  perform pg_advisory_xact_lock(hashtext('trainer-' || new.trainer_id::text || '-' || new.day::text));
  select * into tr from public.trainers where id = new.trainer_id;
  if cardinality(tr.lessons) > 0 and not (new.lesson_type = any(tr.lessons)) then
    raise exception '% non segue questo tipo di lezione', tr.name;
  end if;
  if exists (select 1 from public.trainer_availability where trainer_id = new.trainer_id) then
    select slots into av from public.trainer_availability where trainer_id = new.trainer_id and day = new.day;
    m := new.start_min;
    while m < new.start_min + new.dur_min loop
      if av is null or not (m = any(av)) then raise exception '% non è disponibile a quell''ora', tr.name; end if;
      m := m + 30;
    end loop;
  end if;
  if exists (select 1 from public.bookings b where b.status = 'active' and b.trainer_id = new.trainer_id
             and b.day = new.day and b.id <> new.id
             and b.start_min < new.start_min + new.dur_min and new.start_min < b.start_min + b.dur_min) then
    raise exception '% ha già una lezione in questo orario', tr.name;
  end if;
  return new;
end $$;
