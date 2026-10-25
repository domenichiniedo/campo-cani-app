# Server gestore di K9 Manager

Il gestore è il tuo server: un progetto Supabase tuo, separato da quelli dei centri. Fa da solo quello che
oggi fai a mano con `tools/nuovo-centro.mjs`:

1. un centro si registra dall'app (**Registra il tuo centro**): nome, email del titolare, piano e
   l'IBAN da cui ti pagherà (obbligatorio);
2. il gestore crea il suo progetto Supabase, carica tutte le tabelle, rende proprietaria quella email e
   firma la licenza con la **chiave del server**. Il centro riceve il codice corto (K9-XXXXXX) da dare a
   clienti e trainer;
3. il primo del mese il gestore fa il conto del mese prima di ogni centro. **A consumo**: il **canone** del piano
   (diviso a giorni se il centro ha cambiato piano o si è registrato a metà mese), la **quota** per ogni
   prenotazione pagata al campo, con bonifico, con carta al centro o scalata da un pacchetto, anche se poi è stata
   annullata, e l'**1%** del prezzo di ogni pacchetto attivato. **A prezzo
   fisso**: solo il fisso del piano. Il centro sceglie come pagare alla registrazione e lo cambia dall'app. Dal
   conto si scala il **bonus** del centro, se ne ha. Il centro lo vede nell'app (Impostazioni → Piano e abbonamento, e appena apre l'app)
   con il tuo IBAN, la causale (`K9-XXXXXX AAAA-MM`) e il codice QR, e ti paga con un **bonifico istantaneo**;
4. ogni 6 ore il gestore legge i bonifici in entrata sul tuo conto (open banking con **Enable Banking**, solo
   lettura: non può muovere soldi), riconosce quelli dei centri dal codice nella causale o dall'IBAN e
   rinnova la licenza fino al giorno 3 del mese dopo. Se il bonifico non arriva entro il **giorno 3** la
   licenza scade e l'app del centro si blocca; appena arriva, la licenza si rinnova e l'app si sblocca;
5. il proprietario può **cambiare piano dall'app**: a un piano superiore la licenza nuova arriva subito e canone e
   quote del mese si dividono a giorni fra il piano vecchio e quello nuovo; un piano più piccolo parte dal primo
   del mese dopo. Può anche **disdire**, solo con i conti pagati e con un mese di preavviso: il servizio finisce
   alla fine del mese dopo, l'ultimo conto arriva come sempre e poi la licenza non si rinnova;
6. quando esce una migrazione nuova dell'app, il gestore la aggiunge da solo al database di ogni centro.

Ogni centro ha il suo database: i clienti di un centro non stanno mai nello stesso posto di quelli di un
altro, e i proprietari di un centro non vedono niente degli altri. Il gestore conserva solo nome, email del
titolare, codice, stato dei pagamenti e il numero di prenotazioni del mese: mai i dati dei clienti.

Il pannello **K9 Gestore** (workflow "Pannello del gestore") ti mostra tutti i centri, gli addebiti e le
statistiche, e ti lascia scrivere e cambiare il tuo IBAN per i bonifici, i prezzi dei piani (canone, quota, fisso e
percentuale sui pacchetti), dare bonus ai centri e creare codici bonus per la registrazione,
collegare il conto in banca, cambiare piano e prezzi di un centro, abbinare a mano un bonifico non riconosciuto,
rinnovare a mano, sospendere i rinnovi, segnare un addebito come pagato, riprovare una preparazione non riuscita e
cambiare la password di chi entra in un centro (titolare, trainer o cliente): scrivi la nuova o la fa inventare, chi era
dentro con la vecchia esce, e la vecchia non si vede mai.

Dai centri arrivano solo bonifici: nessun addebito diretto, nessuna carta. Le prenotazioni che i clienti pagano
al centro con la carta (Nexi) contano nel conto del mese come quelle pagate al campo o con bonifico.

## Cosa contiene

