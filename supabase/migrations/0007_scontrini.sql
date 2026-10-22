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
