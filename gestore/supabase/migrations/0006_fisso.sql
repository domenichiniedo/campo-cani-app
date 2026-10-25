-- K9 Manager, server gestore: il prezzo fisso al mese. Ogni centro sceglie come pagare il suo piano:
--   a consumo  canone al mese + quota per ogni prenotazione (come prima);
--   fisso      una cifra fissa al mese, senza quota per prenotazione.
-- La sceglie alla registrazione e la cambia dall'app (Impostazioni → Licenza); il conto del mese divide a giorni
-- canone e fisso come per i cambi di piano. Va eseguito nel SQL Editor del progetto gestore dopo 0005_bonus.sql.
-- Prezzi fissi di partenza, poi si cambiano dal pannello (Piani e addebiti):
--   Base 39 €, Professional 79 €, Pro 149 €.

alter table public.piani add column fisso_cents int not null default 0 check (fisso_cents >= 0);
update public.piani set fisso_cents = 3900 where piano = 'base';
update public.piani set fisso_cents = 7900 where piano = 'professional';
update public.piani set fisso_cents = 14900 where piano = 'pro';

alter table public.centri
  add column formula text not null default 'consumo' check (formula in ('consumo', 'fisso')),
  -- Prezzo fisso fatto apposta per il centro; null = quello del piano.
  add column fisso_cents int check (fisso_cents >= 0);

-- Ogni cambio segna piano e formula dal giorno in cui valgono: i cambi già fatti erano tutti a consumo.
alter table public.cambi_piano add column formula text not null default 'consumo' check (formula in ('consumo', 'fisso'));
