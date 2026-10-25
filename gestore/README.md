# Server gestore di K9 Manager

Il gestore è il tuo server: un progetto Supabase tuo, separato da quelli dei centri. Fa da solo quello che
oggi fai a mano con `tools/nuovo-centro.mjs`:

1. un centro si registra dall'app (**Registra il tuo centro**): nome, email del titolare, piano;
2. firma su Stripe il mandato di addebito diretto SEPA (mette l'IBAN, non paga niente subito);
3. il gestore crea il suo progetto Supabase, carica tutte le tabelle, rende proprietaria quella email e
   firma la licenza con la **chiave del server**. Il centro riceve il codice corto (K9-XXXXXX) da dare a
   clienti e trainer;
4. il primo del mese il gestore conta le prenotazioni del mese prima di ogni centro (non disdette, pagate al
   campo) e le addebita con **Stripe Billing**: fattura Stripe pagata col mandato SEPA, mandata anche per
   email al centro. Pagata la fattura, la licenza si allunga fino alla fine del mese dopo. Se non viene
   pagata la licenza non si rinnova e scade da sola: circa un mese di tolleranza;
5. quando esce una migrazione nuova dell'app, il gestore la aggiunge da solo al database di ogni centro;
6. il proprietario del centro collega da Impostazioni il conto Stripe dove riceverà i pagamenti online dei
   clienti (Stripe Connect). Per legge i dati del centro (documento, partita IVA, IBAN) li chiede Stripe.

Ogni centro ha il suo database: i clienti di un centro non stanno mai nello stesso posto di quelli di un
altro, e i proprietari di un centro non vedono niente degli altri. Il gestore conserva solo nome, email del
titolare, codice, stato dei pagamenti e il numero di prenotazioni del mese: mai i dati dei clienti.

Il pannello **K9 Gestore** (workflow "Pannello del gestore") ti mostra tutti i centri, gli addebiti e le
statistiche, e ti lascia cambiare piano e tariffa, rinnovare a mano, sospendere i rinnovi, segnare un
bonifico come pagato e riprovare una preparazione non riuscita.

**Stripe resta in modalità test** finché non decidi tu: il gestore rifiuta le chiavi `sk_live_` se non
imposti anche `STRIPE_LIVE=si`.

## Cosa contiene

| | |
|---|---|
| `supabase/migrations/0001_centri.sql` | tabelle `centri` e `addebiti` del gestore |
| `registra-centro` | registrazione dall'app e link di Stripe per il mandato |
| `centro` | stato di un centro dal codice (e pagina di ritorno da Stripe) |
| `prepara-centri` | crea e aggiorna i database dei centri, un passo alla volta (pg_cron ogni minuto) |
| `stripe-webhook` | mandato firmato, fattura pagata o non pagata |
| `addebito-mensile` | fatture del mese con Stripe Billing (pg_cron il primo del mese) |
| `stripe-collega` | conto Stripe Connect del centro, dalle Impostazioni del proprietario |
| `pannello` | i dati e le azioni del pannello K9 Gestore |

## Come si accende (una volta sola)

Tutti i comandi si lanciano **sul tuo computer**, nella cartella del progetto. Nessuna chiave segreta va
in chat, nell'app o su GitHub.

1. **Progetto del gestore.** Su supabase.com crea un progetto nuovo, per esempio "K9 Gestore". Nel SQL
   Editor esegui `gestore/supabase/migrations/0001_centri.sql`. In Authentication → Users → Add user crea
   il tuo utente (email e password): con quello entri nel pannello.

2. **Chiave del server per le licenze.**

   ```
   node tools/licenza.mjs chiavi-server
   ```

   La privata finisce in `~/.campo-cani/gestore.env`. La riga `LICENSE_SERVER_KEY` che stampa va incollata
   in `src/lib/license-key.ts` (e nei segreti delle funzioni dei centri, se usi il report mensile).

3. **Gli altri segreti.** Aggiungili in fondo a `~/.campo-cani/gestore.env`, una riga ciascuno:

   ```
   TOKEN_SUPABASE=sbp_...              # supabase.com → Account → Access Tokens: crea i progetti dei centri
   ORGANIZZAZIONE_SUPABASE=...         # facoltativo: id o slug dell'organizzazione dei centri
   WEBHOOK_SECRET=...                  # una parola segreta lunga a piacere, per pg_cron
   AMMINISTRATORI=tua@email.it         # chi entra nel pannello (separati da virgola)
   STRIPE_SECRET_KEY=sk_test_...       # Stripe → Developers → API keys (modalità test)
   STRIPE_WEBHOOK_SECRET=whsec_...     # dal passo 5
   TARIFFA_CENTESIMI=100               # facoltativo: 1 € a prenotazione per i centri nuovi
   ```

   Facoltativi: `REGIONE_SUPABASE` (predefinita eu-central-1), `MAX_CENTRI_AL_GIORNO` (20),
   `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (per le email della password dimenticata
   dei clienti e per il codice che conferma l'email all'iscrizione: senza un SMTP proprio Supabase non le manda e
   chi si iscrive entra subito), `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGE_SERVICE_SID` (per il
   codice SMS che conferma il cellulare dei clienti nuovi; ogni SMS lo paghi a Twilio), `SENZA_MANDATO=si` (solo per
   provare senza Stripe: il centro si prepara subito, senza mandato).

   SMTP e Twilio valgono per i centri preparati dopo averli messi: a un centro già pronto si aggiungono a mano da
   Supabase, come spiega il README principale (Email).

   Il token di Supabase può creare progetti sul tuo account: tienilo solo qui. Ogni centro è un progetto,
   e oltre i 2 progetti gratuiti Supabase chiede il piano a pagamento.

4. **Funzioni e segreti sul gestore** (`<ref>` è il codice del progetto gestore):

   ```
   npx supabase secrets set --env-file ~/.campo-cani/gestore.env --project-ref <ref>
   npx supabase functions deploy --project-ref <ref> --workdir gestore
   ```

5. **Stripe (modalità test).** In Settings → Payment methods attiva **SEPA Direct Debit**. In Connect
   attiva gli account Express. In Developers → Webhooks aggiungi l'endpoint
   `https://<ref>.supabase.co/functions/v1/stripe-webhook` con gli eventi `checkout.session.completed`,
   `invoice.paid` e `invoice.payment_failed`, copia il signing secret in `STRIPE_WEBHOOK_SECRET` e ripeti il
   `secrets set` del passo 4. Per l'email delle fatture: Settings → Customer emails → "Successful payments" e
   "Finalized invoices".

6. **Orari automatici.** Nel SQL Editor del gestore (Database → Extensions: attiva `pg_cron` e `pg_net`):

   ```sql
   select cron.schedule('prepara-centri', '* * * * *', $$
     select net.http_post('https://<ref>.supabase.co/functions/v1/prepara-centri',
       headers := jsonb_build_object('x-webhook-secret', '<WEBHOOK_SECRET>'))
   $$);
   select cron.schedule('addebito-mensile', '0 7 1 * *', $$
     select net.http_post('https://<ref>.supabase.co/functions/v1/addebito-mensile',
       headers := jsonb_build_object('x-webhook-secret', '<WEBHOOK_SECRET>'))
   $$);
   ```

7. **L'app.** Nelle build per gli store e per i centri imposta `EXPO_PUBLIC_GESTORE_URL` =
   `https://<ref>.supabase.co/functions/v1` (senza `EXPO_PUBLIC_SUPABASE_URL`: ogni centro ha il suo
   database, che l'app prende dalla licenza). Compaiono "Registra il tuo centro" e il campo per il codice
   del centro.

8. **Il pannello.** Actions → "Pannello del gestore" → Run workflow, con l'indirizzo del passo 7 e la
   publishable key del progetto gestore. Lo scarichi da Releases → "K9 Gestore".

## Prove

```
deno test gestore/supabase/functions/_shared/
```

Provano la firma delle licenze (lette come le legge l'app), la firma degli eventi Stripe e tutti i passi
della preparazione di un centro con un Supabase finto.

## Se qualcosa va storto

- **Un centro resta in errore** (per esempio il limite dei progetti gratuiti): nel pannello leggi
  l'errore, sistema la causa e premi "Riprova la preparazione".
- **Un addebito non è passato:** nel pannello compare in "Da guardare". Se il centro paga con un bonifico,
  premi "Pagato con bonifico": la licenza si allunga.
- **Rifare l'addebito di un mese:** nel pannello, "Addebita adesso" con il mese (AAAA-MM). I centri già
  addebitati per quel mese vengono saltati.
