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
