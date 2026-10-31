-- Club Manager, server gestore: i bonus. Un bonus è un credito in euro di un centro che si scala dai conti del mese
-- finché non finisce. Lo dai dal pannello a un centro, oppure crei un codice bonus che il centro nuovo scrive
-- quando si registra dall'app.
-- Va eseguito nel SQL Editor del progetto gestore dopo 0004_prezzi.sql.

-- I codici bonus: ognuno vale un credito, per un numero di centri (null = senza limite) e fino a un giorno.
create table public.codici_bonus (
  codice text primary key check (codice ~ '^[A-Z0-9-]{4,20}$'),
  importo_cents int not null check (importo_cents between 1 and 100000),
  usi_max int check (usi_max is null or usi_max > 0),
  usati int not null default 0,
  scade date,
  nota text not null default '',
  attivo boolean not null default true,
  creato timestamptz not null default now()
);
alter table public.codici_bonus enable row level security;

-- Il credito di ogni centro: dal pannello (codice null) o da un codice bonus. residuo_cents scende a ogni conto.
create table public.crediti (
  id uuid primary key default gen_random_uuid(),
  centro uuid not null references public.centri on delete cascade,
  importo_cents int not null check (importo_cents between 1 and 100000),
  residuo_cents int not null check (residuo_cents >= 0 and residuo_cents <= importo_cents),
  codice text references public.codici_bonus on delete set null,
  nota text not null default '',
  creato timestamptz not null default now()
);
create index on public.crediti (centro, creato);
alter table public.crediti enable row level security;

-- Quanto bonus è stato scalato da ogni conto del mese (importo_cents è già al netto).
alter table public.addebiti add column bonus_cents int not null default 0;

-- Usa un codice bonus per un centro, se è ancora buono: torna il credito dato (0 = codice non valido).
create function public.usa_codice_bonus(p_codice text, p_centro uuid) returns int
language plpgsql as $$
declare
  c public.codici_bonus;
begin
  select * into c from public.codici_bonus where codice = upper(trim(p_codice)) for update;
  if not found or not c.attivo
     or (c.scade is not null and c.scade < (now() at time zone 'Europe/Rome')::date)
     or (c.usi_max is not null and c.usati >= c.usi_max) then
    return 0;
  end if;
  update public.codici_bonus set usati = usati + 1 where codice = c.codice;
  insert into public.crediti (centro, importo_cents, residuo_cents, codice, nota)
    values (p_centro, c.importo_cents, c.importo_cents, c.codice, c.nota);
  return c.importo_cents;
end $$;

-- Scala fino a p_importo dai crediti del centro, dal più vecchio: torna quanto ha scalato.
create function public.scala_crediti(p_centro uuid, p_importo int) returns int
language plpgsql as $$
declare
  r record;
  resto int := greatest(p_importo, 0);
  tolto int;
begin
  for r in select id, residuo_cents from public.crediti where centro = p_centro and residuo_cents > 0 order by creato for update loop
    exit when resto <= 0;
    tolto := least(resto, r.residuo_cents);
    update public.crediti set residuo_cents = residuo_cents - tolto where id = r.id;
    resto := resto - tolto;
  end loop;
  return greatest(p_importo, 0) - resto;
end $$;

-- Solo le funzioni del gestore (con la service role) le usano.
revoke execute on function public.usa_codice_bonus(text, uuid) from public, anon, authenticated;
revoke execute on function public.scala_crediti(uuid, int) from public, anon, authenticated;
