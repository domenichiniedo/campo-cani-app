-- K9 Manager: lezioni di gruppo (piano Pro).
-- Un tipo di lezione con group_seats si fa solo in gruppo. Il proprietario mette in calendario le
-- classi (campo, giorno, ora, trainer, posti), anche ripetute ogni settimana; i clienti si iscrivono
-- ai posti liberi. Ogni cane iscritto ha la sua prenotazione collegata alla classe, con pagamento,
-- pacchetto, ingresso, diario e penalità come le lezioni singole.
-- La classe occupa il campo e il trainer per tutta la sua durata, anche quando non ha ancora iscritti.
-- Da eseguire nel SQL Editor di Supabase dopo 0015_proprietario_automatico.sql.

alter table public.lesson_types add column group_seats int check (group_seats between 2 and 50);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  lesson_type text not null references public.lesson_types,
  lesson_option text not null default '',
  field_id uuid not null references public.fields,
  trainer_id uuid references public.trainers on delete set null,
  day date not null,
  start_min int not null check (start_min >= 0 and start_min % 30 = 0),
  dur_min int not null check (dur_min > 0),
  seats int not null check (seats between 2 and 50),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_at timestamptz not null default now()
);
create index on public.classes (day) where status = 'active';
alter table public.classes enable row level security;
create policy "classi leggibili" on public.classes for select using (auth.uid() is not null);
create policy "classi proprietario" on public.classes for all using (public.is_owner()) with check (public.is_owner());

alter table public.bookings add column class_id uuid references public.classes on delete set null;
create index on public.bookings (class_id) where class_id is not null;

-- Il campo è occupato da una lezione o da una classe (tranne la classe indicata, per iscriversi).
create function public.field_busy(p_field uuid, p_day date, p_start int, p_end int, p_class uuid default null)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bookings b where b.status = 'active' and b.field_id = p_field and b.day = p_day
                   and b.class_id is distinct from p_class and b.start_min < p_end and p_start < b.start_min + b.dur_min)
      or exists (select 1 from public.classes c where c.status = 'active' and c.field_id = p_field and c.day = p_day
                   and c.id is distinct from p_class and c.start_min < p_end and p_start < c.start_min + c.dur_min)
$$;

