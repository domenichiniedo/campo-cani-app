-- Club Manager: tutto il database in un solo file, per un progetto Supabase NUOVO.
-- 1. Scrivi l'email del titolare del centro nell'ultima riga, al posto di titolare@esempio.it.
-- 2. Incolla tutto il file nel SQL Editor di Supabase e premi Run.
-- Il titolare poi si iscrive dall'app con quella email ed entra già come proprietario.
-- Non eseguirlo su un database che ha già i dati: lì servono solo le migrazioni nuove.
-- File generato da tools/setup-sql.mjs: non modificarlo a mano.

-- ===== 0001_init.sql =====

-- Campo cani: schema iniziale.
-- Da eseguire una volta nel SQL Editor di Supabase (o con `supabase db push`).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- Impostazioni del campo (una sola riga)
-- ---------------------------------------------------------------
create table public.settings (
  id int primary key default 1 check (id = 1),
  field_name text not null default 'Il tuo campo',
  field_address text not null default '',
  logo_path text,
  open_min int not null default 480 check (open_min between 0 and 1440),
  close_min int not null default 1200 check (close_min between 0 and 1440),
  cancel_hours int not null default 2 check (cancel_hours >= 0),
  penalty_limit int not null default 3 check (penalty_limit >= 0),
  online_payments boolean not null default false,
  rules text not null default E'È richiesto il libretto vaccinale in regola.\nRaccogli sempre le deiezioni del cane.',
  privacy text not null default E'Informativa sul trattamento dei dati personali (testo di esempio da completare)\n\nTitolare del trattamento: [nome e cognome o ragione sociale], [indirizzo], [email di contatto].\n\nDati raccolti: nome, cognome, telefono, email, dati dei cani e prenotazioni.\n\nFinalità: gestire l''iscrizione, le prenotazioni del campo, i pagamenti e le comunicazioni di servizio.\n\nConservazione: i dati sono conservati per il tempo necessario a fornire il servizio e agli obblighi di legge.\n\nDiritti: puoi chiedere in ogni momento accesso, rettifica o cancellazione dei tuoi dati scrivendo a [email di contatto].',
  rules_ver int not null default 1,
  privacy_ver int not null default 1,
  updated_at timestamptz not null default now(),
  check (close_min > open_min)
);
insert into public.settings (id) values (1);

-- Ogni modifica al testo di regolamento o privacy alza la versione:
-- i clienti già iscritti dovranno riaccettarlo.
create function public.bump_consent_versions() returns trigger
language plpgsql as $$
begin
  if new.rules is distinct from old.rules then new.rules_ver := old.rules_ver + 1; end if;
  if new.privacy is distinct from old.privacy then new.privacy_ver := old.privacy_ver + 1; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger settings_versions before update on public.settings
  for each row execute function public.bump_consent_versions();

-- ---------------------------------------------------------------
-- Tipi di lezione
-- ---------------------------------------------------------------
create table public.lesson_types (
  id text primary key,
  label text not null,
  description text not null default '',
  duration_min int not null check (duration_min > 0 and duration_min % 30 = 0),
  price_cents int not null default 0 check (price_cents >= 0),
  options text[] not null default '{}',
  sort int not null default 0,
  active boolean not null default true
);
insert into public.lesson_types (id, label, description, duration_min, price_cents, options, sort) values
  ('igp', 'IGP', 'Scegli la fase da allenare', 60, 2500, array['Pista','Obbedienza','Attacco'], 1),
  ('base', 'Educazione base', 'Primi comandi e gestione', 30, 1500, array['Cucciolo (meno di 1,5 anni)','Adulto (più di 1,5 anni)'], 2);

-- ---------------------------------------------------------------
-- Profili (clienti e proprietario)
-- ---------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  phone text not null default '',
  email text not null default '',
  role text not null default 'client' check (role in ('client','owner')),
  rules_ver int,
  privacy_ver int,
  rules_accepted_at timestamptz,
  privacy_accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'owner')
$$;

-- Un cliente non può cambiarsi il ruolo da solo.
create function public.guard_profile() returns trigger
language plpgsql as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_owner() then
    raise exception 'Non puoi cambiare il ruolo';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile();

-- ---------------------------------------------------------------
-- Cani
-- ---------------------------------------------------------------
create table public.dogs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles on delete cascade,
  name text not null check (length(trim(name)) > 0),
  breed text not null default '',
  birth date,
  blocked boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.dogs (owner_id);

create function public.guard_dog() returns trigger
language plpgsql as $$
begin
  if new.blocked is distinct from old.blocked and auth.uid() is not null and not public.is_owner() then
    raise exception 'Solo il proprietario può sospendere o riattivare un cane';
  end if;
  return new;
end $$;
create trigger dogs_guard before update on public.dogs
  for each row execute function public.guard_dog();

-- Alla registrazione crea profilo e cani dai dati inviati con l'iscrizione,
-- così funziona anche quando l'email va confermata prima del primo accesso.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  d jsonb;
begin
  insert into public.profiles (id, first_name, last_name, phone, email, rules_ver, privacy_ver, rules_accepted_at, privacy_accepted_at)
  values (new.id, coalesce(m->>'first_name',''), coalesce(m->>'last_name',''), coalesce(m->>'phone',''), coalesce(new.email,''),
          (m->>'rules_ver')::int, (m->>'privacy_ver')::int,
          case when m ? 'rules_ver' then now() end, case when m ? 'privacy_ver' then now() end);
  for d in select * from jsonb_array_elements(coalesce(m->'dogs','[]'::jsonb)) loop
    if length(trim(coalesce(d->>'name',''))) > 0 then
      insert into public.dogs (owner_id, name, breed, birth)
      values (new.id, trim(d->>'name'), coalesce(d->>'breed',''), nullif(d->>'birth','')::date);
    end if;
  end loop;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------
-- Orari aperti: per ogni giorno, i minuti di inizio delle mezz'ore aperte
-- ---------------------------------------------------------------
create table public.availability (
  day date primary key,
  slots int[] not null default '{}'
);

-- ---------------------------------------------------------------
-- Prenotazioni
-- ---------------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  dog_id uuid not null references public.dogs on delete cascade,
  lesson_type text not null references public.lesson_types,
  lesson_option text not null default '',
  day date not null,
  start_min int not null check (start_min between 0 and 1439),
  dur_min int not null check (dur_min > 0),
  price_cents int not null default 0,
  pay text not null default 'onsite' check (pay in ('online','onsite')),
  paid boolean not null default false,
  checked_in_at timestamptz,
  note text not null default '',
  status text not null default 'active' check (status in ('active','cancelled')),
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.bookings (day) where status = 'active';
create index on public.bookings (user_id);

-- ---------------------------------------------------------------
-- Penalità
-- ---------------------------------------------------------------
create table public.penalties (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs on delete cascade,
  booking_id uuid references public.bookings on delete set null,
  reason text not null,
  created_at timestamptz not null default now()
);
create index on public.penalties (dog_id);

-- Alla soglia impostata il cane viene sospeso in automatico.
create function public.auto_block_dog() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; n int;
begin
  select penalty_limit into lim from public.settings where id = 1;
  select count(*) into n from public.penalties where dog_id = new.dog_id;
  if lim > 0 and n >= lim then
    update public.dogs set blocked = true where id = new.dog_id;
  end if;
  return new;
end $$;
create trigger penalties_auto_block after insert on public.penalties
  for each row execute function public.auto_block_dog();

-- ---------------------------------------------------------------
-- Funzioni per i clienti (girano con permessi controllati)
-- ---------------------------------------------------------------

-- Turni occupati in un intervallo, senza dati personali degli altri.
create function public.busy_slots(from_day date, to_day date)
returns table (day date, start_min int, dur_min int, mine boolean)
language sql stable security definer set search_path = public as $$
  select b.day, b.start_min, b.dur_min, b.user_id = auth.uid()
  from public.bookings b
  where b.status = 'active' and b.day between from_day and to_day
$$;

-- Prenota in modo sicuro: controlla consensi, cane, orari aperti e sovrapposizioni.
create function public.book_slot(p_dog uuid, p_type text, p_option text, p_day date, p_start int, p_pay text)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  s public.settings; t public.lesson_types; pr public.profiles; dg public.dogs; av int[]; m int; res public.bookings;
begin
  if auth.uid() is null then raise exception 'Devi accedere per prenotare'; end if;
  select * into s from public.settings where id = 1;
  select * into pr from public.profiles where id = auth.uid();
  if pr.rules_ver is distinct from s.rules_ver or pr.privacy_ver is distinct from s.privacy_ver then
    raise exception 'Devi prima accettare regolamento e privacy aggiornati';
  end if;
  select * into dg from public.dogs where id = p_dog and owner_id = auth.uid() and not archived;
  if dg.id is null then raise exception 'Cane non trovato'; end if;
  if dg.blocked then raise exception 'Le prenotazioni per questo cane sono sospese. Contatta il campo.'; end if;
  select * into t from public.lesson_types where id = p_type and active;
  if t.id is null then raise exception 'Tipo di lezione non valido'; end if;
  if cardinality(t.options) > 0 and not (p_option = any(t.options)) then raise exception 'Specialità non valida'; end if;
  if p_pay = 'online' and not s.online_payments then raise exception 'Il pagamento online non è ancora attivo'; end if;
  if p_start % 30 <> 0 or p_start < s.open_min or p_start + t.duration_min > s.close_min then raise exception 'Orario fuori apertura'; end if;
  if (p_day + make_interval(mins => p_start)) <= (now() at time zone 'Europe/Rome') then raise exception 'Orario già passato'; end if;

  perform pg_advisory_xact_lock(hashtext('book-' || p_day::text));
  select slots into av from public.availability where day = p_day;
  m := p_start;
  while m < p_start + t.duration_min loop
    if av is null or not (m = any(av)) then raise exception 'Orario non aperto'; end if;
    m := m + 30;
  end loop;
  if exists (select 1 from public.bookings b where b.status = 'active' and b.day = p_day
             and b.start_min < p_start + t.duration_min and p_start < b.start_min + b.dur_min) then
    raise exception 'Questo orario non è più disponibile';
  end if;

  insert into public.bookings (user_id, dog_id, lesson_type, lesson_option, day, start_min, dur_min, price_cents, pay, paid)
  values (auth.uid(), p_dog, p_type, coalesce(p_option,''), p_day, p_start, t.duration_min, t.price_cents, coalesce(p_pay,'onsite'), false)
  returning * into res;
  return res;
end $$;

