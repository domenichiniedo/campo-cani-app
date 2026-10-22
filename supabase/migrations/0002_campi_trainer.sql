-- Campo Cani: più campi e trainer.
-- Ogni campo ha nome e indirizzo (anche lo stesso indirizzo per campi diversi).
-- Orari aperti e prenotazioni diventano per campo. Il numero di campi si cambia
-- dall'app, in Impostazioni: i campi tolti vengono disattivati, non cancellati,
-- così lo storico delle prenotazioni resta.
-- I trainer seguono le lezioni: il cliente prenota senza sceglierlo e il
-- proprietario lo assegna o lo cambia dal piano del giorno.
-- Un trainer non può avere due lezioni sovrapposte, su nessun campo.
-- Da eseguire nel SQL Editor di Supabase dopo 0001_init.sql.

create table public.fields (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null default '',
  sort int not null default 0,
  active boolean not null default true
);
insert into public.fields (name, address, sort)
  select 'Campo 1', field_address, 1 from public.settings where id = 1;

-- Orari: una riga per campo e per giorno. Quelli già inseriti vanno al primo campo.
alter table public.availability add column field_id uuid references public.fields on delete cascade;
update public.availability set field_id = (select id from public.fields order by sort limit 1);
alter table public.availability alter column field_id set not null;
alter table public.availability drop constraint availability_pkey;
alter table public.availability add primary key (field_id, day);

-- Prenotazioni: ogni prenotazione è su un campo. Quelle già fatte vanno al primo campo.
alter table public.bookings add column field_id uuid references public.fields;
update public.bookings set field_id = (select id from public.fields order by sort limit 1);
alter table public.bookings alter column field_id set not null;
create index on public.bookings (field_id, day) where status = 'active';

-- Trainer: lessons vuoto vuol dire che segue tutti i tipi di lezione.
create table public.trainers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lessons text[] not null default '{}',
  sort int not null default 0,
  active boolean not null default true
);
alter table public.bookings add column trainer_id uuid references public.trainers on delete set null;
create index on public.bookings (trainer_id, day) where status = 'active';

-- Controlla ogni assegnazione del trainer, anche quando si sposta una lezione.
create function public.guard_trainer() returns trigger
language plpgsql security definer set search_path = public as $$
declare tr public.trainers;
begin
  if new.trainer_id is null or new.status <> 'active' then return new; end if;
  perform pg_advisory_xact_lock(hashtext('trainer-' || new.trainer_id::text || '-' || new.day::text));
  select * into tr from public.trainers where id = new.trainer_id;
  if cardinality(tr.lessons) > 0 and not (new.lesson_type = any(tr.lessons)) then
    raise exception '% non segue questo tipo di lezione', tr.name;
  end if;
  if exists (select 1 from public.bookings b where b.status = 'active' and b.trainer_id = new.trainer_id
             and b.day = new.day and b.id <> new.id
             and b.start_min < new.start_min + new.dur_min and new.start_min < b.start_min + b.dur_min) then
    raise exception '% ha già una lezione in questo orario', tr.name;
  end if;
  return new;
end $$;
create trigger bookings_trainer before insert or update of trainer_id, day, start_min, dur_min, status on public.bookings
  for each row execute function public.guard_trainer();

alter table public.trainers enable row level security;
create policy "trainer leggibili" on public.trainers for select using (true);
create policy "trainer proprietario" on public.trainers for all using (public.is_owner()) with check (public.is_owner());

alter table public.fields enable row level security;
create policy "campi leggibili" on public.fields for select using (true);
create policy "campi proprietario" on public.fields for all using (public.is_owner()) with check (public.is_owner());

-- Turni occupati, ora con il campo.
drop function public.busy_slots(date, date);
create function public.busy_slots(from_day date, to_day date)
returns table (field_id uuid, day date, start_min int, dur_min int, mine boolean)
language sql stable security definer set search_path = public as $$
  select b.field_id, b.day, b.start_min, b.dur_min, b.user_id = auth.uid()
  from public.bookings b
  where b.status = 'active' and b.day between from_day and to_day
$$;

-- Prenotazione su un campo: stessi controlli di prima, sovrapposizioni solo sullo stesso campo.
drop function public.book_slot(uuid, text, text, date, int, text);
create function public.book_slot(p_field uuid, p_dog uuid, p_type text, p_option text, p_day date, p_start int, p_pay text)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  s public.settings; t public.lesson_types; pr public.profiles; dg public.dogs; f public.fields; av int[]; m int; res public.bookings;
begin
  if auth.uid() is null then raise exception 'Devi accedere per prenotare'; end if;
  select * into s from public.settings where id = 1;
  select * into pr from public.profiles where id = auth.uid();
  if pr.rules_ver is distinct from s.rules_ver or pr.privacy_ver is distinct from s.privacy_ver then
    raise exception 'Devi prima accettare regolamento e privacy aggiornati';
  end if;
  select * into f from public.fields where id = p_field and active;
  if f.id is null then raise exception 'Campo non disponibile'; end if;
  select * into dg from public.dogs where id = p_dog and owner_id = auth.uid() and not archived;
  if dg.id is null then raise exception 'Cane non trovato'; end if;
  if dg.blocked then raise exception 'Le prenotazioni per questo cane sono sospese. Contatta il campo.'; end if;
  select * into t from public.lesson_types where id = p_type and active;
  if t.id is null then raise exception 'Tipo di lezione non valido'; end if;
  if cardinality(t.options) > 0 and not (p_option = any(t.options)) then raise exception 'Specialità non valida'; end if;
  if p_pay = 'online' and not s.online_payments then raise exception 'Il pagamento online non è ancora attivo'; end if;
  if p_start % 30 <> 0 or p_start < s.open_min or p_start + t.duration_min > s.close_min then raise exception 'Orario fuori apertura'; end if;
  if (p_day + make_interval(mins => p_start)) <= (now() at time zone 'Europe/Rome') then raise exception 'Orario già passato'; end if;

  perform pg_advisory_xact_lock(hashtext('book-' || p_field::text || '-' || p_day::text));
  select slots into av from public.availability where field_id = p_field and day = p_day;
  m := p_start;
  while m < p_start + t.duration_min loop
    if av is null or not (m = any(av)) then raise exception 'Orario non aperto'; end if;
    m := m + 30;
  end loop;
  if exists (select 1 from public.bookings b where b.status = 'active' and b.field_id = p_field and b.day = p_day
             and b.start_min < p_start + t.duration_min and p_start < b.start_min + b.dur_min) then
    raise exception 'Questo orario non è più disponibile';
  end if;

  insert into public.bookings (user_id, dog_id, field_id, lesson_type, lesson_option, day, start_min, dur_min, price_cents, pay, paid)
  values (auth.uid(), p_dog, p_field, p_type, coalesce(p_option,''), p_day, p_start, t.duration_min, t.price_cents, coalesce(p_pay,'onsite'), false)
  returning * into res;
  return res;
end $$;

revoke all on function public.book_slot, public.busy_slots from anon;
