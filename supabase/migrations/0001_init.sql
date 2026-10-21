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
