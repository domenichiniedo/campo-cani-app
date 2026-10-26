-- K9 Manager, server gestore: chi apre un centro sceglie se è una persona o un'associazione (o società).
-- Una persona dà nome e cognome, telefono e codice fiscale; un'associazione tutti i dati della società.
-- Va eseguito nel SQL Editor del progetto gestore dopo 0007_lezioni.sql.

alter table public.centri
  -- I centri registrati prima avevano già i campi della società.
  add column tipo text not null default 'associazione' check (tipo in ('persona', 'associazione')),
  -- Il telefono del titolare, per l'assistenza.
  add column telefono text not null default '';
