-- K9 Manager, server gestore: i dati per fatturare a ogni centro il canone e le prenotazioni, chiesti
-- alla registrazione dall'app e modificabili dal pannello.
-- Va eseguito nel SQL Editor del progetto gestore dopo 0002_bonifici_piani.sql.

alter table public.centri
  -- Il nome sulla fattura (società, ditta o associazione), che può essere diverso dal nome del centro.
  add column ragione_sociale text not null default '',
  -- Almeno uno dei due (un'associazione può avere solo il codice fiscale).
  add column partita_iva text not null default '' check (partita_iva = '' or partita_iva ~ '^[0-9]{11}$'),
  add column codice_fiscale text not null default '' check (codice_fiscale = '' or codice_fiscale ~ '^([A-Z0-9]{16}|[0-9]{11})$'),
  -- La sede.
  add column indirizzo text not null default '',
  add column cap text not null default '' check (cap = '' or cap ~ '^[0-9]{5}$'),
  add column comune text not null default '',
  add column provincia text not null default '' check (provincia = '' or provincia ~ '^[A-Z]{2}$'),
  -- Dove arriva la fattura elettronica: codice destinatario del Sistema di Interscambio o PEC. Vuoti tutti e
  -- due: codice 0000000, la fattura va nel cassetto fiscale del centro.
  add column codice_sdi text not null default '' check (codice_sdi = '' or codice_sdi ~ '^[A-Z0-9]{7}$'),
  add column pec text not null default '';
