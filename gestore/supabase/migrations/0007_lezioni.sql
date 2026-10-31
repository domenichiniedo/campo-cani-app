-- Club Manager, server gestore: il cliente paga una lezione con il bonifico istantaneo direttamente dall'app.
-- Sceglie la sua banca, scrive il suo IBAN e conferma il bonifico già compilato verso il conto del centro
-- (pagamento disposto con Enable Banking, come "Paga ora"); appena la banca lo fa partire la lezione si segna
-- pagata da sola nel database del centro. Va eseguito nel SQL Editor del progetto gestore dopo 0006_fisso_pacchetti.sql.

-- Una riga per ogni tentativo; state è la parola casuale del ritorno dalla banca. Niente dati del cliente: solo la
-- prenotazione (id nel database del centro) e l'importo.
create table public.pagamenti_lezioni (
  id uuid primary key default gen_random_uuid(),
  centro uuid not null references public.centri on delete cascade,
  prenotazione uuid not null,
  importo_cents int not null check (importo_cents > 0),
  state text not null unique,
  payment_id text,
  stato text not null default '',
  errore text not null default '',
  -- La lezione è già segnata pagata nel database del centro.
  segnata boolean not null default false,
  creato timestamptz not null default now()
);
create index on public.pagamenti_lezioni (segnata, creato);
alter table public.pagamenti_lezioni enable row level security;
