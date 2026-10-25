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
