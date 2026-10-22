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
