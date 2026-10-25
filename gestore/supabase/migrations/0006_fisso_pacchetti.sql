-- K9 Manager, server gestore: il prezzo fisso al mese, la quota sui pacchetti, il passaggio a un piano più
-- piccolo dal mese dopo e la disdetta con un mese di preavviso.
-- Ogni centro sceglie come pagare il suo piano:
--   a consumo  canone al mese + quota per ogni prenotazione + il 2% del prezzo di ogni pacchetto attivato nel
--              mese (le lezioni scalate da un pacchetto non pagano la quota per prenotazione);
--   fisso      una cifra fissa al mese, senza quote.
-- La sceglie alla registrazione e la cambia dall'app (Impostazioni → Licenza); il conto del mese divide a giorni
-- canone e fisso come per i cambi di piano. Va eseguito nel SQL Editor del progetto gestore dopo 0005_bonus.sql.
-- Prezzi di partenza, poi si cambiano dal pannello (Piani e addebiti):
--   fisso Base 39 €, Professional 79 €, Pro 149 €; pacchetti 2% per tutti i piani.

alter table public.piani add column fisso_cents int not null default 0 check (fisso_cents >= 0);
update public.piani set fisso_cents = 3900 where piano = 'base';
update public.piani set fisso_cents = 7900 where piano = 'professional';
update public.piani set fisso_cents = 14900 where piano = 'pro';
-- La quota sui pacchetti in centesimi di punto: 200 = 2%.
alter table public.piani add column pacchetti_bp int not null default 200 check (pacchetti_bp between 0 and 10000);
-- Nel conto del mese: quanto vale la quota sui pacchetti (già compresa in importo_cents).
alter table public.addebiti add column pacchetti_cents int not null default 0;

alter table public.centri
  add column formula text not null default 'consumo' check (formula in ('consumo', 'fisso')),
  -- Prezzo fisso fatto apposta per il centro; null = quello del piano.
  add column fisso_cents int check (fisso_cents >= 0);

-- Un piano più piccolo scelto dall'app parte dal primo del mese dopo: fino ad allora resta quello di prima.
alter table public.centri add column piano_prossimo text check (piano_prossimo in ('base', 'professional', 'pro'));
-- Disdetta: l'ultimo giorno pagato (la fine del mese dopo quello della richiesta). Si chiede solo con i conti
-- pagati; il conto di quel mese arriva come sempre, poi la licenza non si rinnova più.
alter table public.centri add column disdetta date, add column disdetta_chiesta timestamptz;

-- Ogni cambio segna piano e formula dal giorno in cui valgono: i cambi già fatti erano tutti a consumo.
alter table public.cambi_piano add column formula text not null default 'consumo' check (formula in ('consumo', 'fisso'));
