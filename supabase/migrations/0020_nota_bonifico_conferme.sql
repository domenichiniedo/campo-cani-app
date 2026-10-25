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
