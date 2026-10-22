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