| | |
|---|---|
| `supabase/migrations/0001_centri.sql` | tabelle `centri` e `addebiti` del gestore |
| `supabase/migrations/0002_bonifici_piani.sql` | prezzi dei piani, cambi di piano, il tuo conto e i bonifici visti |
| `supabase/migrations/0003_fatturazione.sql` | i dati per fatturare a ogni centro (ragione sociale, P.IVA o CF, sede, SDI o PEC) |
| `supabase/migrations/0004_prezzi.sql` | i prezzi di partenza dei piani: Base 5,90 € + 1 €, Professional 29,99 € + 0,60 €, Pro 80 € + 0,30 € a prenotazione |
| `supabase/migrations/0005_bonus.sql` | i bonus: codici da usare alla registrazione e crediti dei centri, scalati dai conti |
| `supabase/migrations/0006_fisso_pacchetti.sql` | il prezzo fisso (Base 39 €, Professional 79 €, Pro 149 €), l'1% sui pacchetti, il piano più piccolo dal mese dopo e la disdetta |
| `supabase/migrations/0007_lezioni.sql` | i bonifici delle lezioni che i clienti pagano dall'app |
| `supabase/migrations/0008_persona_associazione.sql` | chi apre il centro: persona o associazione, e il suo telefono |
| `registra-centro` | registrazione dall'app |
| `centro` | stato di un centro dal codice e prezzi dei piani |
| `prepara-centri` | crea e aggiorna i database dei centri, un passo alla volta (pg_cron ogni minuto) |
| `addebito-mensile` | il conto del mese di ogni centro (pg_cron il primo del mese) |
| `controlla-bonifici` | legge i bonifici sul tuo conto e rinnova le licenze (pg_cron ogni 6 ore) |
| `banca` | pagina di ritorno dalla tua banca quando colleghi il conto |
| `abbonamento` | piano, prezzi e cosa pagare, dall'app del proprietario; cambio di piano |
| `pannello` | i dati e le azioni del pannello K9 Gestore |
| `pagamento` | pagina di ritorno dalla banca dopo "Paga ora" (centro) o "Paga dalla tua banca" (cliente) |
| `lezione` | il cliente paga una lezione con il bonifico istantaneo dall'app |
| `invito` | il link e il QR code che i centri danno ai clienti: su Android apre l'app già sul centro, o porta a scaricarla |

## Come si accende (una volta sola)

**Per provare tutto il giro** non serve niente di questo: **Actions → Prova generale** accende da solo un gestore di
prova, senza SMTP, Twilio né banca (vedi il README principale, punto 12). Lo riconosce il segreto `PROVA=1`: i centri si
preparano anche senza SMTP e Twilio, e chi si iscrive entra subito. Nel gestore vero non metterlo.

Tutti i comandi si lanciano **sul tuo computer**, nella cartella del progetto. Nessuna chiave segreta va
in chat, nell'app o su GitHub.

