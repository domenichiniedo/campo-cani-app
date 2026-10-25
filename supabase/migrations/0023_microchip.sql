-- Campo Cani: il numero di microchip del cane, facoltativo ma consigliato all'iscrizione.
-- Da eseguire nel SQL Editor di Supabase dopo 0022_voto_lezioni.sql.

-- 15 cifre (ISO 11784), vuoto se il cliente non lo mette.
alter table public.dogs add column chip text not null default '' check (chip = '' or chip ~ '^[0-9]{15}$');

-- L'iscrizione lo legge dai cani mandati dall'app: handle_new_user è in 0024_clienti_societa.sql.