-- Disdetta del cliente, entro il limite di ore impostato.
create function public.cancel_booking(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings; s public.settings;
begin
  select * into b from public.bookings where id = p_id and user_id = auth.uid() and status = 'active';
  if b.id is null then raise exception 'Prenotazione non trovata'; end if;
  select * into s from public.settings where id = 1;
  if (b.day + make_interval(mins => b.start_min)) - (now() at time zone 'Europe/Rome') < make_interval(hours => s.cancel_hours) then
    raise exception 'Troppo tardi per annullare: contatta il campo';
  end if;
  update public.bookings set status = 'cancelled', cancelled_at = now() where id = p_id;
end $$;

-- Riaccettazione di regolamento e privacy aggiornati.
create function public.accept_terms() returns void
language plpgsql security definer set search_path = public as $$
declare s public.settings;
begin
  select * into s from public.settings where id = 1;
  update public.profiles set rules_ver = s.rules_ver, privacy_ver = s.privacy_ver,
    rules_accepted_at = now(), privacy_accepted_at = now() where id = auth.uid();
end $$;

-- ---------------------------------------------------------------
-- Regole di accesso (Row Level Security)
-- ---------------------------------------------------------------
alter table public.settings enable row level security;
alter table public.lesson_types enable row level security;
alter table public.profiles enable row level security;
alter table public.dogs enable row level security;
alter table public.availability enable row level security;
alter table public.bookings enable row level security;
alter table public.penalties enable row level security;

create policy "settings leggibili" on public.settings for select using (true);
create policy "settings proprietario" on public.settings for update using (public.is_owner()) with check (public.is_owner());

create policy "lezioni leggibili" on public.lesson_types for select using (true);
create policy "lezioni proprietario" on public.lesson_types for all using (public.is_owner()) with check (public.is_owner());

create policy "profilo proprio o proprietario" on public.profiles for select using (id = auth.uid() or public.is_owner());
create policy "modifica profilo proprio" on public.profiles for update using (id = auth.uid() or public.is_owner()) with check (id = auth.uid() or public.is_owner());

create policy "cani propri o proprietario" on public.dogs for select using (owner_id = auth.uid() or public.is_owner());
create policy "aggiungi cane proprio" on public.dogs for insert with check (owner_id = auth.uid() and not blocked);
create policy "modifica cane" on public.dogs for update using (owner_id = auth.uid() or public.is_owner()) with check (owner_id = auth.uid() or public.is_owner());

create policy "orari leggibili" on public.availability for select to authenticated using (true);
create policy "orari proprietario" on public.availability for all using (public.is_owner()) with check (public.is_owner());

-- I clienti creano e annullano solo tramite book_slot e cancel_booking.
create policy "prenotazioni proprie o proprietario" on public.bookings for select using (user_id = auth.uid() or public.is_owner());
create policy "prenotazioni proprietario" on public.bookings for all using (public.is_owner()) with check (public.is_owner());

create policy "penalità proprie o proprietario" on public.penalties for select
  using (public.is_owner() or exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid()));
create policy "penalità proprietario" on public.penalties for all using (public.is_owner()) with check (public.is_owner());

revoke all on function public.book_slot, public.cancel_booking, public.accept_terms, public.busy_slots from anon;

-- ---------------------------------------------------------------
-- Logo: archivio immagini pubblico in lettura, scrivibile dal proprietario
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('branding', 'branding', true)
  on conflict (id) do nothing;
create policy "logo leggibile" on storage.objects for select using (bucket_id = 'branding');
create policy "logo proprietario inserisce" on storage.objects for insert with check (bucket_id = 'branding' and public.is_owner());
create policy "logo proprietario modifica" on storage.objects for update using (bucket_id = 'branding' and public.is_owner());
create policy "logo proprietario elimina" on storage.objects for delete using (bucket_id = 'branding' and public.is_owner());

-- ---------------------------------------------------------------
-- Account del proprietario: registrati nell'app con la tua email e la
-- password che scegli tu, poi esegui una sola volta (con la tua email):
--
--   update public.profiles set role = 'owner' where email = 'tua@email.it';
-- ---------------------------------------------------------------

-- ===== 0002_campi_trainer.sql =====

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

-- ===== 0003_fatturazione.sql =====

-- Campo Cani: dati di fatturazione dei clienti.
-- Codice fiscale (16 caratteri, oppure 11 cifre per chi ha una partita IVA) e
-- indirizzo di fatturazione, chiesti all'iscrizione. Chi era già iscritto li
-- inserisce al primo accesso: l'app non lo fa prenotare finché mancano.
-- Da eseguire nel SQL Editor di Supabase dopo 0002_campi_trainer.sql.

alter table public.profiles
  add column tax_code text not null default '',
  add column billing_street text not null default '',
  add column billing_zip text not null default '',
  add column billing_city text not null default '',
  add column billing_province text not null default '';

alter table public.profiles add constraint profiles_tax_code_format
  check (tax_code = '' or tax_code ~ '^[A-Z0-9]{16}$' or tax_code ~ '^[0-9]{11}$');
alter table public.profiles add constraint profiles_billing_zip_format
  check (billing_zip = '' or billing_zip ~ '^[0-9]{5}$');

-- Vero quando il cliente ha tutti i dati per la fattura.
create function public.has_billing(p public.profiles) returns boolean
language sql immutable as $$
  select p.tax_code <> '' and p.billing_street <> '' and p.billing_zip <> '' and p.billing_city <> ''
$$;

-- L'iscrizione salva anche i dati di fatturazione inviati dall'app.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  d jsonb;
begin
  insert into public.profiles (id, first_name, last_name, phone, email, rules_ver, privacy_ver, rules_accepted_at, privacy_accepted_at,
                               tax_code, billing_street, billing_zip, billing_city, billing_province)
  values (new.id, coalesce(m->>'first_name',''), coalesce(m->>'last_name',''), coalesce(m->>'phone',''), coalesce(new.email,''),
          (m->>'rules_ver')::int, (m->>'privacy_ver')::int,
          case when m ? 'rules_ver' then now() end, case when m ? 'privacy_ver' then now() end,
          upper(regexp_replace(coalesce(m->>'tax_code',''), '\s', '', 'g')),
          trim(coalesce(m->>'billing_street','')), trim(coalesce(m->>'billing_zip','')),
          trim(coalesce(m->>'billing_city','')), upper(trim(coalesce(m->>'billing_province',''))));
  for d in select * from jsonb_array_elements(coalesce(m->'dogs','[]'::jsonb)) loop
    if length(trim(coalesce(d->>'name',''))) > 0 then
      insert into public.dogs (owner_id, name, breed, birth)
      values (new.id, trim(d->>'name'), coalesce(d->>'breed',''), nullif(d->>'birth','')::date);
    end if;
  end loop;
  return new;
end $$;

-- Senza dati di fatturazione non si prenota: si aggiunge il controllo a book_slot.
create or replace function public.book_slot(p_field uuid, p_dog uuid, p_type text, p_option text, p_day date, p_start int, p_pay text)
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

  insert into public.bookings (user_id, dog_id, field_id, lesson_type, lesson_option, day, start_min, dur_min, price_cents, pay, paid)
  values (auth.uid(), p_dog, p_field, p_type, coalesce(p_option,''), p_day, p_start, t.duration_min, t.price_cents, coalesce(p_pay,'onsite'), false)
  returning * into res;
  return res;
end $$;

revoke all on function public.book_slot from anon;

-- ===== 0004_pacchetti.sql =====

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

-- ===== 0005_cancellazione_account.sql =====

-- Campo Cani: il cliente può cancellare il proprio account dall'app.
-- Le lezioni future vengono annullate (gli orari tornano liberi), poi si cancella
-- l'utente: profilo, cani, prenotazioni, penalità e pacchetti se ne vanno con lui.
-- Il proprietario non può cancellarsi da qui, per non restare senza accesso.
-- Da eseguire nel SQL Editor di Supabase dopo 0004_pacchetti.sql.

create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Devi accedere'; end if;
  if public.is_owner() then raise exception 'L''account del proprietario non si può cancellare dall''app'; end if;
  update public.bookings set status = 'cancelled', cancelled_at = now()
  where user_id = auth.uid() and status = 'active' and day >= (now() at time zone 'Europe/Rome')::date;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.delete_my_account from anon;

-- ===== 0006_fatture.sql =====

-- Campo Cani: fatture automatiche per i pagamenti online.
-- Quando una lezione pagata online risulta incassata, il database prepara la fattura
-- con una copia dei dati del cliente. La funzione fatture-in-cloud la crea su Fatture
-- in Cloud, che assegna il numero, e la invia allo SDI. Finché non è collegata, le
-- fatture restano "da inviare". Le fatture si conservano anche se il cliente cancella l'account.
-- Da eseguire nel SQL Editor di Supabase dopo 0005_cancellazione_account.sql.

-- Come si fattura. I dati di chi emette la fattura stanno già sull'account Fatture in Cloud.
-- Li vede e li modifica solo il proprietario.
create table public.invoice_settings (
  id int primary key default 1 check (id = 1),
  -- RF01 regime ordinario, RF19 forfettario (senza IVA).
  tax_regime text not null default 'RF01' check (tax_regime in ('RF01', 'RF19')),
  vat_rate numeric(4, 2) not null default 22 check (vat_rate >= 0 and vat_rate < 100),
  auto_invoice boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.invoice_settings (id) values (1);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  year int not null default extract(year from now() at time zone 'Europe/Rome'),
  -- Numero assegnato da Fatture in Cloud quando la fattura viene creata lì.
  number int,
  issued_on date not null default (now() at time zone 'Europe/Rome')::date,
  user_id uuid references public.profiles on delete set null,
  booking_id uuid unique references public.bookings on delete set null,
  buyer_name text not null,
  buyer_tax_code text,
  buyer_street text,
  buyer_zip text,
  buyer_city text,
  buyer_province text,
  description text not null,
  total_cents int not null check (total_cents >= 0),
  taxable_cents int not null,
  vat_cents int not null,
  vat_rate numeric(4, 2) not null,
  -- Natura dell'operazione senza IVA (N2.2 per il forfettario), altrimenti null.
  nature text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'error')),
  -- Id del documento su Fatture in Cloud: se c'è, la fattura esiste già lì e va solo inviata.
  provider_ref text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (year, number)
);
create index on public.invoices (user_id);
create index on public.invoices (status) where status <> 'sent';

-- Crea la fattura di una lezione pagata online, una sola volta.
create function public.invoice_online_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cfg public.invoice_settings; pr public.profiles; lt public.lesson_types; taxable int;
begin
  if new.pay <> 'online' or not new.paid or new.price_cents <= 0 then return new; end if;
  if tg_op = 'UPDATE' and old.paid then return new; end if;
  select * into cfg from public.invoice_settings where id = 1;
  if not cfg.auto_invoice then return new; end if;
  if exists (select 1 from public.invoices where booking_id = new.id) then return new; end if;
  select * into pr from public.profiles where id = new.user_id;
  select * into lt from public.lesson_types where id = new.lesson_type;
  taxable := case when cfg.tax_regime = 'RF19' then new.price_cents
                  else round(new.price_cents / (1 + cfg.vat_rate / 100)) end;
  insert into public.invoices (user_id, booking_id, buyer_name, buyer_tax_code, buyer_street, buyer_zip, buyer_city, buyer_province,
    description, total_cents, taxable_cents, vat_cents, vat_rate, nature)
  values (new.user_id, new.id, trim(pr.first_name || ' ' || pr.last_name), pr.tax_code,
    pr.billing_street, pr.billing_zip, pr.billing_city, nullif(pr.billing_province, ''),
    concat_ws(' · ', 'Lezione ' || coalesce(lt.label, new.lesson_type), nullif(new.lesson_option, ''), to_char(new.day, 'DD/MM/YYYY')),
    new.price_cents, taxable, new.price_cents - taxable,
    case when cfg.tax_regime = 'RF19' then 0 else cfg.vat_rate end,
    case when cfg.tax_regime = 'RF19' then 'N2.2' end);
  return new;
end $$;

create trigger bookings_invoice after insert or update of paid on public.bookings
  for each row execute function public.invoice_online_booking();

