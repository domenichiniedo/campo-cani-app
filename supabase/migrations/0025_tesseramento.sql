-- Campo Cani: il tesseramento dei clienti.
-- Il proprietario accende la tessera del centro (per esempio la tessera associativa dell'ASD), con nome, quota e
-- durata: anno solare, stagione sportiva (1 settembre - 31 agosto) o 12 mesi dal pagamento. Il cliente la richiede
-- o la rinnova dal Profilo e la paga al campo o con bonifico; il proprietario, incassata la quota, la segna pagata
-- (contanti, carta o bonifico) e la tessera vale da quel giorno, o dal giorno dopo la scadenza di quella in corso
-- se il cliente rinnova prima. Il proprietario può anche registrare a mano il pagamento di chi paga al campo.
-- Se vuole, senza tessera valida il cliente non prenota. Lo storico delle tessere resta: ogni rinnovo è una riga.
-- Con IVA o senza, lo sceglie il proprietario: senza IVA (quota associativa di un'ASD, fuori campo IVA) non parte
-- nessun documento; con IVA, all'incasso parte la fattura o lo scontrino come per i pacchetti.
-- Da eseguire nel SQL Editor di Supabase dopo 0024_clienti_societa.sql.

create table public.membership_settings (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  name text not null default 'Tessera' check (length(trim(name)) between 1 and 60),
  price_cents int not null default 0 check (price_cents >= 0),
  -- anno: fino al 31 dicembre; stagione: fino al 31 agosto; mesi: 12 mesi dal primo giorno.
  period text not null default 'anno' check (period in ('anno', 'stagione', 'mesi')),
  -- Senza tessera valida il giorno della lezione il cliente non prenota (il proprietario prenota lo stesso per lui).
  required boolean not null default false,
  -- Quanti giorni prima della scadenza il cliente può già rinnovare.
  renew_days int not null default 30 check (renew_days between 0 and 120),
  -- Con IVA: all'incasso fattura o scontrino automatici (se le fatture automatiche sono accese). Senza: nessun documento.
  vat boolean not null default false
);
insert into public.membership_settings (id) values (1);
alter table public.membership_settings enable row level security;
create policy "tessera letta da chi ha un account" on public.membership_settings for select using (auth.uid() is not null);
create policy "tessera del proprietario" on public.membership_settings for update using (public.is_owner()) with check (public.is_owner());

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
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
create index on public.memberships (user_id, expires_on);

-- L'ultimo giorno di una tessera che inizia il giorno p_start.
create function public.membership_end(p_start date, p_period text) returns date
language sql immutable as $$
  select case p_period
    when 'stagione' then make_date(extract(year from p_start)::int + case when extract(month from p_start) >= 9 then 1 else 0 end, 8, 31)
    when 'mesi' then ((p_start - 1) + interval '12 months')::date
    else make_date(extract(year from p_start)::int, 12, 31)
  end
$$;

-- Il cliente ha una tessera pagata che vale quel giorno.
create function public.has_membership(p_user uuid, p_day date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where user_id = p_user and status = 'active' and p_day between starts_on and expires_on)
$$;

-- Quando la tessera diventa pagata: data del pagamento e periodo. Se il cliente ha già una tessera che vale ancora,
-- quella nuova parte dal giorno dopo la sua scadenza (un rinnovo anticipato non fa perdere giorni).
create function public.guard_membership() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s public.membership_settings;
  last_day date;
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') then
    select * into s from public.membership_settings where id = 1;
    new.paid_at := coalesce(new.paid_at, now());
    if new.starts_on is null then
      select max(expires_on) into last_day from public.memberships
      where user_id = new.user_id and status = 'active' and id <> new.id;
      new.starts_on := greatest((now() at time zone 'Europe/Rome')::date, last_day + 1);
    end if;
    new.expires_on := coalesce(new.expires_on, public.membership_end(new.starts_on, coalesce(s.period, 'anno')));
  end if;
  return new;
end $$;
create trigger memberships_guard before insert or update on public.memberships
  for each row execute function public.guard_membership();

-- Il cliente chiede la tessera o il rinnovo: resta "da pagare" finché il campo non segna l'incasso.
create function public.request_membership() returns public.memberships
language plpgsql security definer set search_path = public as $$
declare
  s public.membership_settings;
  last_day date;
  res public.memberships;
begin
  if auth.uid() is null then raise exception 'Devi accedere'; end if;
  select * into s from public.membership_settings where id = 1;
  if not coalesce(s.enabled, false) then raise exception 'Il centro non usa la tessera'; end if;
  if exists (select 1 from public.memberships where user_id = auth.uid() and status = 'requested') then
    raise exception 'Hai già chiesto la tessera: il campo la attiva quando paghi';
  end if;
  select max(expires_on) into last_day from public.memberships where user_id = auth.uid() and status = 'active';
  if last_day is not null and last_day - s.renew_days > (now() at time zone 'Europe/Rome')::date then
    raise exception 'La tua tessera vale ancora: potrai rinnovarla più avanti';
  end if;
  insert into public.memberships (user_id, price_cents) values (auth.uid(), s.price_cents) returning * into res;
  return res;
end $$;
revoke all on function public.request_membership from anon;

-- Tessera obbligatoria: il cliente che prenota per sé (lezione o classe) deve averla valida il giorno della lezione.
-- Il proprietario che prenota per un cliente non è fermato.
create function public.check_membership() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s public.membership_settings;
begin
  if auth.uid() is null or new.user_id is distinct from auth.uid() then return new; end if;
  select * into s from public.membership_settings where id = 1;
  if not coalesce(s.enabled and s.required, false) then return new; end if;
  if not exists (select 1 from public.profiles where id = new.user_id and role = 'client') then return new; end if;
  if not public.has_membership(new.user_id, new.day) then
    raise exception 'Per prenotare serve la tessera valida il giorno della lezione: rinnovala dal Profilo';
  end if;
  return new;
end $$;
create trigger bookings_check_membership before insert on public.bookings
  for each row execute function public.check_membership();

-- Tessera con IVA: quando è pagata il database prepara fattura o scontrino, come per i pacchetti (0012).
alter table public.invoices add column membership_id uuid unique references public.memberships on delete set null;

create function public.invoice_membership() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cfg public.invoice_settings; s public.membership_settings; pr public.profiles; taxable int;
begin
  if new.status <> 'active' or (tg_op = 'UPDATE' and old.status = 'active') or new.price_cents <= 0 then return new; end if;
  select * into s from public.membership_settings where id = 1;
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
create policy "tessere proprie o proprietario" on public.memberships for select using (user_id = auth.uid() or public.is_owner());
create policy "tessere proprietario" on public.memberships for all using (public.is_owner()) with check (public.is_owner());