-- Controlli sul trainer, per le lezioni singole e per le classi: segue quel tipo di lezione,
-- è disponibile in quelle mezz'ore, non ha un'altra lezione o un'altra classe nello stesso orario.
create function public.check_trainer(p_trainer uuid, p_type text, p_day date, p_start int, p_dur int, p_class uuid, p_booking uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare tr public.trainers; av int[]; m int;
begin
  perform pg_advisory_xact_lock(hashtext('trainer-' || p_trainer::text || '-' || p_day::text));
  select * into tr from public.trainers where id = p_trainer;
  if cardinality(tr.lessons) > 0 and not (p_type = any(tr.lessons)) then
    raise exception '% non segue questo tipo di lezione', tr.name;
  end if;
  if exists (select 1 from public.trainer_availability where trainer_id = p_trainer) then
    select slots into av from public.trainer_availability where trainer_id = p_trainer and day = p_day;
    m := p_start;
    while m < p_start + p_dur loop
      if av is null or not (m = any(av)) then raise exception '% non è disponibile a quell''ora', tr.name; end if;
      m := m + 30;
    end loop;
  end if;
  if exists (select 1 from public.bookings b where b.status = 'active' and b.trainer_id = p_trainer and b.day = p_day
               and b.id is distinct from p_booking and b.class_id is distinct from p_class
               and b.start_min < p_start + p_dur and p_start < b.start_min + b.dur_min)
     or exists (select 1 from public.classes c where c.status = 'active' and c.trainer_id = p_trainer and c.day = p_day
               and c.id is distinct from p_class and c.start_min < p_start + p_dur and p_start < c.start_min + c.dur_min) then
    raise exception '% ha già una lezione in questo orario', tr.name;
  end if;
end $$;
revoke all on function public.check_trainer(uuid, text, date, int, int, uuid, uuid) from public, anon, authenticated;

create or replace function public.guard_trainer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Per i cani di una classe il trainer è già controllato sulla classe.
  if new.trainer_id is null or new.status <> 'active' or new.class_id is not null then return new; end if;
  perform public.check_trainer(new.trainer_id, new.lesson_type, new.day, new.start_min, new.dur_min, null, new.id);
  return new;
end $$;

create function public.guard_class() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'active' then return new; end if;
  perform pg_advisory_xact_lock(hashtext('book-' || new.field_id::text || '-' || new.day::text));
  if public.field_busy(new.field_id, new.day, new.start_min, new.start_min + new.dur_min, new.id) then
    raise exception 'Il campo è già occupato il %', to_char(new.day, 'DD/MM/YYYY');
  end if;
  if new.trainer_id is not null then
    perform public.check_trainer(new.trainer_id, new.lesson_type, new.day, new.start_min, new.dur_min, new.id, null);
  end if;
  return new;
end $$;
create trigger classes_guard before insert or update of trainer_id, field_id, day, start_min, dur_min, status on public.classes
  for each row execute function public.guard_class();

-- Il trainer della classe vale per tutti i cani iscritti; annullare la classe annulla le iscrizioni
-- (le lezioni scalate dai pacchetti tornano indietro come per le lezioni singole).
create function public.sync_class() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status = 'active' then
    update public.bookings set status = 'cancelled', cancelled_at = now() where class_id = new.id and status = 'active';
  elsif new.trainer_id is distinct from old.trainer_id then
    update public.bookings set trainer_id = new.trainer_id where class_id = new.id and status = 'active';
  end if;
  return new;
end $$;
create trigger classes_sync after update of status, trainer_id on public.classes
  for each row execute function public.sync_class();

-- Il proprietario mette in calendario una classe, anche ripetuta per più settimane alla stessa ora.
create function public.create_classes(p_type text, p_option text, p_field uuid, p_trainer uuid, p_day date, p_start int,
  p_seats int, p_weeks int default 1)
returns int
language plpgsql security definer set search_path = public as $$
declare t public.lesson_types; f public.fields; i int;
begin
  if not public.is_owner() then raise exception 'Solo il proprietario'; end if;
  select * into t from public.lesson_types where id = p_type and active;
  if t.id is null or t.group_seats is null then raise exception 'Scegli una lezione di gruppo'; end if;
  if cardinality(t.options) > 0 and not (p_option = any(t.options)) then raise exception 'Specialità non valida'; end if;
  select * into f from public.fields where id = p_field and active;
  if f.id is null then raise exception 'Campo non disponibile'; end if;
  if p_start % 30 <> 0 or p_start < 0 or p_start + t.duration_min > 1440 then raise exception 'Orario non valido'; end if;
  if p_seats is null or p_seats < 2 or p_seats > 50 then raise exception 'I posti vanno da 2 a 50'; end if;
  if p_weeks is null or p_weeks < 1 or p_weeks > 26 then raise exception 'Le settimane vanno da 1 a 26'; end if;
  for i in 0 .. p_weeks - 1 loop
    insert into public.classes (lesson_type, lesson_option, field_id, trainer_id, day, start_min, dur_min, seats)
    values (p_type, coalesce(p_option, ''), p_field, p_trainer, p_day + 7 * i, p_start, t.duration_min, p_seats);
  end loop;
  return p_weeks;
end $$;

-- Classi in programma con i posti presi: i clienti non vedono le prenotazioni degli altri.
create function public.class_list(from_day date, to_day date)
returns table (id uuid, lesson_type text, lesson_option text, field_id uuid, trainer_id uuid, day date, start_min int,
  dur_min int, seats int, taken int, my_dogs uuid[])
language sql stable security definer set search_path = public as $$
  select c.id, c.lesson_type, c.lesson_option, c.field_id, c.trainer_id, c.day, c.start_min, c.dur_min, c.seats,
    (select count(*)::int from public.bookings b where b.class_id = c.id and b.status = 'active'),
    coalesce((select array_agg(b.dog_id) from public.bookings b where b.class_id = c.id and b.status = 'active' and b.user_id = auth.uid()), '{}')
  from public.classes c
  where c.status = 'active' and c.day between from_day and to_day and auth.uid() is not null
  order by c.day, c.start_min
$$;

-- Iscrizione di un cane a una classe: dal cliente (p_user nullo) o dal proprietario per un cliente.
-- Il proprietario può iscrivere anche a una classe già passata, per segnare una lezione fatta.
create function public.join_class(p_class uuid, p_dog uuid, p_pay text default 'onsite', p_user uuid default null)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  s public.settings; c public.classes; t public.lesson_types; pr public.profiles; dg public.dogs;
  cp public.client_packages; res public.bookings; usr uuid; owner boolean := public.is_owner();
begin
  if auth.uid() is null then raise exception 'Devi accedere per prenotare'; end if;
  if p_user is not null and not owner then raise exception 'Solo il proprietario può prenotare per un cliente'; end if;
  usr := coalesce(p_user, auth.uid());
  select * into s from public.settings where id = 1;
  if p_user is null then
    select * into pr from public.profiles where id = usr;
    if pr.rules_ver is distinct from s.rules_ver or pr.privacy_ver is distinct from s.privacy_ver then
      raise exception 'Devi prima accettare regolamento e privacy aggiornati';
    end if;
    if not public.has_billing(pr) then raise exception 'Completa codice fiscale e indirizzo di fatturazione nel Profilo'; end if;
    if p_pay = 'online' and not s.online_payments then raise exception 'Il pagamento online non è ancora attivo'; end if;
  end if;
  select * into dg from public.dogs where id = p_dog and owner_id = usr and not archived;
  if dg.id is null then raise exception 'Cane non trovato'; end if;
  if dg.blocked and p_user is null then raise exception 'Le prenotazioni per questo cane sono sospese. Contatta il campo.'; end if;

  perform pg_advisory_xact_lock(hashtext('class-' || p_class::text));
  select * into c from public.classes where id = p_class and status = 'active';
  if c.id is null then raise exception 'Classe non trovata'; end if;
  if p_user is null and (c.day + make_interval(mins => c.start_min)) <= (now() at time zone 'Europe/Rome') then
    raise exception 'Orario già passato';
  end if;
  if exists (select 1 from public.bookings b where b.class_id = c.id and b.status = 'active' and b.dog_id = p_dog) then
    raise exception 'Questo cane è già iscritto alla classe';
  end if;
  if (select count(*) from public.bookings b where b.class_id = c.id and b.status = 'active') >= c.seats then
    raise exception 'La classe è al completo';
  end if;
  select * into t from public.lesson_types where id = c.lesson_type;

  select * into cp from public.client_packages
  where user_id = usr and status = 'active' and lessons_used < lessons_total
    and (lesson_type is null or lesson_type = c.lesson_type)
    and (expires_at is null or expires_at > now())
  order by expires_at nulls last, activated_at
  limit 1
  for update;

  if cp.id is not null then
    update public.client_packages set lessons_used = lessons_used + 1 where id = cp.id;
    insert into public.bookings (user_id, dog_id, field_id, lesson_type, lesson_option, day, start_min, dur_min, price_cents, pay, paid,
      package_id, trainer_id, class_id)
    values (usr, p_dog, c.field_id, c.lesson_type, c.lesson_option, c.day, c.start_min, c.dur_min, 0, 'package', true, cp.id, c.trainer_id, c.id)
    returning * into res;
  else
    insert into public.bookings (user_id, dog_id, field_id, lesson_type, lesson_option, day, start_min, dur_min, price_cents, pay, paid,
      trainer_id, class_id)
    values (usr, p_dog, c.field_id, c.lesson_type, c.lesson_option, c.day, c.start_min, c.dur_min, t.price_cents,
      case when p_user is null then coalesce(p_pay, 'onsite') else 'onsite' end, false, c.trainer_id, c.id)
    returning * into res;
  end if;
  return res;
end $$;

-- Le classi occupano il campo: compaiono fra i turni occupati, "mine" se c'è un proprio cane iscritto.
drop function public.busy_slots(date, date);
create function public.busy_slots(from_day date, to_day date)
returns table (field_id uuid, day date, start_min int, dur_min int, mine boolean)
language sql stable security definer set search_path = public as $$
  select b.field_id, b.day, b.start_min, b.dur_min, b.user_id = auth.uid()
  from public.bookings b
  where b.status = 'active' and b.day between from_day and to_day and b.class_id is null
  union all
  select c.field_id, c.day, c.start_min, c.dur_min,
    exists (select 1 from public.bookings b where b.class_id = c.id and b.status = 'active' and b.user_id = auth.uid())
  from public.classes c
  where c.status = 'active' and c.day between from_day and to_day
$$;

-- Prenotazione singola: come in 0004, ma le lezioni di gruppo si prenotano solo dalle classi
-- e il campo è occupato anche dalle classi.
create or replace function public.book_slot(p_field uuid, p_dog uuid, p_type text, p_option text, p_day date, p_start int, p_pay text)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  s public.settings; t public.lesson_types; pr public.profiles; dg public.dogs; f public.fields; av int[]; m int;
  cp public.client_packages; res public.bookings;
begin
  if auth.uid() is null then raise exception 'Devi accedere per prenotare'; end if;
  select * into s from public.settings where id = 1;
  select * into pr from public.profiles where id = auth.uid();
  if pr.rules_ver is distinct from s.rules_ver or pr.privacy_ver is distinct from s.privacy_ver then
    raise exception 'Devi prima accettare regolamento e privacy aggiornati';
  end if;
  if not public.has_billing(pr) then raise exception 'Completa codice fiscale e indirizzo di fatturazione nel Profilo'; end if;
  select * into f from public.fields where id = p_field and active;
  if f.id is null then raise exception 'Campo non disponibile'; end if;
  select * into dg from public.dogs where id = p_dog and owner_id = auth.uid() and not archived;
  if dg.id is null then raise exception 'Cane non trovato'; end if;
  if dg.blocked then raise exception 'Le prenotazioni per questo cane sono sospese. Contatta il campo.'; end if;
  select * into t from public.lesson_types where id = p_type and active;
  if t.id is null then raise exception 'Tipo di lezione non valido'; end if;
  if t.group_seats is not null then raise exception 'Questa lezione si fa in gruppo: scegli una classe'; end if;
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
  if public.field_busy(p_field, p_day, p_start, p_start + t.duration_min) then
    raise exception 'Questo orario non è più disponibile';
  end if;

  select * into cp from public.client_packages
  where user_id = auth.uid() and status = 'active' and lessons_used < lessons_total
    and (lesson_type is null or lesson_type = p_type)
    and (expires_at is null or expires_at > now())
  order by expires_at nulls last, activated_at
  limit 1
  for update;

  if cp.id is not null then
    update public.client_packages set lessons_used = lessons_used + 1 where id = cp.id;
    insert into public.bookings (user_id, dog_id, field_id, lesson_type, lesson_option, day, start_min, dur_min, price_cents, pay, paid, package_id)
    values (auth.uid(), p_dog, p_field, p_type, coalesce(p_option,''), p_day, p_start, t.duration_min, 0, 'package', true, cp.id)
    returning * into res;
  else
    insert into public.bookings (user_id, dog_id, field_id, lesson_type, lesson_option, day, start_min, dur_min, price_cents, pay, paid)
    values (auth.uid(), p_dog, p_field, p_type, coalesce(p_option,''), p_day, p_start, t.duration_min, t.price_cents, coalesce(p_pay,'onsite'), false)
    returning * into res;
  end if;
  return res;
end $$;

-- Prenotazione del proprietario per un cliente: come in 0010, con il campo occupato anche dalle classi.
create or replace function public.owner_book(p_user uuid, p_field uuid, p_dog uuid, p_type text, p_option text, p_day date, p_start int,
  p_trainer uuid default null)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  t public.lesson_types; f public.fields; dg public.dogs; cp public.client_packages; res public.bookings;
begin
  if not public.is_owner() then raise exception 'Solo il proprietario può prenotare per un cliente'; end if;
  select * into f from public.fields where id = p_field and active;
  if f.id is null then raise exception 'Campo non disponibile'; end if;
  select * into dg from public.dogs where id = p_dog and owner_id = p_user and not archived;
  if dg.id is null then raise exception 'Cane non trovato per questo cliente'; end if;
  select * into t from public.lesson_types where id = p_type;
  if t.id is null then raise exception 'Tipo di lezione non valido'; end if;
  if t.group_seats is not null then raise exception 'Questa lezione si fa in gruppo: scegli una classe'; end if;
  if cardinality(t.options) > 0 and not (p_option = any(t.options)) then raise exception 'Specialità non valida'; end if;
  if p_start % 30 <> 0 or p_start < 0 or p_start + t.duration_min > 1440 then raise exception 'Orario non valido'; end if;

  perform pg_advisory_xact_lock(hashtext('book-' || p_field::text || '-' || p_day::text));
  if public.field_busy(p_field, p_day, p_start, p_start + t.duration_min) then
    raise exception 'Il campo è già occupato a quell''ora';
  end if;

  select * into cp from public.client_packages
  where user_id = p_user and status = 'active' and lessons_used < lessons_total
    and (lesson_type is null or lesson_type = p_type)
    and (expires_at is null or expires_at > now())
  order by expires_at nulls last, activated_at
  limit 1
  for update;

  if cp.id is not null then
    update public.client_packages set lessons_used = lessons_used + 1 where id = cp.id;
    insert into public.bookings (user_id, dog_id, field_id, lesson_type, lesson_option, day, start_min, dur_min, price_cents, pay, paid, package_id, trainer_id)
    values (p_user, p_dog, p_field, p_type, coalesce(p_option,''), p_day, p_start, t.duration_min, 0, 'package', true, cp.id, p_trainer)
    returning * into res;
  else
    insert into public.bookings (user_id, dog_id, field_id, lesson_type, lesson_option, day, start_min, dur_min, price_cents, pay, paid, trainer_id)
    values (p_user, p_dog, p_field, p_type, coalesce(p_option,''), p_day, p_start, t.duration_min, t.price_cents, 'onsite', false, p_trainer)
    returning * into res;
  end if;
  return res;
end $$;

revoke all on function public.field_busy(uuid, date, int, int, uuid) from public, anon;
revoke all on function public.create_classes(text, text, uuid, uuid, date, int, int, int) from public, anon;
revoke all on function public.class_list(date, date) from public, anon;
revoke all on function public.join_class(uuid, uuid, text, uuid) from public, anon;
revoke all on function public.busy_slots(date, date) from anon;
grant execute on function public.create_classes(text, text, uuid, uuid, date, int, int, int) to authenticated;
grant execute on function public.class_list(date, date) to authenticated;
grant execute on function public.join_class(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.busy_slots(date, date) to authenticated;
