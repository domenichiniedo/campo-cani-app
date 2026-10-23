-- K9 Manager, server gestore: i centri che si registrano dall'app e gli addebiti mensili.
-- Va eseguito nel SQL Editor del progetto Supabase del gestore (il tuo, non quello di un centro).
-- Le tabelle non hanno policy: le leggono e scrivono solo le funzioni del gestore, con la chiave di servizio.

create table public.centri (
  id uuid primary key default gen_random_uuid(),
  -- Il codice che il centro dà a clienti e trainer (K9-XXXXXX); è anche l'id della sua licenza.
  codice text not null unique,
  campo text not null,
  email text not null,
  piano text not null check (piano in ('base', 'professional', 'pro')),
  -- mandato: aspetta la firma del mandato SEPA. Poi la preparazione va avanti da sola:
  -- progetto → avvio → database → chiavi → licenza → pronto. errore: troppi tentativi falliti.
  stato text not null default 'mandato'
    check (stato in ('mandato', 'progetto', 'avvio', 'database', 'chiavi', 'licenza', 'pronto', 'errore')),
  errore text not null default '',
  tentativi int not null default 0,
  occupato_fino timestamptz,
  -- Quanto paga il centro per ogni prenotazione, in centesimi.
  tariffa_cents int not null default 100 check (tariffa_cents >= 0),
  stripe_cliente text,
  stripe_metodo text,
  stripe_conto text,
  stripe_attivo boolean not null default false,
  progetto text,
  url text,
  chiave text,
  -- Quante migrazioni dell'app ha il suo database: quando ne esce una nuova, il gestore la aggiunge da solo.
  migrazioni int not null default 0,
  licenza text not null default '',
  scade date,
  -- Sospeso dal pannello: la licenza non si rinnova più da sola e scade alla sua data.
  sospeso boolean not null default false,
  creato timestamptz not null default now()
);
create index on public.centri (email, creato);
alter table public.centri enable row level security;

create table public.addebiti (
  id uuid primary key default gen_random_uuid(),
  centro uuid not null references public.centri on delete cascade,
  mese text not null check (mese ~ '^\d{4}-\d{2}$'),
  prenotazioni int not null,
  importo_cents int not null,
  -- zero: nessuna prenotazione, niente da addebitare. inviato: fattura Stripe creata, addebito in corso.
  stato text not null default 'da_fare' check (stato in ('da_fare', 'zero', 'inviato', 'pagato', 'non_pagato')),
  fattura text unique,
  errore text not null default '',
  creato timestamptz not null default now(),
  unique (centro, mese)
);
alter table public.addebiti enable row level security;

-- Prende fino a p_quanti centri da preparare (o già pronti ma con meno di p_migrazioni migrazioni) e li tiene
-- occupati per 5 minuti, così due giri della preparazione che si sovrappongono non lavorano sullo stesso centro.
create function public.prendi_centri(p_quanti int, p_migrazioni int) returns setof public.centri
language sql as $$
  update public.centri set occupato_fino = now() + interval '5 minutes'
  where id in (
    select id from public.centri
    where (stato in ('progetto', 'avvio', 'database', 'chiavi', 'licenza') or (stato = 'pronto' and migrazioni < p_migrazioni))
      and (occupato_fino is null or occupato_fino < now())
    order by creato
    limit p_quanti
    for update skip locked
  )
  returning *;
$$;
revoke execute on function public.prendi_centri(int, int) from public, anon, authenticated;
