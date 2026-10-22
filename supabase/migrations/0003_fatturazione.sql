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
