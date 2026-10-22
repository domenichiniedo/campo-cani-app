-- Campo Cani: codice di licenza del centro, per l'app venduta ad altri centri.
-- Il centro incolla qui il codice rinnovato (da Impostazioni → Licenza) e tutti i suoi
-- clienti lo ricevono all'apertura dell'app. Il codice è firmato: modificarlo lo rende non valido.
-- Da eseguire nel SQL Editor di Supabase dopo 0007_scontrini.sql.

alter table public.settings add column license_code text not null default '';
