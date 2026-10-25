# Server gestore di K9 Manager

Il gestore è il tuo server: un progetto Supabase tuo, separato da quelli dei centri. Fa da solo quello che
oggi fai a mano con `tools/nuovo-centro.mjs`:

1. un centro si registra dall'app (**Registra il tuo centro**): nome, email del titolare, piano e, se vuole,
   l'IBAN da cui ti pagherà;
2. il gestore crea il suo progetto Supabase, carica tutte le tabelle, rende proprietaria quella email e
   firma la licenza con la **chiave del server**. Il centro riceve il codice corto (K9-XXXXXX) da dare a
   clienti e trainer;
3. il primo del mese il gestore fa il conto del mese prima di ogni centro: il **canone** del piano (diviso a
   giorni se il centro ha cambiato piano o si è registrato a metà mese) più la **quota** per ogni prenotazione
   non disdetta pagata al campo o con bonifico al centro. Il centro lo vede nell'app (Impostazioni → Licenza)
   con il tuo IBAN, la causale (`K9-XXXXXX AAAA-MM`) e il codice QR, e ti paga con un **bonifico istantaneo**;
4. ogni 6 ore il gestore legge i bonifici in entrata sul tuo conto (open banking con **Enable Banking**, solo
   lettura: non può muovere soldi), riconosce quelli dei centri dal codice nella causale o dall'IBAN e
   rinnova la licenza fino al giorno 3 del mese dopo. Se il bonifico non arriva entro il **giorno 3** la
   licenza scade e l'app del centro si blocca; appena arriva, la licenza si rinnova e l'app si sblocca;
5. il proprietario può **cambiare piano dall'app**: la licenza nuova arriva subito e canone e quote del mese
   si dividono a giorni fra il piano vecchio e quello nuovo;
6. quando esce una migrazione nuova dell'app, il gestore la aggiunge da solo al database di ogni centro;
7. il proprietario del centro collega da Impostazioni il conto Stripe dove riceverà i pagamenti online dei
   clienti (Stripe Connect). Per legge i dati del centro (documento, partita IVA, IBAN) li chiede Stripe.

Ogni centro ha il suo database: i clienti di un centro non stanno mai nello stesso posto di quelli di un
altro, e i proprietari di un centro non vedono niente degli altri. Il gestore conserva solo nome, email del
titolare, codice, stato dei pagamenti e il numero di prenotazioni del mese: mai i dati dei clienti.

Il pannello **K9 Gestore** (workflow "Pannello del gestore") ti mostra tutti i centri, gli addebiti e le
statistiche, e ti lascia scrivere e cambiare il tuo IBAN per i bonifici, i prezzi dei piani (canone e quota),
collegare il conto in banca, cambiare piano e prezzi di un centro, abbinare a mano un bonifico non riconosciuto,
rinnovare a mano, sospendere i rinnovi, segnare un addebito come pagato e riprovare una preparazione non riuscita.

Ai centri arrivano solo bonifici: nessun addebito diretto, nessuna carta.

**Stripe resta in modalità test** finché non decidi tu: il gestore rifiuta le chiavi `sk_live_` se non
imposti anche `STRIPE_LIVE=si`.

## Cosa contiene

| | |
|---|---|
| `supabase/migrations/0001_centri.sql` | tabelle `centri` e `addebiti` del gestore |
| `supabase/migrations/0002_bonifici_piani.sql` | prezzi dei piani, cambi di piano, il tuo conto e i bonifici visti |
| `registra-centro` | registrazione dall'app |
| `centro` | stato di un centro dal codice (e pagina di ritorno da Stripe Connect) |
| `prepara-centri` | crea e aggiorna i database dei centri, un passo alla volta (pg_cron ogni minuto) |
| `addebito-mensile` | il conto del mese di ogni centro (pg_cron il primo del mese) |
| `controlla-bonifici` | legge i bonifici sul tuo conto e rinnova le licenze (pg_cron ogni 6 ore) |
| `banca` | pagina di ritorno dalla tua banca quando colleghi il conto |
| `abbonamento` | piano, prezzi e cosa pagare, dall'app del proprietario; cambio di piano |
| `stripe-collega` | conto Stripe Connect del centro, dalle Impostazioni del proprietario |
| `pannello` | i dati e le azioni del pannello K9 Gestore |

## Come si accende (una volta sola)

Tutti i comandi si lanciano **sul tuo computer**, nella cartella del progetto. Nessuna chiave segreta va
in chat, nell'app o su GitHub.

1. **Progetto del gestore.** Su supabase.com crea un progetto nuovo, per esempio "K9 Gestore". Nel SQL
   Editor esegui `gestore/supabase/migrations/0001_centri.sql` e poi `0002_bonifici_piani.sql`. In Authentication → Users → Add user crea
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
   ENABLE_BANKING_APP_ID=...           # dal passo 5: l'id dell'applicazione Enable Banking
   ENABLE_BANKING_CHIAVE="-----BEGIN PRIVATE KEY-----\n..."   # dal passo 5: la chiave .pem, su una riga con \n
   STRIPE_SECRET_KEY=sk_test_...       # facoltativo, solo per i pagamenti online dei clienti (modalità test)
   ```

   Facoltativi: `REGIONE_SUPABASE` (predefinita eu-central-1), `MAX_CENTRI_AL_GIORNO` (20),
   `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (per le email della password dimenticata
   dei clienti e per il codice che conferma l'email all'iscrizione: senza un SMTP proprio Supabase non le manda e
   chi si iscrive entra subito), `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGE_SERVICE_SID` (per il
   codice SMS che conferma il cellulare dei clienti nuovi; ogni SMS lo paghi a Twilio), `GIORNI_PER_PAGARE` (3: entro
   quel giorno del mese il bonifico deve arrivare, poi l'app del centro si blocca), `BANCA_IBAN` (se la banca ti fa
   scegliere più conti: quello da leggere), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   (client "Applicazione web" di Google) e `GOOGLE_ALTRI_CLIENT_ID` (il client "App desktop"): accendono l'accesso con
   Google nei centri nuovi (vedi README principale, "Accesso con Google").

   SMTP, Twilio e Google valgono per i centri preparati dopo averli messi: a un centro già pronto si aggiungono a mano
   da Supabase, come spiega il README principale (Email e Accesso con Google).

   Il token di Supabase può creare progetti sul tuo account: tienilo solo qui. Ogni centro è un progetto,
   e oltre i 2 progetti gratuiti Supabase chiede il piano a pagamento.