alter table public.invoice_settings enable row level security;
alter table public.invoices enable row level security;
create policy "dati fattura proprietario" on public.invoice_settings for all using (public.is_owner()) with check (public.is_owner());
create policy "fatture proprietario" on public.invoices for select using (public.is_owner());
create policy "fatture proprie" on public.invoices for select using (user_id = auth.uid());
-- Le fatture non si modificano dall'app: le aggiorna solo la funzione di invio, con la chiave di servizio.
-- Il proprietario può solo rimettere in coda una fattura andata in errore.
create function public.retry_invoice(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Solo il proprietario'; end if;
  update public.invoices set status = 'pending', error = null where id = p_id and status = 'error';
end $$;
revoke all on function public.retry_invoice from anon;

-- ===== 0007_scontrini.sql =====

-- Campo Cani: scontrino elettronico come alternativa alla fattura.
-- Il cliente sceglie nel Profilo se per i pagamenti online vuole la fattura o lo scontrino.
-- Lo scontrino (documento commerciale) si emette in uno dei tre modi scelti dal proprietario:
--   manual  lo batte lui sul registratore telematico e lo segna come battuto;
--   cloud   lo trasmette la funzione scontrini-openapi con un registratore virtuale (Openapi);
--   device  lo stampa il telefono del proprietario sul registratore Epson del campo, in Wi-Fi.
-- Da eseguire nel SQL Editor di Supabase dopo 0006_fatture.sql.

alter table public.profiles add column doc_pref text not null default 'invoice'
  check (doc_pref in ('invoice', 'receipt'));

alter table public.invoice_settings
  add column receipt_mode text not null default 'manual' check (receipt_mode in ('manual', 'cloud', 'device')),
  -- Indirizzo del registratore nella rete del campo, per esempio 192.168.1.50.
  add column printer_url text not null default '';

alter table public.invoices add column kind text not null default 'invoice' check (kind in ('invoice', 'receipt'));
-- Numero del documento commerciale stampato dal registratore (facoltativo).
alter table public.invoices add column receipt_number text;

create or replace function public.invoice_online_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cfg public.invoice_settings; pr public.profiles; lt public.lesson_types; taxable int;
begin
  if new.pay <> 'online' or not new.paid or new.price_cents <= 0 then return new; end if;
  if tg_op = 'UPDATE' and old.paid then return new; end if;
  select * into cfg from public.invoice_settings where id = 1;
  if not cfg.auto_invoice then return new; end if;
  if exists (select 1 from public.invoices where booking_id = new.id) then return new; end if;
  select * into pr from public.profiles where id = new.user_id;
  select * into lt from public.lesson_types where id = new.lesson_type;
  taxable := case when cfg.tax_regime = 'RF19' then new.price_cents
                  else round(new.price_cents / (1 + cfg.vat_rate / 100)) end;
  insert into public.invoices (kind, user_id, booking_id, buyer_name, buyer_tax_code, buyer_street, buyer_zip, buyer_city, buyer_province,
    description, total_cents, taxable_cents, vat_cents, vat_rate, nature)
  values (case when pr.doc_pref = 'receipt' then 'receipt' else 'invoice' end, new.user_id, new.id, trim(pr.first_name || ' ' || pr.last_name), pr.tax_code,
    pr.billing_street, pr.billing_zip, pr.billing_city, nullif(pr.billing_province, ''),
    concat_ws(' · ', 'Lezione ' || coalesce(lt.label, new.lesson_type), nullif(new.lesson_option, ''), to_char(new.day, 'DD/MM/YYYY')),
    new.price_cents, taxable, new.price_cents - taxable,
    case when cfg.tax_regime = 'RF19' then 0 else cfg.vat_rate end,
    case when cfg.tax_regime = 'RF19' then 'N2.2' end);
  return new;
end $$;

create function public.mark_receipt_done(p_id uuid, p_number text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Solo il proprietario'; end if;
  update public.invoices set status = 'sent', sent_at = now(), error = null, receipt_number = nullif(trim(p_number), '')
  where id = p_id and kind = 'receipt' and status <> 'sent';
end $$;
revoke all on function public.mark_receipt_done from anon;

-- Uno scontrino rifiutato dal registratore in cloud si rimanda da capo, come nuovo documento.
create or replace function public.retry_invoice(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Solo il proprietario'; end if;
  update public.invoices set status = 'pending', error = null,
    provider_ref = case when kind = 'receipt' then null else provider_ref end
  where id = p_id and status = 'error';
end $$;

-- ===== 0008_licenza.sql =====

-- Campo Cani: codice di licenza del centro, per l'app venduta ad altri centri.
-- Il centro incolla qui il codice rinnovato (da Impostazioni → Licenza) e tutti i suoi
-- clienti lo ricevono all'apertura dell'app. Il codice è firmato: modificarlo lo rende non valido.
-- Da eseguire nel SQL Editor di Supabase dopo 0007_scontrini.sql.

alter table public.settings add column license_code text not null default '';

-- ===== 0009_piani.sql =====

-- Campo Cani: piani Base, Professional e Pro dell'app venduta.
-- Il piano e il numero massimo di clienti stanno nella licenza firmata; qui serve solo
-- sapere quanti clienti ha il centro, anche prima di accedere (al momento dell'iscrizione).
-- Da eseguire nel SQL Editor di Supabase dopo 0008_licenza.sql.

create function public.client_count() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.profiles where role = 'client'
$$;
grant execute on function public.client_count() to anon, authenticated;

-- ===== 0010_prenota_proprietario.sql =====

-- Campo Cani: il proprietario prenota per un cliente già iscritto (dal programma Windows o dall'app).
-- Valgono i controlli sul campo, sul cane e sulle sovrapposizioni; il proprietario può invece
-- prenotare anche fuori dagli orari aperti o nel passato (per segnare una lezione già fatta).
-- Se il cliente ha un pacchetto valido per quella lezione, si scala da lì come quando prenota lui.
-- Il trainer è facoltativo; il controllo che non abbia due lezioni alla stessa ora resta quello di 0002.
-- Da eseguire nel SQL Editor di Supabase dopo 0009_piani.sql.

create function public.owner_book(p_user uuid, p_field uuid, p_dog uuid, p_type text, p_option text, p_day date, p_start int,
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
  if cardinality(t.options) > 0 and not (p_option = any(t.options)) then raise exception 'Specialità non valida'; end if;
  if p_start % 30 <> 0 or p_start < 0 or p_start + t.duration_min > 1440 then raise exception 'Orario non valido'; end if;

  perform pg_advisory_xact_lock(hashtext('book-' || p_field::text || '-' || p_day::text));
  if exists (select 1 from public.bookings b where b.status = 'active' and b.field_id = p_field and b.day = p_day
             and b.start_min < p_start + t.duration_min and p_start < b.start_min + b.dur_min) then
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
grant execute on function public.owner_book(uuid, uuid, uuid, text, text, date, int, uuid) to authenticated;

-- ===== 0011_disponibilita_trainer.sql =====

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

-- ===== 0012_documento_pacchetti.sql =====

-- Campo Cani: fattura o scontrino anche per i pacchetti.
-- Quando il proprietario segna il pacchetto come incassato (lo attiva), il database prepara
-- il documento come per le lezioni pagate online: fattura o scontrino secondo la scelta del
-- cliente nel Profilo, poi lo inviano le funzioni fatture-in-cloud o scontrini-openapi
-- (o il proprietario lo batte sul registratore, se lo scontrino è "a mano").
-- Da eseguire nel SQL Editor di Supabase dopo 0011_disponibilita_trainer.sql.

alter table public.invoices add column package_id uuid unique references public.client_packages on delete set null;

create function public.invoice_package() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cfg public.invoice_settings; pr public.profiles; taxable int;
begin
  if new.status <> 'active' or old.status = 'active' or new.price_cents <= 0 then return new; end if;
  select * into cfg from public.invoice_settings where id = 1;
  if not cfg.auto_invoice then return new; end if;
  if exists (select 1 from public.invoices where package_id = new.id) then return new; end if;
  select * into pr from public.profiles where id = new.user_id;
  taxable := case when cfg.tax_regime = 'RF19' then new.price_cents
                  else round(new.price_cents / (1 + cfg.vat_rate / 100)) end;
  insert into public.invoices (kind, user_id, package_id, buyer_name, buyer_tax_code, buyer_street, buyer_zip, buyer_city, buyer_province,
    description, total_cents, taxable_cents, vat_cents, vat_rate, nature)
  values (case when pr.doc_pref = 'receipt' then 'receipt' else 'invoice' end, new.user_id, new.id, trim(pr.first_name || ' ' || pr.last_name), pr.tax_code,
    pr.billing_street, pr.billing_zip, pr.billing_city, nullif(pr.billing_province, ''),
    'Pacchetto ' || new.name || ' · ' || new.lessons_total || ' lezioni',
    new.price_cents, taxable, new.price_cents - taxable,
    case when cfg.tax_regime = 'RF19' then 0 else cfg.vat_rate end,
    case when cfg.tax_regime = 'RF19' then 'N2.2' end);
  return new;
end $$;

create trigger client_packages_invoice after update of status on public.client_packages
  for each row execute function public.invoice_package();

-- ===== 0013_area_trainer.sql =====

-- Campo Cani: area dei trainer e diario di allenamento dei cani.
-- Il proprietario collega un trainer a un account con la sua email: se l'account esiste diventa
-- subito "trainer", altrimenti lo diventa quando quella persona si iscrive dall'app.
-- Il trainer vede le sue lezioni con cane e cliente, gestisce i suoi orari, fa entrare il cane
-- in campo e scrive nel diario del cane cosa si è fatto e i suoi commenti.
-- Il diario lo leggono il cliente (per i suoi cani), il proprietario e i trainer del cane.
-- Da eseguire nel SQL Editor di Supabase dopo 0012_documento_pacchetti.sql.

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('client', 'owner', 'trainer'));

-- Collegamento trainer-account in una tabella a parte: i trainer sono leggibili da tutti,
-- le loro email no.
create table public.trainer_accounts (
  trainer_id uuid primary key references public.trainers on delete cascade,
  email text not null unique check (email = lower(trim(email)) and email <> ''),
  user_id uuid unique references public.profiles on delete set null
);
alter table public.trainer_accounts enable row level security;
create policy "account trainer proprietario" on public.trainer_accounts for select using (public.is_owner());
create policy "account trainer proprio" on public.trainer_accounts for select using (user_id = auth.uid());

-- Il trainer dell'utente connesso, se è un trainer.
create function public.my_trainer() returns uuid
language sql stable security definer set search_path = public as $$
  select a.trainer_id from public.trainer_accounts a join public.profiles p on p.id = a.user_id
  where a.user_id = auth.uid() and p.role = 'trainer'
$$;

-- Clienti e cani che un trainer può vedere: quelli che hanno o hanno avuto lezioni con lui.
create function public.trainer_sees_user(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_trainer() is not null and exists (
    select 1 from public.bookings where user_id = p_user and trainer_id = public.my_trainer())
$$;
create function public.trainer_sees_dog(p_dog uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_trainer() is not null and exists (
    select 1 from public.bookings where dog_id = p_dog and trainer_id = public.my_trainer())
$$;

create policy "lezioni del trainer" on public.bookings for select using (trainer_id = public.my_trainer());
create policy "clienti del trainer" on public.profiles for select using (public.trainer_sees_user(id));
create policy "cani del trainer" on public.dogs for select using (public.trainer_sees_dog(id));
create policy "orari propri del trainer" on public.trainer_availability for all
  using (trainer_id = public.my_trainer()) with check (trainer_id = public.my_trainer());

-- Il proprietario collega (o scollega, con email vuota) un trainer a un account.
create function public.link_trainer(p_trainer uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare a public.trainer_accounts; pr public.profiles; e text := lower(trim(coalesce(p_email, '')));
begin
  if not public.is_owner() then raise exception 'Solo il proprietario'; end if;
  if not exists (select 1 from public.trainers where id = p_trainer) then raise exception 'Trainer non trovato'; end if;
  select * into a from public.trainer_accounts where trainer_id = p_trainer for update;
  if a.user_id is not null then
    update public.profiles set role = 'client' where id = a.user_id and role = 'trainer';
  end if;
  delete from public.trainer_accounts where trainer_id = p_trainer;
  if e = '' then return; end if;
  if exists (select 1 from public.trainer_accounts where email = e) then
    raise exception 'Questa email è già collegata a un altro trainer';
  end if;
  select * into pr from public.profiles where lower(email) = e;
  if pr.role = 'owner' then raise exception 'Questa è l''email del proprietario'; end if;
  if pr.id is not null then update public.profiles set role = 'trainer' where id = pr.id; end if;
  insert into public.trainer_accounts (trainer_id, email, user_id) values (p_trainer, e, pr.id);
end $$;

-- Chi si iscrive con l'email di un trainer diventa trainer.
create function public.link_new_trainer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.trainer_accounts set user_id = new.id where email = lower(trim(new.email)) and user_id is null;
  if found then update public.profiles set role = 'trainer' where id = new.id; end if;
  return new;
end $$;
create trigger profiles_link_trainer after insert on public.profiles
  for each row execute function public.link_new_trainer();

-- Ingresso in campo: il trainer della lezione, il giorno stesso; il proprietario sempre.
create function public.trainer_check_in(p_booking uuid, p_in boolean default true) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare b public.bookings; d public.dogs;
begin
  select * into b from public.bookings where id = p_booking for update;
  if b.id is null or b.status <> 'active' then raise exception 'Lezione non trovata'; end if;
  if not public.is_owner() then
    if b.trainer_id is null or b.trainer_id is distinct from public.my_trainer() then raise exception 'Non è una tua lezione'; end if;
    if b.day <> (now() at time zone 'Europe/Rome')::date then raise exception 'Il cane si fa entrare il giorno della lezione'; end if;
  end if;
  select * into d from public.dogs where id = b.dog_id;
  if p_in and d.blocked then raise exception '% è sospeso: non può entrare in campo', d.name; end if;
  update public.bookings set checked_in_at = case when p_in then coalesce(checked_in_at, now()) end
  where id = b.id returning * into b;
  return b;
end $$;

-- Diario di allenamento: una pagina per lezione, attaccata al cane.
create table public.dog_notes (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs on delete cascade,
  booking_id uuid unique references public.bookings on delete set null,
  trainer_id uuid references public.trainers on delete set null,
  author_name text not null default '',
  day date not null,
  lesson text not null default '',
  work text not null default '',
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.dog_notes (dog_id, day desc);
alter table public.dog_notes enable row level security;
create policy "diario leggibile" on public.dog_notes for select using (
  public.is_owner()
  or exists (select 1 from public.dogs where id = dog_id and owner_id = auth.uid())
  or public.trainer_sees_dog(dog_id));
create policy "diario proprietario" on public.dog_notes for delete using (public.is_owner());

-- Il trainer scrive (o corregge) la pagina di una sua lezione; il proprietario di qualunque lezione.
create function public.save_dog_note(p_booking uuid, p_work text, p_comment text) returns public.dog_notes
language plpgsql security definer set search_path = public as $$
declare b public.bookings; lt public.lesson_types; tr public.trainers; pr public.profiles; n public.dog_notes;
begin
  select * into b from public.bookings where id = p_booking;
  if b.id is null or b.status <> 'active' then raise exception 'Lezione non trovata'; end if;
  if not public.is_owner() and (b.trainer_id is null or b.trainer_id is distinct from public.my_trainer()) then
    raise exception 'Non è una tua lezione';
  end if;
  if length(trim(coalesce(p_work, ''))) = 0 and length(trim(coalesce(p_comment, ''))) = 0 then
    raise exception 'Scrivi cosa avete fatto o un commento';
  end if;
  select * into lt from public.lesson_types where id = b.lesson_type;
  select * into tr from public.trainers where id = b.trainer_id;
  select * into pr from public.profiles where id = auth.uid();
  insert into public.dog_notes (dog_id, booking_id, trainer_id, author_name, day, lesson, work, comment)
  values (b.dog_id, b.id, b.trainer_id,
    case when pr.role = 'owner' then coalesce(nullif(trim(pr.first_name || ' ' || pr.last_name), ''), 'Il campo') else coalesce(tr.name, '') end,
    b.day, concat_ws(' · ', coalesce(lt.label, b.lesson_type), nullif(b.lesson_option, '')), trim(coalesce(p_work, '')), trim(coalesce(p_comment, '')))
  on conflict (booking_id) do update set work = excluded.work, comment = excluded.comment, author_name = excluded.author_name, updated_at = now()
  returning * into n;
  return n;
end $$;

revoke all on function public.link_trainer, public.trainer_check_in, public.save_dog_note from anon;
grant execute on function public.link_trainer(uuid, text) to authenticated;
grant execute on function public.trainer_check_in(uuid, boolean) to authenticated;
grant execute on function public.save_dog_note(uuid, text, text) to authenticated;

-- ===== 0014_foto_e_penalita.sql =====

-- Campo Cani: foto di trainer e clienti, penalità date dal trainer.
-- Le foto stanno nello spazio "foto": si aprono con il loro indirizzo, ma l'elenco dei file lo vede
-- solo il proprietario. Il nome dice di chi è la foto: "trainer-<id del trainer>-..." oppure
-- "cliente-<id dell'utente>-...". Ognuno carica e toglie solo le sue; il proprietario tutte.
-- Il trainer dà una penalità al cane di una sua lezione, come il proprietario dal piano del giorno.
-- Da eseguire nel SQL Editor di Supabase dopo 0013_area_trainer.sql.

alter table public.trainers add column photo_path text;
alter table public.profiles add column photo_path text;

insert into storage.buckets (id, name, public) values ('foto', 'foto', true) on conflict (id) do nothing;

-- Di chi è il file: il proprietario tutti, il trainer i suoi, il cliente i suoi.
create function public.my_photo_file(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_owner()
    or (public.my_trainer() is not null and p_name like 'trainer-' || public.my_trainer()::text || '-%')
    or (auth.uid() is not null and p_name like 'cliente-' || auth.uid()::text || '-%')
$$;

create policy "foto proprie leggibili" on storage.objects for select to authenticated
  using (bucket_id = 'foto' and public.my_photo_file(name));
create policy "foto proprie inserisce" on storage.objects for insert to authenticated
  with check (bucket_id = 'foto' and public.my_photo_file(name));
create policy "foto proprie elimina" on storage.objects for delete to authenticated
  using (bucket_id = 'foto' and public.my_photo_file(name));

-- Il trainer cambia la sua foto senza poter toccare nome e lezioni (quelli li decide il centro).
create function public.set_my_photo(p_path text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.my_trainer();
begin
  if me is null then raise exception 'Solo un trainer collegato può cambiare la sua foto.'; end if;
  if p_path is not null and p_path not like 'trainer-' || me::text || '-%' then
    raise exception 'Foto non valida.';
  end if;
  update public.trainers set photo_path = p_path where id = me;
end $$;

-- La foto del cliente la cambia lui stesso dal profilo (modifica profilo proprio), ma solo con un suo file.
alter table public.profiles add constraint profiles_photo_own
  check (photo_path is null or photo_path like 'cliente-' || id::text || '-%');

-- Il trainer vede le penalità dei cani che ha avuto a lezione.
create policy "penalità del trainer" on public.penalties for select using (public.trainer_sees_dog(dog_id));

-- Penalità dal trainer: solo sulle sue lezioni, già iniziate o di oggi. Alla soglia il cane
-- viene sospeso come sempre (trigger penalties_auto_block).
create function public.trainer_penalty(p_booking uuid, p_reason text) returns public.penalties
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
  r public.penalties;
begin
  select * into b from public.bookings where id = p_booking and status = 'active';
  if b.id is null then raise exception 'Lezione non trovata.'; end if;
  if not public.is_owner() then
    if b.trainer_id is null or b.trainer_id is distinct from public.my_trainer() then raise exception 'Non è una tua lezione.'; end if;
    if b.day > current_date then raise exception 'La penalità si dà il giorno della lezione o dopo.'; end if;
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Scegli il motivo della penalità.'; end if;
  insert into public.penalties (dog_id, booking_id, reason) values (b.dog_id, b.id, trim(p_reason)) returning * into r;
  return r;
end $$;

-- Il trainer può togliere una penalità data per sbaglio su una sua lezione.
-- Se il cane era già stato sospeso, lo riattiva il proprietario da Clienti.
create function public.trainer_remove_penalty(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() and not exists (
    select 1 from public.penalties p join public.bookings b on b.id = p.booking_id
    where p.id = p_id and b.trainer_id = public.my_trainer()) then
    raise exception 'Non è una penalità di una tua lezione.';
  end if;
  delete from public.penalties where id = p_id;
end $$;

grant execute on function public.set_my_photo(text) to authenticated;
grant execute on function public.trainer_penalty(uuid, text) to authenticated;
grant execute on function public.trainer_remove_penalty(uuid) to authenticated;

-- ===== 0015_proprietario_automatico.sql =====

-- Campo Cani: il titolare diventa proprietario da solo, senza SQL a mano.
-- L'email del titolare sta in owner_setup (la scrive tools/nuovo-centro.mjs, o l'ultima riga di
-- supabase/setup.sql). Chi si iscrive dall'app con quell'email entra già come proprietario;
-- se l'account esiste già, set_owner_email lo rende proprietario subito.
-- La tabella non ha regole di lettura: l'email del titolare non la vede nessun cliente.
-- Da eseguire nel SQL Editor di Supabase dopo 0014_foto_e_penalita.sql.

create table public.owner_setup (
  id int primary key default 1 check (id = 1),
  email text not null check (email = lower(trim(email)) and email <> '')
);
alter table public.owner_setup enable row level security;

create function public.profiles_auto_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.owner_setup where email = lower(trim(new.email))) then
    new.role := 'owner';
  end if;
  return new;
end $$;
create trigger profiles_auto_owner before insert on public.profiles
  for each row execute function public.profiles_auto_owner();

-- Solo dal SQL Editor o dagli strumenti del fornitore: nessun utente dell'app può chiamarla.
create function public.set_owner_email(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare
  e text := lower(trim(p_email));
begin
  if e = '' or e not like '%@%' then raise exception 'Email del titolare non valida.'; end if;
  insert into public.owner_setup (id, email) values (1, e) on conflict (id) do update set email = excluded.email;
  update public.profiles set role = 'owner' where lower(email) = e;
end $$;
revoke execute on function public.set_owner_email(text) from public, anon, authenticated;

-- ===== 0016_lezioni_di_gruppo.sql =====

-- Club Manager: lezioni di gruppo (piano Pro).
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

-- ===== 0017_consenso_social.sql =====

-- Club Manager: consenso facoltativo alla pubblicazione delle foto sui social del centro.
-- Si dà all'iscrizione (casella non obbligatoria) e il cliente può cambiarlo dal Profilo quando vuole;
-- il proprietario lo vede nella scheda del cliente, con la data dell'ultima scelta.
-- Da eseguire nel SQL Editor di Supabase dopo 0016_lezioni_di_gruppo.sql.

alter table public.profiles add column social_consent boolean not null default false;
alter table public.profiles add column social_consent_at timestamptz;

-- La data si aggiorna da sola a ogni cambio, così resta traccia di quando è stato dato o tolto.
create function public.stamp_social_consent() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.social_consent then new.social_consent_at := now(); end if;
  elsif new.social_consent is distinct from old.social_consent then
    new.social_consent_at := now();
  else
    new.social_consent_at := old.social_consent_at;
  end if;
  return new;
end $$;
create trigger profiles_social_consent before insert or update on public.profiles
  for each row execute function public.stamp_social_consent();

-- L'iscrizione salva anche la scelta sulle foto inviata dall'app (come in 0003, più social_consent).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  d jsonb;
begin
  insert into public.profiles (id, first_name, last_name, phone, email, rules_ver, privacy_ver, rules_accepted_at, privacy_accepted_at,
                               tax_code, billing_street, billing_zip, billing_city, billing_province, social_consent)
  values (new.id, coalesce(m->>'first_name',''), coalesce(m->>'last_name',''), coalesce(m->>'phone',''), coalesce(new.email,''),
          (m->>'rules_ver')::int, (m->>'privacy_ver')::int,
          case when m ? 'rules_ver' then now() end, case when m ? 'privacy_ver' then now() end,
          upper(regexp_replace(coalesce(m->>'tax_code',''), '\s', '', 'g')),
          trim(coalesce(m->>'billing_street','')), trim(coalesce(m->>'billing_zip','')),
          trim(coalesce(m->>'billing_city','')), upper(trim(coalesce(m->>'billing_province',''))),
          coalesce((m->>'social_consent')::boolean, false));
  for d in select * from jsonb_array_elements(coalesce(m->'dogs','[]'::jsonb)) loop
    if length(trim(coalesce(d->>'name',''))) > 0 then
      insert into public.dogs (owner_id, name, breed, birth)
      values (new.id, trim(d->>'name'), coalesce(d->>'breed',''), nullif(d->>'birth','')::date);
    end if;
  end loop;
  return new;
end $$;

-- ===== 0018_schede_valutazione.sql =====

-- Campo Cani: schede di valutazione nel diario dei cani (piano Pro).
-- Il proprietario prepara le schede con le sue voci (voto da 1 a 5, sì/no, scelta tra risposte, testo),
-- per esempio "Primo incontro" o "Ipersensibilità al tatto". La scheda valuta
-- il cane: trainer e proprietario la compilano dal diario del cane quando vogliono, oppure nella
-- pagina del diario di una lezione. La vedono il cliente e il campo.
-- Nella pagina si salva una copia della scheda con i valori: cambiare la scheda dopo non cambia
-- le pagine già scritte.
-- Da eseguire nel SQL Editor di Supabase dopo 0017_consenso_social.sql.

-- Voci della scheda: [{"label": "Approccio alle persone", "kind": "score" | "yesno" | "text" | "choice"}, ...].
-- Le voci "choice" hanno anche le risposte tra cui scegliere: "options": ["Accetta", "Tollera", "Evita"].
create function public.eval_items_ok(p jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) between 1 and 40 and not exists (
    select 1 from jsonb_array_elements(p) e
    where jsonb_typeof(e) <> 'object' or coalesce(trim(e->>'label'), '') = ''
      or coalesce(e->>'kind', '') not in ('score', 'yesno', 'text', 'choice')
      or (e->>'kind' = 'choice' and not (
        jsonb_typeof(e->'options') = 'array' and jsonb_array_length(e->'options') between 2 and 20
        and not exists (select 1 from jsonb_array_elements(e->'options') o
          where jsonb_typeof(o) <> 'string' or trim(o #>> '{}') = ''))))
$$;

create table public.eval_forms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (trim(name) <> ''),
  items jsonb not null check (public.eval_items_ok(items)),
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.eval_forms enable row level security;
create policy "schede leggibili" on public.eval_forms for select using (auth.uid() is not null);
create policy "schede proprietario" on public.eval_forms for all using (public.is_owner()) with check (public.is_owner());

-- La scheda compilata: {"form_id", "name", "items": [{"label", "kind", "value"}]}.
alter table public.dog_notes add column evaluation jsonb;

-- Dalla scheda scelta e dai valori ({"form_id", "values": [...]}, uno per voce, null se vuota)
-- alla copia da salvare nella pagina, con i controlli sui valori.
create function public.eval_filled(p_eval jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare f public.eval_forms; vals jsonb; it jsonb; v jsonb; res jsonb := '[]'; i int := 0; filled boolean := false;
begin
  if p_eval is null or jsonb_typeof(p_eval) = 'null' then return null; end if;
  select * into f from public.eval_forms where id::text = p_eval->>'form_id';
  if f.id is null then raise exception 'Scheda di valutazione non trovata'; end if;
  vals := coalesce(p_eval->'values', '[]');
  if jsonb_typeof(vals) <> 'array' then raise exception 'Scheda di valutazione non valida'; end if;
  for it in select * from jsonb_array_elements(f.items) loop
    v := coalesce(vals->i, 'null');
    if it->>'kind' = 'text' and jsonb_typeof(v) = 'string' then
      v := case when trim(v #>> '{}') = '' then 'null' else to_jsonb(left(trim(v #>> '{}'), 2000)) end;
    end if;
    if jsonb_typeof(v) <> 'null' and not (
      (it->>'kind' = 'score' and jsonb_typeof(v) = 'number' and (v #>> '{}') in ('1', '2', '3', '4', '5'))
      or (it->>'kind' = 'yesno' and jsonb_typeof(v) = 'boolean')
      or (it->>'kind' = 'text' and jsonb_typeof(v) = 'string')
      or (it->>'kind' = 'choice' and jsonb_typeof(v) = 'string' and coalesce(it->'options', '[]') ? (v #>> '{}'))) then
      raise exception 'Scheda di valutazione non valida';
    end if;
    filled := filled or jsonb_typeof(v) <> 'null';
    res := res || jsonb_build_array(jsonb_build_object('label', it->>'label', 'kind', it->>'kind', 'value', v));
    i := i + 1;
  end loop;
  if not filled then raise exception 'Compila almeno una voce della scheda'; end if;
  return jsonb_build_object('form_id', f.id, 'name', f.name, 'items', res);
end $$;

-- Come in 0013, con la scheda: una pagina può avere solo la scheda, senza testo.
drop function public.save_dog_note(uuid, text, text);
create function public.save_dog_note(p_booking uuid, p_work text, p_comment text, p_eval jsonb default null) returns public.dog_notes
language plpgsql security definer set search_path = public as $$
declare b public.bookings; lt public.lesson_types; tr public.trainers; pr public.profiles; n public.dog_notes; ev jsonb;
begin
  select * into b from public.bookings where id = p_booking;
  if b.id is null or b.status <> 'active' then raise exception 'Lezione non trovata'; end if;
  if not public.is_owner() and (b.trainer_id is null or b.trainer_id is distinct from public.my_trainer()) then
    raise exception 'Non è una tua lezione';
  end if;
  -- {"keep": true}: resta la scheda già compilata (per esempio una scheda che non è più in uso).
  if coalesce(p_eval ? 'keep', false) then
    select evaluation into ev from public.dog_notes where booking_id = b.id;
  else
    ev := public.eval_filled(p_eval);
  end if;
  if length(trim(coalesce(p_work, ''))) = 0 and length(trim(coalesce(p_comment, ''))) = 0 and ev is null then
    raise exception 'Scrivi cosa avete fatto o un commento';
  end if;
  select * into lt from public.lesson_types where id = b.lesson_type;
  select * into tr from public.trainers where id = b.trainer_id;
  select * into pr from public.profiles where id = auth.uid();
  insert into public.dog_notes (dog_id, booking_id, trainer_id, author_name, day, lesson, work, comment, evaluation)
  values (b.dog_id, b.id, b.trainer_id,
    case when pr.role = 'owner' then coalesce(nullif(trim(pr.first_name || ' ' || pr.last_name), ''), 'Il campo') else coalesce(tr.name, '') end,
    b.day, concat_ws(' · ', coalesce(lt.label, b.lesson_type), nullif(b.lesson_option, '')), trim(coalesce(p_work, '')), trim(coalesce(p_comment, '')), ev)
  on conflict (booking_id) do update set work = excluded.work, comment = excluded.comment, evaluation = excluded.evaluation,
    author_name = excluded.author_name, updated_at = now()
  returning * into n;
  return n;
end $$;

-- Valutazione del cane fuori dalle lezioni: una pagina del diario di oggi con la scheda e un commento.
create function public.add_dog_eval(p_dog uuid, p_eval jsonb, p_comment text default '') returns public.dog_notes
language plpgsql security definer set search_path = public as $$
declare pr public.profiles; tr public.trainers; n public.dog_notes; ev jsonb;
begin
  if not exists (select 1 from public.dogs where id = p_dog) then raise exception 'Cane non trovato'; end if;
  if not public.is_owner() and not public.trainer_sees_dog(p_dog) then raise exception 'Non è un cane delle tue lezioni'; end if;
  ev := public.eval_filled(p_eval);
  if ev is null then raise exception 'Scegli una scheda di valutazione'; end if;
  select * into pr from public.profiles where id = auth.uid();
  select * into tr from public.trainers where id = public.my_trainer();
  insert into public.dog_notes (dog_id, trainer_id, author_name, day, comment, evaluation)
  values (p_dog, tr.id,
    case when pr.role = 'owner' then coalesce(nullif(trim(pr.first_name || ' ' || pr.last_name), ''), 'Il campo') else coalesce(tr.name, '') end,
    (now() at time zone 'Europe/Rome')::date, trim(coalesce(p_comment, '')), ev)
  returning * into n;
  return n;
end $$;

revoke all on function public.eval_filled(jsonb) from public, anon, authenticated;
revoke all on function public.add_dog_eval(uuid, jsonb, text) from public, anon;
grant execute on function public.add_dog_eval(uuid, jsonb, text) to authenticated;
revoke all on function public.save_dog_note(uuid, text, text, jsonb) from public, anon;
grant execute on function public.save_dog_note(uuid, text, text, jsonb) to authenticated;

-- ===== 0019_piu_proprietari.sql =====

-- Campo Cani: più proprietari. Un proprietario ne nomina altri con la loro email (Impostazioni → Proprietari):
-- se l'account esiste diventa subito proprietario, altrimenti lo diventa quando si iscrive dall'app.
-- Toglierlo lo riporta cliente (o trainer, se è collegato a un trainer). Nessuno può togliere sé stesso,
-- così resta sempre almeno un proprietario.
-- Da eseguire nel SQL Editor di Supabase dopo 0018_schede_valutazione.sql.

create table public.owner_emails (
  email text primary key check (email = lower(trim(email)) and email like '%@%')
);
alter table public.owner_emails enable row level security;
create policy "proprietari letti dai proprietari" on public.owner_emails for select using (public.is_owner());

-- Il titolare di owner_setup e chi è già proprietario.
insert into public.owner_emails (email) select email from public.owner_setup where email <> 'titolare@esempio.it' on conflict do nothing;
insert into public.owner_emails (email)
  select distinct lower(trim(email)) from public.profiles where role = 'owner' and email like '%@%'
  on conflict do nothing;

create or replace function public.profiles_auto_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.owner_emails where email = lower(trim(new.email)))
    or exists (select 1 from public.owner_setup where email = lower(trim(new.email))) then
    new.role := 'owner';
  end if;
  return new;
end $$;

-- Come prima per il titolare, e in più lo mette fra i proprietari. Se cambia l'email del titolare, quella
-- vecchia esce dall'elenco quando nessuno si era ancora iscritto con lei (era un errore di battitura).
create or replace function public.set_owner_email(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare
  e text := lower(trim(p_email));
begin
  if e = '' or e not like '%@%' then raise exception 'Email del titolare non valida.'; end if;
  delete from public.owner_emails o using public.owner_setup s
    where o.email = s.email and s.email <> e and not exists (select 1 from public.profiles p where lower(p.email) = o.email);
  insert into public.owner_setup (id, email) values (1, e) on conflict (id) do update set email = excluded.email;
  insert into public.owner_emails (email) values (e) on conflict do nothing;
  update public.profiles set role = 'owner' where lower(email) = e;
end $$;
revoke execute on function public.set_owner_email(text) from public, anon, authenticated;

create function public.add_owner(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare
  e text := lower(trim(coalesce(p_email, '')));
begin
  if not public.is_owner() then raise exception 'Solo un proprietario può aggiungere proprietari'; end if;
  if e not like '%_@_%' then raise exception 'Email non valida'; end if;
  insert into public.owner_emails (email) values (e) on conflict do nothing;
  update public.profiles set role = 'owner' where lower(email) = e;
end $$;

create function public.remove_owner(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare
  e text := lower(trim(coalesce(p_email, '')));
begin
  if not public.is_owner() then raise exception 'Solo un proprietario può togliere proprietari'; end if;
  if e = (select lower(email) from public.profiles where id = auth.uid()) then
    raise exception 'Non puoi togliere te stesso dai proprietari';
  end if;
  delete from public.owner_emails where email = e;
  delete from public.owner_setup where email = e;
  update public.profiles p
    set role = case when exists (select 1 from public.trainer_accounts a where a.email = e) then 'trainer' else 'client' end
    where lower(p.email) = e and p.role = 'owner';
end $$;
revoke execute on function public.add_owner(text) from public, anon;
revoke execute on function public.remove_owner(text) from public, anon;
grant execute on function public.add_owner(text) to authenticated;
grant execute on function public.remove_owner(text) to authenticated;

-- ===== 0020_nota_bonifico_conferme.sql =====

-- Campo Cani: nota del cliente alla prenotazione, codice fiscale solo per chi vuole la fattura,
-- pagamento con bonifico istantaneo sul conto del proprietario e conferma del cellulare con un SMS.
-- Da eseguire nel SQL Editor di Supabase dopo 0019_piu_proprietari.sql.

-- ---------------------------------------------------------------
-- Fattura solo a richiesta
-- ---------------------------------------------------------------
-- Chi non vuole la fattura (doc_pref = 'receipt') prenota senza codice fiscale e indirizzo.
create function public.billing_ok(p public.profiles) returns boolean
language sql immutable as $$
  select p.doc_pref = 'receipt' or public.has_billing(p)
$$;

-- ---------------------------------------------------------------
-- Bonifico istantaneo
-- ---------------------------------------------------------------
-- I dati del conto li vedono solo i clienti con un account (le impostazioni sono leggibili da tutti).
create table public.transfer_settings (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  holder text not null default '',
  iban text not null default '' check (iban = '' or iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'),
  check (not enabled or (holder <> '' and iban <> ''))
);
insert into public.transfer_settings (id) values (1);
alter table public.transfer_settings enable row level security;
create policy "conto letto da chi ha un account" on public.transfer_settings for select using (auth.uid() is not null);
create policy "conto del proprietario" on public.transfer_settings for update using (public.is_owner()) with check (public.is_owner());

alter table public.bookings drop constraint bookings_pay_check;
alter table public.bookings add constraint bookings_pay_check check (pay in ('online', 'onsite', 'package', 'transfer'));

-- La nota del cliente (la colonna c'era già, vuota): la vedono proprietario e trainer.
alter table public.bookings add constraint bookings_note_length check (length(note) <= 500);

-- Una lezione pagata con bonifico, segnata come pagata dal proprietario, ha la fattura o lo scontrino
-- automatico come quelle pagate online.
create or replace function public.invoice_online_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cfg public.invoice_settings; pr public.profiles; lt public.lesson_types; taxable int;
begin
  if new.pay not in ('online', 'transfer') or not new.paid or new.price_cents <= 0 then return new; end if;
  if tg_op = 'UPDATE' and old.paid then return new; end if;
  select * into cfg from public.invoice_settings where id = 1;
  if not cfg.auto_invoice then return new; end if;
  if exists (select 1 from public.invoices where booking_id = new.id) then return new; end if;
  select * into pr from public.profiles where id = new.user_id;
  select * into lt from public.lesson_types where id = new.lesson_type;
  taxable := case when cfg.tax_regime = 'RF19' then new.price_cents
                  else round(new.price_cents / (1 + cfg.vat_rate / 100)) end;
  insert into public.invoices (kind, user_id, booking_id, buyer_name, buyer_tax_code, buyer_street, buyer_zip, buyer_city, buyer_province,
    description, total_cents, taxable_cents, vat_cents, vat_rate, nature)
  values (case when pr.doc_pref = 'receipt' then 'receipt' else 'invoice' end, new.user_id, new.id, trim(pr.first_name || ' ' || pr.last_name), pr.tax_code,
    pr.billing_street, pr.billing_zip, pr.billing_city, nullif(pr.billing_province, ''),
    concat_ws(' · ', 'Lezione ' || coalesce(lt.label, new.lesson_type), nullif(new.lesson_option, ''), to_char(new.day, 'DD/MM/YYYY')),
    new.price_cents, taxable, new.price_cents - taxable,
    case when cfg.tax_regime = 'RF19' then 0 else cfg.vat_rate end,
    case when cfg.tax_regime = 'RF19' then 'N2.2' end);
  return new;
end $$;

-- ---------------------------------------------------------------
-- Cellulare confermato con un SMS
-- ---------------------------------------------------------------
-- Si accende quando Supabase ha un servizio SMS (lo fa il gestore, o a mano: vedi README).
alter table public.settings add column sms_check boolean not null default false;
-- Vero per chi c'era già e per chi si iscrive quando la conferma è spenta.
alter table public.profiles add column phone_ok boolean not null default true;

-- Solo la conferma dell'SMS (o un proprietario) segna il cellulare come verificato.
create or replace function public.guard_profile() returns trigger
language plpgsql as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_owner() then
    raise exception 'Non puoi cambiare il ruolo';
  end if;
  if new.phone_ok and not old.phone_ok and auth.uid() is not null and not public.is_owner()
    and coalesce(current_setting('k9.phone_ok', true), '') <> 'si' then
    raise exception 'Il cellulare si conferma con il codice SMS';
  end if;
  return new;
end $$;

-- Supabase scrive phone_confirmed_at quando il cliente inserisce il codice ricevuto per SMS.
create function public.phone_confirmed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.phone_confirmed_at is not null and new.phone is not null and new.phone <> '' then
    perform set_config('k9.phone_ok', 'si', true);
    update public.profiles set phone_ok = true, phone = '+' || ltrim(new.phone, '+') where id = new.id;
  end if;
  return new;
end $$;
create trigger on_auth_phone_confirmed after update of phone_confirmed_at on auth.users
  for each row when (new.phone_confirmed_at is distinct from old.phone_confirmed_at) execute function public.phone_confirmed();

-- L'iscrizione salva anche la scelta fra fattura e scontrino e, se la conferma è accesa, chiede l'SMS.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  d jsonb;
begin
  insert into public.profiles (id, first_name, last_name, phone, email, rules_ver, privacy_ver, rules_accepted_at, privacy_accepted_at,
                               tax_code, billing_street, billing_zip, billing_city, billing_province, social_consent, doc_pref, phone_ok)
  values (new.id, coalesce(m->>'first_name',''), coalesce(m->>'last_name',''), coalesce(m->>'phone',''), coalesce(new.email,''),
          (m->>'rules_ver')::int, (m->>'privacy_ver')::int,
          case when m ? 'rules_ver' then now() end, case when m ? 'privacy_ver' then now() end,
          upper(regexp_replace(coalesce(m->>'tax_code',''), '\s', '', 'g')),
          trim(coalesce(m->>'billing_street','')), trim(coalesce(m->>'billing_zip','')),
          trim(coalesce(m->>'billing_city','')), upper(trim(coalesce(m->>'billing_province',''))),
          coalesce((m->>'social_consent')::boolean, false),
          case when m->>'doc_pref' = 'receipt' then 'receipt' else 'invoice' end,
          not coalesce((select sms_check from public.settings where id = 1), false));
  for d in select * from jsonb_array_elements(coalesce(m->'dogs','[]'::jsonb)) loop
    if length(trim(coalesce(d->>'name',''))) > 0 then
      insert into public.dogs (owner_id, name, breed, birth)
      values (new.id, trim(d->>'name'), coalesce(d->>'breed',''), nullif(d->>'birth','')::date);
    end if;
  end loop;
  return new;
end $$;

-- ---------------------------------------------------------------
-- Prenotazioni: nota, bonifico, fattura a richiesta, cellulare confermato
-- ---------------------------------------------------------------
-- I controlli del cliente comuni a book_slot e join_class.
create function public.check_client_booking(pr public.profiles, s public.settings, p_pay text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if pr.rules_ver is distinct from s.rules_ver or pr.privacy_ver is distinct from s.privacy_ver then
    raise exception 'Devi prima accettare regolamento e privacy aggiornati';
  end if;
  if not public.billing_ok(pr) then raise exception 'Completa codice fiscale e indirizzo di fatturazione nel Profilo'; end if;
  if not pr.phone_ok then raise exception 'Conferma il tuo cellulare con il codice SMS'; end if;
  if p_pay = 'online' and not s.online_payments then raise exception 'Il pagamento online non è ancora attivo'; end if;
  if p_pay = 'transfer' and not coalesce((select enabled from public.transfer_settings where id = 1), false) then
    raise exception 'Il pagamento con bonifico non è attivo';
  end if;
  if p_pay is not null and p_pay not in ('online', 'onsite', 'transfer') then raise exception 'Pagamento non valido'; end if;
end $$;
revoke all on function public.check_client_booking(public.profiles, public.settings, text) from public, anon, authenticated;

drop function public.join_class(uuid, uuid, text, uuid);
create function public.join_class(p_class uuid, p_dog uuid, p_pay text default 'onsite', p_user uuid default null, p_note text default '')
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  s public.settings; c public.classes; t public.lesson_types; pr public.profiles; dg public.dogs;
  cp public.client_packages; res public.bookings; usr uuid; owner boolean := public.is_owner();
  nt text := left(trim(coalesce(p_note, '')), 500);
begin
  if auth.uid() is null then raise exception 'Devi accedere per prenotare'; end if;
  if p_user is not null and not owner then raise exception 'Solo il proprietario può prenotare per un cliente'; end if;
  usr := coalesce(p_user, auth.uid());
  select * into s from public.settings where id = 1;
  if p_user is null then
    select * into pr from public.profiles where id = usr;
    perform public.check_client_booking(pr, s, p_pay);
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
      package_id, trainer_id, class_id, note)
    values (usr, p_dog, c.field_id, c.lesson_type, c.lesson_option, c.day, c.start_min, c.dur_min, 0, 'package', true, cp.id, c.trainer_id, c.id, nt)
    returning * into res;
  else
    insert into public.bookings (user_id, dog_id, field_id, lesson_type, lesson_option, day, start_min, dur_min, price_cents, pay, paid,
      trainer_id, class_id, note)
    values (usr, p_dog, c.field_id, c.lesson_type, c.lesson_option, c.day, c.start_min, c.dur_min, t.price_cents,
      case when p_user is null then coalesce(p_pay, 'onsite') else 'onsite' end, false, c.trainer_id, c.id, nt)
    returning * into res;
  end if;
  return res;
end $$;

drop function public.book_slot(uuid, uuid, text, text, date, int, text);
create function public.book_slot(p_field uuid, p_dog uuid, p_type text, p_option text, p_day date, p_start int, p_pay text,
  p_note text default '')
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  s public.settings; t public.lesson_types; pr public.profiles; dg public.dogs; f public.fields; av int[]; m int;
  cp public.client_packages; res public.bookings;
  nt text := left(trim(coalesce(p_note, '')), 500);
begin
  if auth.uid() is null then raise exception 'Devi accedere per prenotare'; end if;
  select * into s from public.settings where id = 1;
  select * into pr from public.profiles where id = auth.uid();
  perform public.check_client_booking(pr, s, p_pay);
  select * into f from public.fields where id = p_field and active;
  if f.id is null then raise exception 'Campo non disponibile'; end if;
  select * into dg from public.dogs where id = p_dog and owner_id = auth.uid() and not archived;
  if dg.id is null then raise exception 'Cane non trovato'; end if;
  if dg.blocked then raise exception 'Le prenotazioni per questo cane sono sospese. Contatta il campo.'; end if;
  select * into t from public.lesson_types where id = p_type and active;
  if t.id is null then raise exception 'Tipo di lezione non valido'; end if;
  if t.group_seats is not null then raise exception 'Questa lezione si fa in gruppo: scegli una classe'; end if;
  if cardinality(t.options) > 0 and not (p_option = any(t.options)) then raise exception 'Specialità non valida'; end if;
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
    insert into public.bookings (user_id, dog_id, field_id, lesson_type, lesson_option, day, start_min, dur_min, price_cents, pay, paid, package_id, note)
    values (auth.uid(), p_dog, p_field, p_type, coalesce(p_option,''), p_day, p_start, t.duration_min, 0, 'package', true, cp.id, nt)
    returning * into res;
  else
    insert into public.bookings (user_id, dog_id, field_id, lesson_type, lesson_option, day, start_min, dur_min, price_cents, pay, paid, note)
    values (auth.uid(), p_dog, p_field, p_type, coalesce(p_option,''), p_day, p_start, t.duration_min, t.price_cents, coalesce(p_pay,'onsite'), false, nt)
    returning * into res;
  end if;
  return res;
end $$;

revoke all on function public.join_class(uuid, uuid, text, uuid, text) from public, anon;
revoke all on function public.book_slot(uuid, uuid, text, text, date, int, text, text) from public, anon;
grant execute on function public.join_class(uuid, uuid, text, uuid, text) to authenticated;
grant execute on function public.book_slot(uuid, uuid, text, text, date, int, text, text) to authenticated;

-- ===== 0021_nexi.sql =====

-- Campo Cani: pagamento con carta tramite Nexi XPay, per ora solo nell'ambiente di prova di Nexi (nessun
-- pagamento vero). Il proprietario lo accende da Impostazioni → Pagamenti; il cliente paga sulla pagina di Nexi
-- e la funzione "nexi" segna la lezione come pagata (fattura o scontrino automatici come per gli altri pagamenti).
-- Da eseguire nel SQL Editor di Supabase dopo 0020_nota_bonifico_conferme.sql.

-- Gli ordini mandati a Nexi. Nessuna policy: li leggono e scrivono solo la funzione nexi, con la chiave di servizio.
create table public.nexi_orders (
  -- L'orderId mandato a Nexi (al massimo 18 caratteri).
  id text primary key check (id ~ '^[A-Z0-9]{1,18}$'),
  booking_id uuid not null references public.bookings on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  amount_cents int not null check (amount_cents > 0),
  -- Il token che Nexi rimanda nella notifica dell'esito: dice che la notifica viene davvero da Nexi.
  security_token text not null default '',
  status text not null default 'created' check (status in ('created', 'paid', 'failed', 'refunded')),
  -- L'operazione di pagamento, che serve per il rimborso.
  operation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.nexi_orders (booking_id);
alter table public.nexi_orders enable row level security;

-- ===== 0022_voto_lezioni.sql =====

-- Campo Cani: il cliente dà un voto da 1 a 5 alla lezione fatta, con un commento facoltativo.
-- Il proprietario vede voti e commenti nella pagina Incassi.
-- Da eseguire nel SQL Editor di Supabase dopo 0021_nexi.sql.

-- Un voto per lezione. Il giorno è copiato dalla lezione per leggere i voti di un periodo.
create table public.lesson_ratings (
  booking_id uuid primary key references public.bookings on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  day date not null,
  score int not null check (score between 1 and 5),
  comment text not null default '' check (length(comment) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.lesson_ratings (day);
alter table public.lesson_ratings enable row level security;
create policy "voti propri o proprietario" on public.lesson_ratings for select using (user_id = auth.uid() or public.is_owner());
create policy "voti proprietario" on public.lesson_ratings for delete using (public.is_owner());

-- Il cliente vota una sua lezione già cominciata; votando di nuovo cambia il voto.
create function public.rate_lesson(p_booking uuid, p_score int, p_comment text default '') returns public.lesson_ratings
language plpgsql security definer set search_path = public as $$
declare b public.bookings; r public.lesson_ratings;
begin
  select * into b from public.bookings where id = p_booking and user_id = auth.uid() and status = 'active';
  if b.id is null then raise exception 'Lezione non trovata'; end if;
  if (b.day + make_interval(mins => b.start_min)) > (now() at time zone 'Europe/Rome') then
    raise exception 'Si vota la lezione dopo averla fatta';
  end if;
  if p_score is null or p_score not between 1 and 5 then raise exception 'Scegli un voto da 1 a 5'; end if;
  insert into public.lesson_ratings (booking_id, user_id, day, score, comment)
  values (b.id, b.user_id, b.day, p_score, left(trim(coalesce(p_comment, '')), 500))
  on conflict (booking_id) do update set score = excluded.score, comment = excluded.comment, updated_at = now()
  returning * into r;
  return r;
end $$;
grant execute on function public.rate_lesson(uuid, int, text) to authenticated;

-- ===== 0023_cani.sql =====

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

-- ===== 0024_clienti_societa.sql =====

-- Campo Cani: il cliente sceglie se è una persona o un'associazione/società.
-- Una persona riceve solo lo scontrino; un'associazione o società sceglie scontrino o fattura, con i suoi dati.
-- Da eseguire nel SQL Editor di Supabase dopo 0023_cani.sql.

alter table public.profiles
  add column client_kind text not null default 'persona' check (client_kind in ('persona', 'societa')),
  -- I dati della società; il codice fiscale e la sede sono quelli di sempre (tax_code e billing_*).
  add column company_name text not null default '' check (length(company_name) <= 120),
  add column vat_number text not null default '' check (vat_number = '' or vat_number ~ '^[0-9]{11}$'),
  add column sdi_code text not null default '' check (sdi_code = '' or sdi_code ~ '^[A-Z0-9]{7}$'),
  add column pec text not null default '' check (length(pec) <= 120);

-- Una persona ha solo lo scontrino: lo tiene così anche chi usa un'app vecchia che chiede ancora la fattura.
create function public.receipt_for_people() returns trigger
language plpgsql as $$
begin
  if new.client_kind = 'persona' then new.doc_pref := 'receipt'; end if;
  return new;
end $$;
create trigger profiles_receipt_for_people before insert or update on public.profiles
  for each row execute function public.receipt_for_people();
alter table public.profiles alter column doc_pref set default 'receipt';
update public.profiles set doc_pref = 'receipt' where client_kind = 'persona' and doc_pref <> 'receipt';

-- I dati completi per la fattura: per una società serve anche la ragione sociale.
create or replace function public.has_billing(p public.profiles) returns boolean
language sql immutable as $$
  select p.tax_code <> '' and p.billing_street <> '' and p.billing_zip <> '' and p.billing_city <> ''
    and (p.client_kind <> 'societa' or p.company_name <> '')
$$;

-- La fattura a una società: ragione sociale, partita IVA e dove arriva (SDI o PEC).
alter table public.invoices
  add column buyer_vat text,
  add column buyer_sdi text,
  add column buyer_pec text;

-- Le fatture nascono da più trigger (lezioni, pacchetti): qui, una volta sola, si mettono i dati della società.
create function public.invoice_company_buyer() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pr public.profiles;
begin
  if new.user_id is null then return new; end if;
  select * into pr from public.profiles where id = new.user_id;
  if pr.client_kind = 'societa' and pr.company_name <> '' then
    new.buyer_name := pr.company_name;
    new.buyer_vat := nullif(pr.vat_number, '');
    new.buyer_sdi := nullif(pr.sdi_code, '');
    new.buyer_pec := nullif(pr.pec, '');
  end if;
  return new;
end $$;
create trigger invoices_company_buyer before insert on public.invoices
  for each row execute function public.invoice_company_buyer();

-- L'iscrizione: persona o società, con i dati della società se vuole la fattura.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  d jsonb;
  ch text;
  kind text := case when m->>'client_kind' = 'societa' then 'societa' else 'persona' end;
begin
  insert into public.profiles (id, first_name, last_name, phone, email, rules_ver, privacy_ver, rules_accepted_at, privacy_accepted_at,
                               tax_code, billing_street, billing_zip, billing_city, billing_province, social_consent, doc_pref, phone_ok,
                               client_kind, company_name, vat_number, sdi_code, pec)
  values (new.id, coalesce(m->>'first_name',''), coalesce(m->>'last_name',''), coalesce(m->>'phone',''), coalesce(new.email,''),
          (m->>'rules_ver')::int, (m->>'privacy_ver')::int,
          case when m ? 'rules_ver' then now() end, case when m ? 'privacy_ver' then now() end,
          upper(regexp_replace(coalesce(m->>'tax_code',''), '\s', '', 'g')),
          trim(coalesce(m->>'billing_street','')), trim(coalesce(m->>'billing_zip','')),
          trim(coalesce(m->>'billing_city','')), upper(trim(coalesce(m->>'billing_province',''))),
          coalesce((m->>'social_consent')::boolean, false),
          case when kind = 'societa' and m->>'doc_pref' = 'invoice' then 'invoice' else 'receipt' end,
          not coalesce((select sms_check from public.settings where id = 1), false),
          kind, trim(coalesce(m->>'company_name','')),
          regexp_replace(upper(coalesce(m->>'vat_number','')), '^IT|\s', '', 'g'),
          upper(regexp_replace(coalesce(m->>'sdi_code',''), '\s', '', 'g')), lower(trim(coalesce(m->>'pec',''))));
  for d in select * from jsonb_array_elements(coalesce(m->'dogs','[]'::jsonb)) loop
    if length(trim(coalesce(d->>'name',''))) > 0 then
      -- Un microchip scritto male non blocca l'iscrizione: si lascia vuoto e si corregge dal Profilo.
      ch := regexp_replace(coalesce(d->>'chip',''), '\s', '', 'g');
      insert into public.dogs (owner_id, name, breed, birth, chip, goals, sex, neutered)
      values (new.id, trim(d->>'name'), coalesce(d->>'breed',''), nullif(d->>'birth','')::date,
              case when ch ~ '^[0-9]{15}$' then ch else '' end, left(trim(coalesce(d->>'goals','')), 500),
              case when d->>'sex' in ('M', 'F') then d->>'sex' else '' end,
              case when d->>'neutered' in ('true', 'false') then (d->>'neutered')::boolean end);
    end if;
  end loop;
  return new;
end $$;

-- ===== 0025_tesseramento.sql =====

-- Campo Cani: il tesseramento dei clienti e la quota campo.
-- Due quote periodiche, ognuna accesa a parte dal proprietario: la tessera (per esempio quella associativa dell'ASD)
-- e la quota campo (per esempio mensile, per frequentare il campo). Per ognuna nome, importo e durata: anno solare,
-- stagione sportiva (1 settembre - 31 agosto) o un numero di mesi dal pagamento. Il cliente la richiede o la rinnova
-- dal Profilo e la paga al campo o con bonifico; il proprietario, incassata la quota, la segna pagata (contanti,
-- carta o bonifico) e vale da quel giorno, o dal giorno dopo la scadenza di quella in corso se il cliente rinnova
-- prima. Il proprietario può anche registrare a mano il pagamento di chi paga al campo.
-- Se vuole, senza quota valida il cliente non prenota. Lo storico resta: ogni rinnovo è una riga.
-- Con IVA o senza, lo sceglie il proprietario: senza IVA (quota associativa di un'ASD, fuori campo IVA) non parte
-- nessun documento; con IVA, all'incasso parte la fattura o lo scontrino come per i pacchetti.
-- Da eseguire nel SQL Editor di Supabase dopo 0024_clienti_societa.sql.

create table public.membership_settings (
  kind text primary key check (kind in ('tessera', 'campo')),
  enabled boolean not null default false,
  name text not null check (length(trim(name)) between 1 and 60),
  price_cents int not null default 0 check (price_cents >= 0),
  -- anno: fino al 31 dicembre; stagione: fino al 31 agosto; mesi: "months" mesi dal primo giorno.
  period text not null default 'anno' check (period in ('anno', 'stagione', 'mesi')),
  months int not null default 12 check (months between 1 and 24),
  -- Senza quota valida il giorno della lezione il cliente non prenota (il proprietario prenota lo stesso per lui).
  required boolean not null default false,
  -- Quanti giorni prima della scadenza il cliente può già rinnovare.
  renew_days int not null default 30 check (renew_days between 0 and 120),
  -- Con IVA: all'incasso fattura o scontrino automatici (se le fatture automatiche sono accese). Senza: nessun documento.
  vat boolean not null default false
);
insert into public.membership_settings (kind, name) values ('tessera', 'Tessera');
insert into public.membership_settings (kind, name, period, months, renew_days) values ('campo', 'Quota campo', 'mesi', 1, 7);
alter table public.membership_settings enable row level security;
create policy "quote lette da chi ha un account" on public.membership_settings for select using (auth.uid() is not null);
create policy "quote del proprietario" on public.membership_settings for update using (public.is_owner()) with check (public.is_owner());

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  kind text not null default 'tessera' references public.membership_settings,
  -- Il numero della tessera, anche quello dell'ente di promozione sportiva; vuoto se il centro non lo usa.
  number text not null default '' check (length(number) <= 30),
  price_cents int not null default 0 check (price_cents >= 0),
  status text not null default 'requested' check (status in ('requested', 'active', 'cancelled')),
  pay_method text not null default '' check (pay_method in ('', 'contanti', 'carta', 'bonifico')),
  starts_on date,
  expires_on date,
  requested_at timestamptz not null default now(),
  paid_at timestamptz,
  check (status <> 'active' or (starts_on is not null and expires_on is not null and expires_on >= starts_on))
);
create index on public.memberships (user_id, kind, expires_on);

-- L'ultimo giorno di una quota che inizia il giorno p_start.
create function public.membership_end(p_start date, p_period text, p_months int default 12) returns date
language sql immutable as $$
  select case p_period
    when 'stagione' then make_date(extract(year from p_start)::int + case when extract(month from p_start) >= 9 then 1 else 0 end, 8, 31)
    when 'mesi' then ((p_start - 1) + make_interval(months => p_months))::date
    else make_date(extract(year from p_start)::int, 12, 31)
  end
$$;

-- Il cliente ha una quota di quel tipo pagata che vale quel giorno.
create function public.has_membership(p_user uuid, p_day date, p_kind text default 'tessera') returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships
                 where user_id = p_user and kind = p_kind and status = 'active' and p_day between starts_on and expires_on)
$$;

-- Quando la quota diventa pagata: data del pagamento e periodo. Se il cliente ne ha già una dello stesso tipo che
-- vale ancora, quella nuova parte dal giorno dopo la sua scadenza (un rinnovo anticipato non fa perdere giorni).
create function public.guard_membership() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s public.membership_settings;
  last_day date;
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') then
    select * into s from public.membership_settings where kind = new.kind;
    new.paid_at := coalesce(new.paid_at, now());
    if new.starts_on is null then
      select max(expires_on) into last_day from public.memberships
      where user_id = new.user_id and kind = new.kind and status = 'active' and id <> new.id;
      new.starts_on := greatest((now() at time zone 'Europe/Rome')::date, last_day + 1);
    end if;
    new.expires_on := coalesce(new.expires_on, public.membership_end(new.starts_on, s.period, s.months));
  end if;
  return new;
end $$;
create trigger memberships_guard before insert or update on public.memberships
  for each row execute function public.guard_membership();

-- Il cliente chiede la quota o il rinnovo: resta "da pagare" finché il campo non segna l'incasso.
create function public.request_membership(p_kind text default 'tessera') returns public.memberships
language plpgsql security definer set search_path = public as $$
declare
  s public.membership_settings;
  last_day date;
  res public.memberships;
begin
  if auth.uid() is null then raise exception 'Devi accedere'; end if;
  select * into s from public.membership_settings where kind = p_kind;
  if not coalesce(s.enabled, false) then raise exception 'Il centro non usa questa quota'; end if;
  if exists (select 1 from public.memberships where user_id = auth.uid() and kind = p_kind and status = 'requested') then
    raise exception 'L''hai già chiesta: il campo la attiva quando paghi';
  end if;
  select max(expires_on) into last_day from public.memberships where user_id = auth.uid() and kind = p_kind and status = 'active';
  if last_day is not null and last_day - s.renew_days > (now() at time zone 'Europe/Rome')::date then
    raise exception 'Vale ancora: potrai rinnovarla più avanti';
  end if;
  insert into public.memberships (user_id, kind, price_cents) values (auth.uid(), p_kind, s.price_cents) returning * into res;
  return res;
end $$;
revoke all on function public.request_membership from anon;

-- Quote obbligatorie: il cliente che prenota per sé (lezione o classe) deve averle valide il giorno della lezione.
-- Il proprietario che prenota per un cliente non è fermato.
create function public.check_membership() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s public.membership_settings;
begin
  if auth.uid() is null or new.user_id is distinct from auth.uid() then return new; end if;
  if not exists (select 1 from public.profiles where id = new.user_id and role = 'client') then return new; end if;
  for s in select * from public.membership_settings where enabled and required order by kind desc loop
    if not public.has_membership(new.user_id, new.day, s.kind) then
      if s.kind = 'campo' then
        raise exception 'Per prenotare serve la quota campo pagata per il giorno della lezione: rinnovala dal Profilo';
      end if;
      raise exception 'Per prenotare serve la tessera valida il giorno della lezione: rinnovala dal Profilo';
    end if;
  end loop;
  return new;
end $$;
create trigger bookings_check_membership before insert on public.bookings
  for each row execute function public.check_membership();

-- Quota con IVA: quando è pagata il database prepara fattura o scontrino, come per i pacchetti (0012).
alter table public.invoices add column membership_id uuid unique references public.memberships on delete set null;

create function public.invoice_membership() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cfg public.invoice_settings; s public.membership_settings; pr public.profiles; taxable int;
begin
  if new.status <> 'active' or (tg_op = 'UPDATE' and old.status = 'active') or new.price_cents <= 0 then return new; end if;
  select * into s from public.membership_settings where kind = new.kind;
  if not coalesce(s.vat, false) then return new; end if;
  select * into cfg from public.invoice_settings where id = 1;
  if not coalesce(cfg.auto_invoice, false) then return new; end if;
  if exists (select 1 from public.invoices where membership_id = new.id) then return new; end if;
  select * into pr from public.profiles where id = new.user_id;
  taxable := case when cfg.tax_regime = 'RF19' then new.price_cents
                  else round(new.price_cents / (1 + cfg.vat_rate / 100)) end;
  insert into public.invoices (kind, user_id, membership_id, buyer_name, buyer_tax_code, buyer_street, buyer_zip, buyer_city, buyer_province,
    description, total_cents, taxable_cents, vat_cents, vat_rate, nature)
  values (case when pr.doc_pref = 'receipt' then 'receipt' else 'invoice' end, new.user_id, new.id, trim(pr.first_name || ' ' || pr.last_name), pr.tax_code,
    pr.billing_street, pr.billing_zip, pr.billing_city, nullif(pr.billing_province, ''),
    s.name || ' dal ' || to_char(new.starts_on, 'DD/MM/YYYY') || ' al ' || to_char(new.expires_on, 'DD/MM/YYYY'),
    new.price_cents, taxable, new.price_cents - taxable,
    case when cfg.tax_regime = 'RF19' then 0 else cfg.vat_rate end,
    case when cfg.tax_regime = 'RF19' then 'N2.2' end);
  return new;
end $$;
create trigger memberships_invoice after insert or update of status on public.memberships
  for each row execute function public.invoice_membership();

alter table public.memberships enable row level security;
create policy "quote proprie o proprietario" on public.memberships for select using (user_id = auth.uid() or public.is_owner());
create policy "quote proprietario" on public.memberships for all using (public.is_owner()) with check (public.is_owner());

-- ===== 0026_bacheca_spese.sql =====

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

-- ===== 0027_campo_libero.sql =====

-- Campo Cani: il campo libero.
-- Un tipo di lezione può essere "campo libero": il cliente prenota il campo per il suo turno e lo paga come una
-- lezione (al campo, con carta, bonifico o pacchetto), ma senza trainer. Non conta tra le lezioni da assegnare e
-- non si fa in gruppo.
-- Da eseguire nel SQL Editor di Supabase dopo 0026_bacheca_spese.sql.

alter table public.lesson_types add column free_field boolean not null default false;
alter table public.lesson_types add constraint lesson_types_free_field_single check (not free_field or group_seats is null);

-- Sul campo libero non c'è trainer: se arriva, si toglie.
create function public.guard_free_field() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.trainer_id is not null and exists (select 1 from public.lesson_types where id = new.lesson_type and free_field) then
    new.trainer_id := null;
  end if;
  return new;
end $$;
create trigger bookings_free_field before insert or update of trainer_id, lesson_type on public.bookings
  for each row execute function public.guard_free_field();

-- ===== Titolare del centro =====

select public.set_owner_email('titolare@esempio.it');
