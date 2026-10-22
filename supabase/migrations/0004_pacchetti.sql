-- Campo Cani: pacchetti di lezioni.
-- Il proprietario crea i pacchetti (per esempio 10 lezioni IGP a 220 €, validi 6 mesi).
-- Il cliente ne richiede uno dall'app, il proprietario lo attiva quando incassa.
-- Da quel momento ogni prenotazione di quel tipo scala una lezione dal pacchetto
-- invece di essere pagata al campo; se la lezione viene annullata, torna nel pacchetto.
-- Da eseguire nel SQL Editor di Supabase dopo 0003_fatturazione.sql.

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lesson_type text references public.lesson_types,   -- null: vale per tutte le lezioni
  lessons int not null check (lessons > 0),
  price_cents int not null default 0 check (price_cents >= 0),
  valid_days int check (valid_days > 0),             -- null: non scade
  sort int not null default 0,
  active boolean not null default true
);

create table public.client_packages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  package_id uuid references public.packages on delete set null,
  name text not null,
  lesson_type text references public.lesson_types,
  lessons_total int not null check (lessons_total > 0),
  lessons_used int not null default 0 check (lessons_used >= 0),
  price_cents int not null default 0,
  status text not null default 'requested' check (status in ('requested','active','cancelled')),
  requested_at timestamptz not null default now(),
  activated_at timestamptz,
  expires_at timestamptz,
  check (lessons_used <= lessons_total)
);
create index on public.client_packages (user_id);

alter table public.bookings drop constraint bookings_pay_check;
alter table public.bookings add constraint bookings_pay_check check (pay in ('online','onsite','package'));
alter table public.bookings add column package_id uuid references public.client_packages on delete set null;

-- All'attivazione fissa data e scadenza. I clienti non possono modificare i pacchetti
-- (lo impediscono le regole di accesso): le lezioni usate le aggiorna solo book_slot.
create function public.guard_client_package() returns trigger
language plpgsql security definer set search_path = public as $$
declare days int;
begin
  if new.status = 'active' and old.status <> 'active' then
    select valid_days into days from public.packages where id = new.package_id;
    new.activated_at := now();
    new.expires_at := case when days is null then null else now() + make_interval(days => days) end;
  end if;
  return new;
end $$;
create trigger client_packages_guard before update on public.client_packages
  for each row execute function public.guard_client_package();

-- Una lezione annullata torna nel pacchetto, sia se disdice il cliente sia se annulla il campo.
create function public.refund_package_lesson() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'active' and new.status = 'cancelled' and new.package_id is not null then
    update public.client_packages set lessons_used = greatest(lessons_used - 1, 0) where id = new.package_id;
  end if;
  return new;
end $$;
create trigger bookings_refund_package after update of status on public.bookings
  for each row execute function public.refund_package_lesson();

-- Il cliente chiede un pacchetto: resta "richiesto" finché il campo non lo attiva.
create function public.request_package(p_package uuid) returns public.client_packages
language plpgsql security definer set search_path = public as $$
declare pk public.packages; res public.client_packages;
begin
  if auth.uid() is null then raise exception 'Devi accedere'; end if;
  select * into pk from public.packages where id = p_package and active;
  if pk.id is null then raise exception 'Pacchetto non disponibile'; end if;
  if exists (select 1 from public.client_packages where user_id = auth.uid() and package_id = p_package and status = 'requested') then
    raise exception 'Hai già richiesto questo pacchetto: il campo lo attiva quando paghi';
  end if;
  insert into public.client_packages (user_id, package_id, name, lesson_type, lessons_total, price_cents)
  values (auth.uid(), pk.id, pk.name, pk.lesson_type, pk.lessons, pk.price_cents)
  returning * into res;
  return res;
end $$;

-- Prenotazione: se il cliente ha un pacchetto attivo, valido e con lezioni per quel tipo,
-- la lezione si scala da lì (prima quello che scade prima).
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

alter table public.packages enable row level security;
alter table public.client_packages enable row level security;
create policy "pacchetti leggibili" on public.packages for select using (true);
create policy "pacchetti proprietario" on public.packages for all using (public.is_owner()) with check (public.is_owner());
create policy "pacchetti cliente propri o proprietario" on public.client_packages for select using (user_id = auth.uid() or public.is_owner());
create policy "pacchetti cliente proprietario" on public.client_packages for all using (public.is_owner()) with check (public.is_owner());

revoke all on function public.book_slot, public.request_package from anon;
