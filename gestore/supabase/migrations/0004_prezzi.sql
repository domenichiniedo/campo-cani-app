-- Club Manager, server gestore: prezzi di partenza dei piani (canone al mese + quota per prenotazione).
-- Va eseguito nel SQL Editor del progetto gestore dopo 0003_fatturazione.sql. Poi i prezzi si cambiano dal
-- pannello (Piani e addebiti); i centri con prezzi fatti apposta tengono i loro.
--   Base:         5,90 € al mese + 1,00 € a prenotazione
--   Professional: 29,99 € al mese + 0,60 € a prenotazione
--   Pro:          80,00 € al mese + 0,30 € a prenotazione
update public.piani set canone_cents = 590, tariffa_cents = 100 where piano = 'base';
update public.piani set canone_cents = 2999, tariffa_cents = 60 where piano = 'professional';
update public.piani set canone_cents = 8000, tariffa_cents = 30 where piano = 'pro';