4. **Funzioni e segreti sul gestore** (`<ref>` è il codice del progetto gestore):

   ```
   npx supabase secrets set --env-file ~/.campo-cani/gestore.env --project-ref <ref>
   npx supabase functions deploy --project-ref <ref> --workdir gestore
   ```

5. **Il tuo conto (Enable Banking, gratis per il tuo conto).** Su https://enablebanking.com/cp crea un account e
   un'applicazione in modalità **Production** "restricted" (legge solo i conti che colleghi tu, senza contratto).
   Come redirect URL metti `https://<ref>.supabase.co/functions/v1/banca`. Scarica la chiave privata `.pem`: l'id
   dell'applicazione va in `ENABLE_BANKING_APP_ID` e la chiave in `ENABLE_BANKING_CHIAVE`, poi ripeti il
   `secrets set` del passo 4. Nella pagina dell'applicazione collega il tuo conto ("Link accounts").
   Poi nel pannello, sezione **Banca**: scrivi il tuo IBAN e l'intestatario (quelli che vedono i centri), scegli la
   banca e premi **Collega**: entri nella tua banca e dai il permesso di sola lettura. Il permesso dura di solito
   90 o 180 giorni: quando scade il pannello te lo dice e lo ricolleghi con lo stesso bottone.

   **Stripe (modalità test, facoltativo)** serve solo per i pagamenti online dei clienti ai centri: in Connect
   attiva gli account Express.

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
   select cron.schedule('controlla-bonifici', '15 */6 * * *', $$
     select net.http_post('https://<ref>.supabase.co/functions/v1/controlla-bonifici',
       headers := jsonb_build_object('x-webhook-secret', '<WEBHOOK_SECRET>'))
   $$);
   ```

   Se hai già il gestore acceso con la versione di prima: esegui `0002_bonifici_piani.sql`, aggiungi il terzo
   orario, togli il webhook di Stripe (la funzione `stripe-webhook` non c'è più) e ripeti il passo 4.

7. **L'app.** Nelle build per gli store e per i centri imposta `EXPO_PUBLIC_GESTORE_URL` =
   `https://<ref>.supabase.co/functions/v1` (senza `EXPO_PUBLIC_SUPABASE_URL`: ogni centro ha il suo
   database, che l'app prende dalla licenza). Compaiono "Registra il tuo centro" e il campo per il codice
   del centro.

8. **Il pannello.** Actions → "Pannello del gestore" → Run workflow, con l'indirizzo del passo 7 e la
   publishable key del progetto gestore. Lo scarichi da Releases → "K9 Gestore".

   **Entrare con Google** (facoltativo): nel progetto del gestore, in Authentication → Sign In / Providers → Google,
   attivalo con gli stessi client dell'app (ID web e, dopo una virgola, ID desktop; secret del client web), e nelle
   Variables di GitHub metti `GOOGLE_DESKTOP_CLIENT_ID` e `GOOGLE_DESKTOP_SECRET` prima di costruire il pannello.
   Entra chiunque abbia un account Google, ma il pannello risponde solo alle email in `AMMINISTRATORI`.

9. **I prezzi.** Nel pannello, sezione **Piani**: canone al mese e quota per prenotazione di Base, Professional e
   Pro. All'inizio sono 0 € di canone e 1 € a prenotazione per tutti. Per un centro solo puoi farne di apposta.

## Prove

```
deno test gestore/supabase/functions/_shared/
```

Provano la firma delle licenze (lette come le legge l'app), la firma degli eventi Stripe, tutti i passi
della preparazione di un centro con un Supabase finto, il conto del mese con i cambi di piano, il
riconoscimento dei bonifici e la firma delle chiamate a Enable Banking.

## Se qualcosa va storto

- **Un centro resta in errore** (per esempio il limite dei progetti gratuiti): nel pannello leggi
  l'errore, sistema la causa e premi "Riprova la preparazione".
- **Un bonifico non è stato riconosciuto** (causale sbagliata, IBAN diverso): nel pannello compare in
  "Bonifici da abbinare" (solo quelli con "K9" nella causale o da un IBAN di un centro: gli altri movimenti del
  tuo conto non vengono salvati). Sceglilo e abbinalo all'addebito: la licenza si rinnova.
- **Un centro ti ha pagato in un altro modo:** premi "Segna pagato" sull'addebito.
- **Il conto non si legge più:** nel pannello, Banca mostra l'errore; di solito è scaduto il permesso: Collega.
- **Rifare l'addebito di un mese:** nel pannello, "Addebita adesso" con il mese (AAAA-MM). I centri già
  addebitati per quel mese vengono saltati.