1. **Progetto del gestore.** Su supabase.com crea un progetto nuovo, per esempio "K9 Gestore". Nel SQL
   Editor esegui `gestore/supabase/migrations/0001_centri.sql`, poi `0002_bonifici_piani.sql`, `0003_fatturazione.sql`, `0004_prezzi.sql`, `0005_bonus.sql`, `0006_fisso_pacchetti.sql`, `0007_lezioni.sql` e `0008_persona_associazione.sql`. In Authentication → Users → Add user crea
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
   GITHUB_TOKEN=github_pat_...         # facoltativo: le app su GitHub dal pannello (App e versioni), vedi sotto
   ```

   Servono anche, sempre: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (le email con il codice che
   conferma l'email di chi si iscrive con email e password, e quelle della password dimenticata) e
   `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGE_SERVICE_SID` (il codice SMS con cui ogni cliente nuovo,
   anche chi entra con Google, conferma il cellulare; ogni SMS lo paghi a Twilio). Senza, il gestore non prepara i
   centri: nel pannello compare l'errore che dice cosa manca.

   Facoltativi: `APP_ANDROID_ID` (predefinito it.campocani.app: l'app che apre il link di invito dei centri),
   `APP_ANDROID_LINK` (dove si scarica l'app quando non c'è, al posto della pagina di Google Play), `REGIONE_SUPABASE` (predefinita eu-central-1), `MAX_CENTRI_AL_GIORNO` (20), `GIORNI_PER_PAGARE` (3: entro
   quel giorno del mese il bonifico deve arrivare, poi l'app del centro si blocca), `BANCA_IBAN` (se la banca ti fa
   scegliere più conti: quello da leggere), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   (client "Applicazione web" di Google) e `GOOGLE_ALTRI_CLIENT_ID` (il client "App desktop"): accendono l'accesso con
   Google nei centri nuovi (vedi README principale, "Accesso con Google").

   SMTP, Twilio e Google valgono per i centri preparati dopo averli messi: a un centro già pronto si aggiungono a mano
   da Supabase, come spiega il README principale (Email e Accesso con Google).

   `GITHUB_TOKEN` accende nel pannello la sezione **App e versioni**: i file delle Releases da scaricare, le ultime
   build e i pulsanti per rifare le app e creare una prova nuova. Su github.com → Settings → Developer settings →
   Personal access tokens → Fine-grained tokens creane uno con accesso **solo** al repository dell'app e i permessi
   Actions (Read and write) e Contents (Read and write, per cancellare le versioni dal pannello). Se il repository non è `domenichiniedo/campo-cani-app`, aggiungi
   `GITHUB_REPO=proprietario/nome`.

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

   **"Paga ora" (facoltativo).** Con `PAGA_ORA=1` in `gestore.env` il centro, quando arriva il conto, tocca
   **Paga ora**, sceglie la sua banca e trova il bonifico istantaneo già compilato: deve solo confermarlo (la
   PSD2 vuole sempre la conferma di chi paga). Usa la stessa applicazione Enable Banking, ma per disporre
   pagamenti in produzione Enable Banking chiede un contratto apposito (scrivi a support.api@enablebanking.com);
   in modalità Sandbox lo provi subito. Aggiungi `https://<ref>.supabase.co/functions/v1/pagamento` ai redirect
   URL dell'applicazione. Senza `PAGA_ORA` il centro vede solo i dati del bonifico e il codice QR, come prima.

   Con `PAGA_ORA=1` anche i **clienti** pagano le lezioni dall'app: nella lezione da pagare con bonifico toccano
   **Paga dalla tua banca**, scelgono la banca, scrivono il loro IBAN e confermano nella banca il bonifico istantaneo
   già compilato verso il conto del centro (quello di Impostazioni → Pagamenti). Appena la banca lo fa partire, il
   gestore segna la lezione pagata nel database del centro (con `TOKEN_SUPABASE`): il proprietario non deve toccare
   **Incassa**. I bonifici rimasti in sospeso li ricontrolla `controlla-bonifici`. I soldi vanno dal cliente al centro:
   il gestore non li tocca e tiene solo id della prenotazione, importo e stato.

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
   orario, togli il webhook di Stripe e cancella le funzioni `stripe-webhook` e `stripe-collega` (non ci sono più),
   poi ripeti il passo 4. Se hai già `0002`, esegui in ordine quelle che mancano fra `0003_fatturazione.sql`, `0004_prezzi.sql`,
   `0005_bonus.sql` e `0006_fisso_pacchetti.sql`, e ripeti il passo 4.

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

9. **I prezzi.** Nel pannello, sezione **Piani e addebiti**: per Base, Professional e Pro il canone al mese, la quota
   per prenotazione, il prezzo fisso e la percentuale sui pacchetti. Quelli di partenza (`0004_prezzi.sql` e
   `0006_fisso_pacchetti.sql`): a consumo Base 5,90 € al mese + 1 €, Professional 29,99 € + 0,60 €, Pro 80 € +
   0,30 € a prenotazione, più l'1% dei pacchetti; fissi Base 39 €, Professional 79 €, Pro 149 € al mese. Per un
   centro solo puoi farne di apposta (Centri → il centro → Modifica), dove cambi anche come paga.

## Prove

```
deno test gestore/supabase/functions/_shared/
```

Provano la firma delle licenze (lette come le legge l'app), tutti i passi
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
