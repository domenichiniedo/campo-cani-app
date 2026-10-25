-- K9 Manager, server gestore: i centri pagano ogni mese con un bonifico istantaneo sul tuo conto, che il gestore
-- trova da solo nei movimenti (niente più addebito SEPA con Stripe); senza pagamento l'app si blocca dopo pochi
-- giorni. Prezzi per piano, con il cambio di piano deciso dal centro nell'app.
-- Va eseguito nel SQL Editor del progetto gestore dopo 0001_centri.sql.

-- IBAN da cui il centro fa i bonifici: serve a riconoscerli anche senza il codice nella causale.
alter table public.centri add column iban text not null default '' check (iban = '' or iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$');
-- Prezzi fatti apposta per un centro; null = quelli del suo piano.
alter table public.centri alter column tariffa_cents drop not null;
alter table public.centri alter column tariffa_cents set default null;
alter table public.centri add column canone_cents int check (canone_cents >= 0);
-- La tariffa uguale a quella di partenza (1 €) passa a seguire il piano; quelle cambiate a mano restano.
update public.centri set tariffa_cents = null where tariffa_cents = 100;

-- Il prezzo di ogni piano: canone al mese e quota per prenotazione. Li cambi dal pannello.
create table public.piani (
  piano text primary key check (piano in ('base', 'professional', 'pro')),
  canone_cents int not null default 0 check (canone_cents >= 0),
  tariffa_cents int not null default 100 check (tariffa_cents >= 0)
);
insert into public.piani (piano) values ('base'), ('professional'), ('pro');
alter table public.piani enable row level security;

-- Ogni cambio di piano, dal giorno in cui vale: l'addebito del mese divide canone e quote fra i piani.
create table public.cambi_piano (
  id uuid primary key default gen_random_uuid(),
  centro uuid not null references public.centri on delete cascade,
  piano text not null check (piano in ('base', 'professional', 'pro')),
  dal date not null,
  da text not null default 'pannello' check (da in ('registrazione', 'app', 'pannello')),
  creato timestamptz not null default now()
);
create index on public.cambi_piano (centro, dal);
alter table public.cambi_piano enable row level security;
insert into public.cambi_piano (centro, piano, dal, da)
  select id, piano, (creato at time zone 'Europe/Rome')::date, 'registrazione' from public.centri;

alter table public.addebiti
  add column canone_cents int not null default 0,
  -- Entro questo giorno va pagato: dopo la licenza non si rinnova e l'app del centro si blocca.
  add column scadenza date,
  add column causale text not null default '',
  add column pagato_il date;

-- Il tuo conto in banca. Una riga sola. IBAN e intestatario sono quelli che i centri vedono nell'app per pagarti:
-- li scrivi e li cambi dal pannello. Il resto è il collegamento con Enable Banking (open banking, solo lettura).
create table public.banca (
  id int primary key default 1 check (id = 1),
  bonifico_iban text not null default '' check (bonifico_iban = '' or bonifico_iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'),
  bonifico_intestatario text not null default '',
  banca text not null default '',
  paese text not null default 'IT',
  tipo text not null default 'personal' check (tipo in ('personal', 'business')),
  sessione text,
  conto text,
  iban text not null default '',
  valido_fino timestamptz,
  -- Parola casuale del collegamento in corso, controllata al ritorno dalla banca.
  attesa text,
  ultimo_controllo timestamptz,
  errore text not null default ''
);
insert into public.banca (id) values (1);
alter table public.banca enable row level security;

-- I bonifici in entrata visti sul conto. centro e addebito vuoti: non riconosciuto, da abbinare a mano.
create table public.movimenti (
  id text primary key,
  data date not null,
  importo_cents int not null,
  iban text not null default '',
  nome text not null default '',
  causale text not null default '',
  centro uuid references public.centri on delete set null,
  addebiti uuid[] not null default '{}',
  creato timestamptz not null default now()
);
create index on public.movimenti (data);
alter table public.movimenti enable row level security;
