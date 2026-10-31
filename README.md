# K9 Manager

App per prenotare il campo di addestramento. I clienti si iscrivono, accettano regolamento e privacy e prenotano le lezioni
(IGP da 60 minuti, educazione base da 30). Il proprietario apre gli orari, vede il piano del giorno e della settimana, segna
l'ingresso dei cani, incassa, dà penalità e cambia tutte le impostazioni, logo compreso.

L'app è fatta con Expo (iPhone e Android dallo stesso codice). I dati stanno su Supabase, che offre gratis database e account.

## 1. Crea il database (una volta sola)

1. Vai su <https://supabase.com>, crea un account e un nuovo progetto. Come regione scegli Europa (per esempio Frankfurt).
2. Apri il file `supabase/setup.sql`, scrivi nell'**ultima riga** la tua email al posto di `titolare@esempio.it`, poi
   nel progetto apri **SQL Editor**, incolla tutto il file e premi **Run**. Crea in un colpo tabelle, regole di accesso,
   lezioni di partenza e spazi per logo e foto, e segna la tua email come quella del proprietario.
   `setup.sql` è solo per un progetto **nuovo**. Se il database esiste già, esegui solo le migrazioni nuove di
   `supabase/migrations`, una volta ciascuna e in ordine (l'ultima è `0027_campo_libero.sql`).
3. In **Project Settings → API Keys** copia l'URL del progetto e la **Publishable key** (inizia con `sb_publishable_`).
   Non usare mai la Secret key nell'app.
4. Copia il file `.env.example` in `.env.local` e incolla i due valori:

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://il-tuo-progetto.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

### Email

- **Conferma email** (obbligatoria per chi si iscrive con email e password; chi entra con Google no, l'ha già
  verificata Google). In **Authentication → Sign In / Providers → Email** lascia attiva "Confirm email": chi si
  iscrive riceve un codice e lo scrive nell'app. Serve un SMTP proprio (sotto): senza, Supabase non manda le email.
  In **Authentication → Emails → Confirm signup** sostituisci il testo con qualcosa come:

  ```
  <h2>Benvenuto</h2>
  <p>Il codice per confermare la tua email è: <strong>{{ .Token }}</strong></p>
  ```

- **Conferma del cellulare con un SMS** (obbligatoria per tutti i clienti nuovi, anche per chi entra con Google).
  Serve un servizio SMS, per esempio Twilio (ogni SMS costa qualche centesimo). In **Authentication → Sign In / Providers → Phone** attivalo, scegli Twilio, incolla Account SID,
  Auth Token e Message Service SID, lascia attiva "Confirm phone" e come messaggio scrivi `Il tuo codice è {{ .Code }}`.
  Poi nel **SQL Editor**:

  ```sql
  update public.settings set sms_check = true;
  ```

  Da quel momento chi si iscrive, prima di prenotare, conferma il cellulare con il codice ricevuto per SMS. Chi era già
  iscritto non deve fare niente.
- **Password dimenticata.** L'app chiede un codice, non un link. In **Authentication → Emails → Reset Password** sostituisci il
  testo con qualcosa come:

  ```
  <h2>Nuova password</h2>
  <p>Il tuo codice è: <strong>{{ .Token }}</strong></p>
  ```

- Le email gratuite di Supabase sono poche all'ora. Quando i clienti diventano tanti, collega un servizio SMTP in
  **Authentication → Emails → SMTP Settings**.

### Accesso con Google

Clienti, trainer e proprietari possono entrare con il loro account Google (pulsante **Continua con Google**), nell'app
Android, nel browser (anche iPhone) e nel programma per Windows e Mac. Chi entra con Google la prima volta non passa dal
modulo di iscrizione: l'app gli chiede subito telefono, cani, fattura e consensi, poi il codice SMS che conferma
il cellulare. L'email non va confermata: l'ha già verificata Google. Chi è già iscritto con la stessa email entra nel suo
account di sempre.

L'app si fa dare da Google un "ID token" e lo passa a Supabase: non serve registrare su Google l'indirizzo di ogni
centro, e gli stessi client valgono per tutti i centri. Si prepara **una volta sola**:

1. **Google Cloud** (console.cloud.google.com): crea un progetto, per esempio "K9 Manager". In **Google Auth Platform →
   Branding** metti nome dell'app, email di supporto e logo; in **Audience** scegli "Esterno" e poi **Pubblica l'app**
   (finché è "In test" entrano solo gli utenti di prova che aggiungi tu). Gli scope sono quelli di base (email, profilo):
   Google non chiede verifiche.
2. In **Google Auth Platform → Clients → Create client** crea quattro client:
   - **Applicazione web**, "K9 Manager web". In *Origini JavaScript autorizzate* metti gli indirizzi dove apri l'app
     nel browser, per esempio `https://domenichiniedo.github.io` (niente URI di reindirizzamento). Ti dà un **ID client**
     e un **client secret**.
   - **Android**, nome pacchetto `it.campocani.app`, impronta SHA-1
     `02:B3:E4:2E:B2:A9:A1:47:C6:3A:F3:4F:42:8B:0E:6A:EB:8A:9B:02` (è la firma di `mobile-demo/demo-debug.keystore`).
   - **Android** di nuovo, uguale ma con pacchetto `it.campocani.provavera` (le prove con database), un altro con
     `it.campocani.provagenerale` (la prova generale) e uno con `it.campocani.gestore` (il pannello K9 Gestore sul
     telefono).
   - **App desktop**, "K9 Manager computer": ti dà un altro **ID client** e un **client secret** (per Google quello delle
     app desktop non è segreto: può stare nel programma).
3. **GitHub → Settings → Secrets and variables → Actions → Variables**: `GOOGLE_WEB_CLIENT_ID` (ID del client web),
   `GOOGLE_DESKTOP_CLIENT_ID` e `GOOGLE_DESKTOP_SECRET` (quelli del client desktop). Poi ricostruisci app e programma
   (Actions → App per Android, App per Windows, App per Mac). Per la versione web la variabile è
   `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (vedi `.env.example`). Per la **prova generale** aggiungi in **Secrets** anche
   `GOOGLE_WEB_SECRET` (il client secret del client web) e rilanciala: accende Google nel gestore di prova e nei suoi
   centri, anche quelli già pronti.
4. **Ogni progetto Supabase** (lo fa da solo il gestore per i centri nuovi, vedi `gestore/README.md`): in
   **Authentication → Sign In / Providers → Google** attivalo, in *Client IDs* metti l'ID del client web e, separato da
   una virgola, quello del client desktop; in *Client Secret* il secret del client web. Lascia spento "Skip nonce
   checks". Il pulsante compare solo nei centri dove Google è attivo.

## 2. Il tuo account da proprietario

La password la scegli tu e non passa da nessun altro.

1. Avvia l'app (punto 3) e iscriviti con **la stessa email** che hai scritto in `setup.sql`, con la tua password. Come
   cane puoi scrivere quello che vuoi.
2. Entri già come proprietario: il database riconosce la tua email. Se ti eri iscritto prima di eseguire `setup.sql`, o
   vuoi cambiare l'email del proprietario, esegui nel **SQL Editor** (con la tua email):

   ```sql
   select public.set_owner_email('tua@email.it');
   ```

3. Se eri già dentro, esci e rientra: vedrai le schede del proprietario (Giorno, Settimana, Orari, Clienti, Impostazioni).
4. Altri proprietari (un socio, chi ti aiuta a gestire il centro): in **Impostazioni → Proprietari** scrivi la loro
   email. Se sono già iscritti diventano subito proprietari, altrimenti quando si iscrivono con quella email. Da lì li
   puoi anche togliere; te stesso no, così resta sempre almeno un proprietario. Su un database che esiste già serve
   prima la migrazione `0019_piu_proprietari.sql`.

Per prima cosa vai in **Impostazioni**: nome del centro, logo, numero di campi con nome e indirizzo, trainer, prezzi,
regolamento e privacy. Poi in **Orari** apri, campo per campo, i giorni e le mezz'ore prenotabili.

## 3. Provare l'app sul telefono

Serve un computer con [Node.js](https://nodejs.org) (versione 20 o più recente).

```bash
npm install
npx expo start
```

Sul telefono installa **Expo Go** (App Store o Play Store) e inquadra il QR code che compare nel terminale.

### Web app nel browser

La stessa app gira anche nel browser, su telefono e computer, senza store: è una web app installabile (PWA).

1. La prima volta accendi GitHub Pages: **Settings → Pages → Build and deployment → Source: GitHub Actions** (con il
   repository privato GitHub Pages richiede GitHub Pro; il sito è comunque pubblico).
2. **Actions → Sito web (web app e demo) → Run workflow**. Usa il database delle variabili
   `EXPO_PUBLIC_SUPABASE_URL` ed `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (come l'app per Android), oppure quello che
   scrivi negli input; con `gestore_url` e `chiave_server` ogni centro entra con il suo codice. Rilancialo dopo ogni
   modifica dell'app per pubblicare la versione nuova.
3. L'app è su **https://domenichiniedo.github.io/campo-cani-app/app/** (la demo resta su
   https://domenichiniedo.github.io/campo-cani-app/). Per installarla: su iPhone Safari → **Condividi → Aggiungi alla
   schermata Home**; su Android e computer Chrome o Edge → **Installa app** (menu ⋮ o icona nella barra
   dell'indirizzo). Si apre a tutto schermo con l'icona di K9 Manager e si aggiorna da sola.

Nel browser il proprietario paga il piano direttamente (come nel programma per computer). Per l'accesso con Google
aggiungi `https://domenichiniedo.github.io` alle origini autorizzate (vedi *Accesso con Google*). Lo scontrino con il
registratore al campo (Wi-Fi) invece si stampa solo dall'app installata (punto 6).

Per provarla sul tuo computer: `npx expo start --web`.

## 4. Pubblicare sugli store

### Google Play

Le build per Android (Actions → "Demo per Android", "App per Android", "Aggiorna le app") sono già come le vuole
Google Play. Lo script che le fa è `mobile-demo/android-build.sh`, e la build si ferma se manca un requisito:

- puntano ad **Android 16 (API 36)**, obbligatorio per le app nuove e gli aggiornamenti dal 31 agosto 2026
  (Capacitor 8);
- sono **build di rilascio**, non di debug;
- sono allineate alle **pagine di memoria da 16 KB**;
- il numero di versione cresce sempre, e il nome viene da `version` in `app.json`;
- l'app va da bordo a bordo dello schermo (obbligatorio da Android 16) e tiene conto delle barre di sistema;
- dell'accesso con Google c'è solo Google: nessun SDK di Facebook e nessun ID pubblicitario;
- esce l'**AAB** (Android App Bundle), il formato da caricare su Google Play, accanto all'APK da installare a mano.

Per caricare l'AAB serve la **chiave di caricamento**. È tua e non va mai in chat né nel repository: si crea una
volta sola sul tuo computer, con Java installato:

```bash
keytool -genkeypair -v -keystore k9-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
base64 -i k9-upload.jks | tr -d '\n' > k9-upload.txt     # su Windows: certutil -encode k9-upload.jks k9-upload.txt
```

Poi vai in GitHub → Settings → Secrets and variables → Actions → **Secrets** e aggiungi:

- `ANDROID_UPLOAD_KEYSTORE_BASE64`: il contenuto di `k9-upload.txt` (con certutil, senza le righe BEGIN/END);
- `ANDROID_UPLOAD_STORE_PASSWORD`: la password che hai scelto;
- `ANDROID_UPLOAD_KEY_ALIAS`: `upload`;
- `ANDROID_UPLOAD_KEY_PASSWORD`: la stessa password, se keytool non te ne ha chiesta un'altra.

Conserva `k9-upload.jks` e la password in un posto sicuro. Da lì in poi l'AAB firmato esce nelle Releases accanto
all'APK (K9Manager-Demo.aab, K9Manager-Prova.aab). Senza i secrets l'AAB si costruisce lo stesso, ma solo per
controllo, e non si pubblica. L'APK resta firmato con la chiave della demo, così si installa sopra quella vecchia.

Nella Play Console, per ogni app (demo `it.campocani.demo`, prova `it.campocani.provavera`, app vera
`it.campocani.app`):

1. Crea l'app e attiva la **firma delle app di Google Play**. Carica l'AAB in un test interno o chiuso.
2. Con un account sviluppatore personale nuovo, Google chiede un **test chiuso con almeno 12 tester per 14 giorni**
   prima della produzione.
3. **Norme sulla privacy**: un indirizzo web con l'informativa sui dati. C'è già, nel sito della demo web:
   `https://domenichiniedo.github.io/campo-cani-app/privacy.html` (il file è `mobile-demo/privacy.html`: prima
   sostituisci le parti tra [quadre] con nome, indirizzo ed email tuoi). Il sito deve essere pubblico.
4. **Sicurezza dei dati**: l'app raccoglie nome, email, telefono, dati dei cani, prenotazioni e, se chiesti, dati di
   fatturazione. Servono per far funzionare l'app, non sono condivisi per pubblicità, viaggiano cifrati e l'utente
   può chiederne la cancellazione.
5. **Cancellazione dell'account**: clienti e trainer si cancellano da soli dall'app (Profilo → Cancella il mio
   account). Per la scheda di Google Play serve anche un indirizzo web dove chiedere la cancellazione:
   `https://domenichiniedo.github.io/campo-cani-app/cancella-account.html` (`mobile-demo/cancella-account.html`).
6. **Accesso all'app**: la prova ha bisogno di un account per entrare. Dai ai revisori di Google un utente di prova,
   per esempio un cliente creato apposta. La demo non ne ha bisogno, perché si entra con il bottone Demo.
7. Classificazione dei contenuti, pubblico di destinazione (adulti), nessuna pubblicità, categoria "Sport" o
   "Produttività".
8. Scheda dello store: icona 512×512, immagine in evidenza 1024×500, almeno 2 schermate del telefono.

Nell'app Android (e in quella per iPhone) il proprietario vede piano e conti, ma li paga, cambia piano o disdice dal
programma per computer: Google Play e App Store non vogliono che un servizio digitale si paghi dentro l'app senza i
loro sistemi di pagamento. Le lezioni dei clienti invece si pagano con Nexi anche nell'app: sono servizi al campo.
Pubblica sugli store solo l'app vera (`it.campocani.app`): demo e prova restano negli APK delle Releases.

### Con EAS

In alternativa si può usare EAS, il servizio di Expo per creare le app vere:

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android   # file da installare o caricare su Google Play
eas build --platform ios       # serve un account Apple Developer (99 €/anno)
eas submit                     # invia la build agli store
```

Prima di pubblicare metti le due variabili `EXPO_PUBLIC_...` anche su EAS (`eas env:create`) e sostituisci icona e schermata
iniziale in `assets/images`.

## 5. Fatture automatiche con Fatture in Cloud

Quando una lezione pagata online risulta incassata, l'app prepara la fattura con i dati del cliente. La funzione
`supabase/functions/fatture-in-cloud` la crea sul tuo account Fatture in Cloud, che la numera, e la trasmette allo SDI.
Il token resta nei Secrets di Supabase: non finisce mai nell'app.

1. Su Fatture in Cloud, nell'area sviluppatori, crea un'applicazione con **autenticazione manuale** e genera un token con
   i permessi su anagrafiche, documenti emessi e fatturazione elettronica.
2. Installa la [Supabase CLI](https://supabase.com/docs/guides/cli) e, dalla cartella del progetto:
   ```sh
   supabase login
   supabase link --project-ref IL_TUO_PROJECT_REF
   supabase secrets set FIC_ACCESS_TOKEN=il_token WEBHOOK_SECRET=una_parola_lunga_a_caso
   supabase functions deploy fatture-in-cloud
   ```
3. In Supabase apri **Database → Webhooks** e crea un webhook sulla tabella `invoices`, evento **Insert**, tipo
   **Supabase Edge Functions**, funzione `fatture-in-cloud`, con l'intestazione `x-webhook-secret` uguale a `WEBHOOK_SECRET`.
   Se usi il registratore in cloud (sotto), crea un secondo webhook uguale per la funzione `scontrini-openapi`.
4. Nell'app, in **Impostazioni → Fatture**, scegli il regime (ordinario con l'aliquota IVA inclusa nei prezzi, oppure
   forfettario) e premi **Invia ora**.

All'inizio la funzione lavora **in prova**: crea le fatture su Fatture in Cloud e le fa controllare, ma non le manda allo
SDI. Controlla le prime su Fatture in Cloud; quando sono giuste, attiva l'invio vero:

```sh
supabase secrets set FIC_SEND_TO_SDI=si
```

Se il token vede più aziende, aggiungi `FIC_COMPANY_ID`. Se l'aliquota non viene trovata da sola, aggiungi `FIC_VAT_ID`;
per registrare l'incasso su un conto preciso, `FIC_PAYMENT_ACCOUNT_ID`. Le fatture con un errore restano nell'elenco con
il motivo e il tasto **Riprova**. Le fatture già emesse restano anche se il cliente cancella il suo account.

## 6. Scontrino elettronico

Nel Profilo il cliente sceglie se per i pagamenti online vuole la **fattura** o lo **scontrino**. In **Impostazioni →
Fatture** scegli come emettere lo scontrino:

- **Lo batto io**: lo scontrino compare come "da emettere"; lo batti sul registratore telematico del campo e premi
  **Battuto** scrivendo il numero del documento, che finisce nel report mensile. Va bene con qualsiasi registratore.
- **Registratore al campo (Wi-Fi)**: il tuo telefono lo stampa con **Stampa sul registratore** e salva il numero da solo.
  Funziona con i registratori Epson RT che accettano ePOS-Print XML (per esempio FP-81 II RT e FP-90 III RT). Scrivi
  l'indirizzo del registratore (per esempio `192.168.1.50`) e stai sulla stessa rete Wi-Fi. Non funziona dalla demo nel
  browser: serve l'app installata.
- **Registratore in cloud**: lo trasmette all'Agenzia delle Entrate la funzione `scontrini-openapi`, con il servizio
  scontrini di [Openapi](https://openapi.com/products/electronic-receipt-italy), anche quando non sei al campo.
  1. Su Openapi configura la tua partita IVA per gli scontrini, con le credenziali Fisconline della persona incaricata
     alla trasmissione (la procedura per l'incarico è nella loro documentazione). Openapi indica il servizio solo per
     le società.
  2. Genera un token con il permesso `POST:invoice.openapi.com/IT-receipts` (e la lettura dello stesso indirizzo).
  3. Dalla cartella del progetto:
     ```sh
     supabase secrets set OPENAPI_TOKEN=il_token OPENAPI_FISCAL_ID=la_tua_partita_iva
     supabase functions deploy scontrini-openapi
     ```
  4. Aggiungi il secondo webhook (punto 3 delle fatture). All'inizio la funzione usa l'ambiente di prova di Openapi;
     quando è tutto a posto: `supabase secrets set OPENAPI_LIVE=si`.

  Openapi lavora in differita: lo scontrino passa a "emesso" con il suo numero quando la trasmissione è fatta (premi
  **Invia ora** per controllare). Openapi ha annunciato un nuovo servizio scontrini che sostituirà questo: prima di
  attivarlo chiedi a loro quale usare.

## 7. Vendere l'app ad altri centri

Sugli store c'è una sola app, gratuita. Ogni centro la attiva con un **codice di licenza** che generi tu: il codice dice
a quale database collegarsi (quello del centro, con i suoi dati separati da tutti gli altri) e fino a quando vale. È
firmato con una chiave privata che resta sul tuo computer: chi non ce l'ha non può crearne né modificarne uno.

**Una volta sola**

1. Crea le chiavi:
   ```sh
   node tools/licenza.mjs chiavi
   ```
   La chiave privata finisce in `~/.campo-cani/licenza-privata.pem`: fanne una copia sicura (chiavetta, gestore di
   password). Se la perdi, non potrai più rinnovare le licenze date. La riga che il comando stampa va incollata in
   `src/lib/license-key.ts`.
2. Pubblica l'app sugli store (punto 4) **senza** `.env.local`: così chiede il codice al primo avvio. Anche il tuo campo
   userà un suo codice. Nelle note per la revisione di Apple e Google metti un codice di prova e un utente di prova.

**Per ogni centro che compra: un solo comando**

Sul tuo computer (dove c'è la chiave privata delle licenze):

1. La prima volta crea un token del tuo account Supabase in **supabase.com → Account → Access Tokens** e salvalo, da
   solo su una riga, nel file `~/.campo-cani/supabase-token` (oppure nella variabile `SUPABASE_ACCESS_TOKEN`). Il token
   crea progetti sul tuo account: non metterlo mai nell'app né su GitHub.
2. Lancia:
   ```sh
   node tools/nuovo-centro.mjs --campo "Centro Cinofilo Le Querce" --email titolare@lequerce.it \
     --piano professional --scadenza 2027-12-31
   ```
   In 2-3 minuti il comando crea il progetto Supabase (in Europa), esegue tutte le migrazioni, segna l'email del titolare
   come proprietario, imposta l'email per la password dimenticata, prende la **publishable key** e genera la licenza.
   Alla fine stampa il codice e il **link di attivazione** da mandare al titolare. I dati del centro (compresa la
   password del database) restano in `~/.campo-cani/centri/<id>.json`: servono per rinnovi e cambi di piano.
3. Il titolare apre il link dal telefono, si iscrive con la sua email ed entra già come proprietario. Da
   **Impostazioni → Licenza** manda ai suoi clienti il link di attivazione.

Opzioni: `--id` (di solito lo ricava dal nome), `--regione` (predefinita `eu-central-1`), `--org` se hai più
organizzazioni Supabase.

**A mano, senza il comando** (per esempio se il progetto sta sull'account Supabase del centro):

1. Crea il progetto, scrivi l'email del titolare nell'ultima riga di `supabase/setup.sql` ed eseguilo nel SQL Editor,
   come al punto 1. Imposta l'email della password dimenticata (punto 1, **Email**).
2. Genera la licenza con il piano, l'indirizzo e la **publishable key** del suo progetto:
   ```sh
   node tools/licenza.mjs genera --campo "Centro Cinofilo Le Querce" --id querce --piano professional \
     --scadenza 2027-12-31 --url https://xxxx.supabase.co --chiave sb_publishable_xxxx
   ```
3. Manda il codice al centro. Il titolare installa l'app, incolla il codice, si iscrive con la sua email ed entra già
   come proprietario.

**Rinnovo e sospensione**

- Per rinnovare genera un codice con lo **stesso `--id`** e una scadenza più lontana. Il centro lo incolla in
  Impostazioni → Licenza e vale subito anche per i suoi clienti, senza che facciano niente.
- Per sospendere un centro basta non rinnovare: alla scadenza l'app non si apre più. Se vuoi più controllo, fai
  licenze brevi (per esempio mensili).
- `node tools/licenza.mjs verifica <codice>` mostra cosa c'è in un codice e se la firma è tua.

**Piani**

L'app è una sola: il piano scritto nella licenza decide cosa si vede. Le licenze fatte prima dei piani valgono come Pro.

| | Base | Professional | Pro |
| --- | --- | --- | --- |
| Prenotazioni, orari, clienti e cani, penalità, regolamento e privacy, logo | sì | sì | sì |
| Campi | 1 | fino a 2 | senza limite |
| Clienti iscritti | fino a 60 | fino a 100 | senza limite |
| Lezioni prenotabili | fino a 3 | fino a 5 | senza limite |
| Opzioni di ogni lezione (per esempio Pista, Obbedienza, Attacco) | fino a 2 | fino a 5 | senza limite |
| Pacchetti di lezioni richiedibili | fino a 3 | fino a 5 | senza limite |
| Trainer (con la loro app e il diario dei cani) | no | fino a 2 | senza limite |
| Incassi: lezioni da incassare e pagina Incassi | no | sì | sì |
| Statistiche: grafico, presenze, disdette, ripartizioni | no | no | sì |
| Fatture automatiche e scontrino | no | no | sì |
| Registratore in cloud o registratore Epson al campo | no | no | sì |
| Programma per Windows e Mac | no | no | sì |
| Lezioni di gruppo: classi con più cani, anche ogni settimana | no | no | sì |
| Schede di valutazione nel diario dei cani | no | fino a 3 | senza limite |

Le lezioni, i pacchetti e le schede spenti non contano nel limite. Se un centro scende di piano con più campi, lezioni,
opzioni, pacchetti, schede o trainer di quanti ne comprende il nuovo piano, restano attivi solo i primi in ordine.

Per cambiare piano genera un codice con lo **stesso `--id`** e il nuovo `--piano` (la scadenza può restare uguale): il
centro lo incolla in Impostazioni → Licenza. Quando un centro raggiunge il limite di clienti, i nuovi non possono
iscriversi e il titolare lo vede in Impostazioni → Licenza. I limiti sono in `src/lib/plans.ts`.

**In automatico, con il server gestore.** Invece di aprire ogni centro a mano, il centro si registra da solo dall'app
("Registra il tuo centro") e il tuo server gestore gli crea il database e la licenza (firmata con una seconda chiave,
quella del server: la tua resta sul computer). Ogni mese il centro vede nell'app quanto pagare (canone del piano più una
quota a prenotazione) e ti paga con un bonifico istantaneo; il gestore legge i bonifici sul tuo conto, in sola lettura, e
rinnova la licenza. Se il pagamento non arriva entro il giorno 3, l'app del centro si blocca finché non arriva. Il
proprietario può cambiare piano dall'app; clienti e trainer entrano con il codice corto del centro (K9-XXXXXX). Il
pannello "K9 Gestore" ti mostra tutti i centri, i pagamenti (con lo storico mese per mese di ogni centro) e le statistiche, e lì scrivi il tuo IBAN e i prezzi dei piani.
Come accenderlo: [gestore/README.md](gestore/README.md).

## 8. Programma per Windows e Mac

La stessa app esiste anche come programma da installare sul computer del campo, **solo per il proprietario** (niente iscrizione
né schermate dei clienti), con la stessa licenza e la stampa sul registratore Epson RT della rete del campo.

- **Scaricarlo**: su GitHub apri **Actions → App per Windows → Run workflow**. Finita l'esecuzione, in fondo alla pagina
  trovi **K9Manager-Windows** con il file `K9Manager-Setup-x.y.z.exe`. Lo stesso succede quando crei un tag `v1.0.0`.
- **Quale database usa**: se in **Settings → Secrets and variables → Actions → Variables** imposti
  `EXPO_PUBLIC_SUPABASE_URL` ed `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, il programma è collegato al tuo campo. Altrimenti
  chiede il codice di licenza al primo avvio, come l'app sugli store (serve la chiave pubblica, punto 7).
- **Avviso di Windows**: il programma non è firmato, quindi al primo avvio Windows SmartScreen mostra "Windows ha protetto
  il PC": premi **Ulteriori informazioni → Esegui comunque**. Per toglierlo serve un certificato di firma del codice
  (a pagamento), da aggiungere quando lo vendi.
- **Versione demo**: in **Run workflow** spunta **demo**. Esce **K9Manager-Windows-Demo**, con i dati di esempio della
  demo web e senza database: utile per farlo vedere a un centro.
- **Mac**: allo stesso modo da **Actions → App per Mac → Run workflow**, che crea `K9Manager-x.y.z.dmg` (per Mac con chip
  Apple e Intel; con **demo** spuntato esce `K9Manager-Mac-Demo.dmg`, anche in **Releases → Demo per Mac**). Si apre il
  file e si trascina K9 Manager in Applicazioni. Il programma non è firmato da Apple: la prima volta aprilo con **clic
  destro → Apri**, oppure da **Impostazioni di Sistema → Privacy e sicurezza → Apri comunque**. Per toglierlo serve
  l'Apple Developer Program (99 $ l'anno).
- **Provarlo sul tuo computer**: nella cartella `desktop` esegui `npm install`, `npm run web` e `npm start`.

## 9. Report mensile per email (piano Pro)

L'ultimo venerdì di ogni mese il proprietario riceve per email un Excel con il mese: riepilogo di incassi e attività,
una riga per lezione (con filtri), pacchetti venduti, fatture e scontrini emessi con il loro numero, statistiche per
lezione, trainer, campo, giorno, fascia oraria e pagamento, penalità. Lo prepara la funzione
`supabase/functions/report-mensile` e lo spedisce [Resend](https://resend.com) (gratis fino a 3000 email al mese).
La chiave di Resend resta nei Secrets di Supabase: non finisce mai nell'app.

1. Su Resend crea un account, aggiungi il dominio da cui mandare l'email (per esempio `iltuocampo.it`, seguendo i
   record DNS che ti indica) e crea una **API key** con il permesso di invio. Senza dominio Resend manda solo al tuo
   indirizzo, da `onboarding@resend.dev`: va bene per provare.
2. Dalla cartella del progetto (come al punto 5):
   ```sh
   supabase secrets set RESEND_API_KEY=la_chiave REPORT_FROM="K9 Manager <report@iltuocampo.it>" WEBHOOK_SECRET=una_parola_lunga_a_caso
   supabase functions deploy report-mensile --no-verify-jwt
   ```
   Se hai già impostato `WEBHOOK_SECRET` per le fatture, non cambiarlo. Il report va agli account con ruolo
   proprietario; per mandarlo anche ad altri: `supabase secrets set REPORT_TO=commercialista@esempio.it,socio@esempio.it`.
3. Nell'app, **Impostazioni → Report mensile → Mandami ora il report**: arriva subito il report del mese in corso.
4. Per l'invio automatico, in Supabase apri **Database → Extensions** e attiva `pg_cron` e `pg_net`. Poi nel
   **SQL Editor**, con il tuo project ref e la tua `WEBHOOK_SECRET`:
   ```sql
   select cron.schedule('report-mensile', '0 7 * * 5', $$
     select net.http_post(
       url := 'https://IL_TUO_PROJECT_REF.supabase.co/functions/v1/report-mensile',
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', 'LA_TUA_WEBHOOK_SECRET'),
       body := '{}'::jsonb
     );
   $$);
   ```
   Parte ogni venerdì alle 7 (ora di Londra, 8 o 9 in Italia), ma la funzione manda il report solo se è l'ultimo venerdì
   del mese. Le lezioni dopo quel venerdì compaiono come previste. Per toglierlo: `select cron.unschedule('report-mensile');`.

Per i centri a cui vendi l'app, la funzione controlla il piano nella licenza: il report parte solo con il piano Pro. Se
imposti anche `LICENSE_PUBLIC_KEY` (la riga di `src/lib/license-key.ts`), controlla pure la firma della licenza.

## 10. Demo da far provare

Tutte le demo hanno i dati di esempio, senza database, e il bottone **Demo** per entrare come proprietario, cliente o
trainer e per cambiare piano. I dati restano solo su quel telefono o computer.

- **Android**: GitHub → Releases → **Demo per Android**, file `K9Manager-Demo.apk` da aprire sul telefono.
- **Prova Pro di 3 giorni (Android)**: **Actions → Demo per Android → Run workflow** con **prova** spuntato. Esce
  `K9Manager-Prova.apk` in Releases → **Prova Pro per Android**: piano Pro fisso, dati di esempio, niente pagamenti online.
  Tre giorni dopo la prima apertura su quel telefono l'app si blocca. È un'app a parte, quindi può stare accanto alla demo.
- **iPhone (e qualunque browser)**: la demo web su https://domenichiniedo.github.io/campo-cani-app/. In Safari
  **Condividi → Aggiungi alla schermata Home** e si apre a tutto schermo come un'app. Si aggiorna con
  Actions → **Sito web (web app e demo)**, che pubblica anche la web app vera (punto 3, *Web app nel browser*).
- **Windows e Mac**: punto 8, versione demo (Releases → **Demo per Windows** e **Demo per Mac**).

## 11. Prova di 3 giorni con dati condivisi (Android)

L'app vera, nel piano Pro, collegata a un database Supabase solo per la prova: proprietario, trainer e clienti la usano
dai loro telefoni e vedono gli stessi dati. Finiti i giorni, l'app mostra a tutti "La prova è finita"; i dati restano
nel progetto Supabase. I pagamenti online restano spenti.

**Tutto da GitHub (consigliato)**: una volta sola crea un token in supabase.com → **Account → Access Tokens** e
salvalo nel repository in **Settings → Secrets and variables → Actions → New repository secret** con nome
`SUPABASE_ACCESS_TOKEN`. Poi per ogni prova: **Actions → Prova con database → Run workflow** con il nome del centro,
l'email del proprietario e i giorni (se hai già creato il progetto su supabase.com, scrivi anche il suo codice, quello
di `xxxx.supabase.co`). Il workflow crea il progetto Supabase gratuito con il database pronto (senza
conferma via email) e costruisce l'APK per Android e il programma per Windows del proprietario: in una quindicina
di minuti sono in **Releases → Prova di K9 Manager – xxxx** (`K9Manager-Prova.apk` e `K9Manager-Prova-Windows.exe`).
Poi segui i punti 4 e 5 qui sotto.

**A mano**, se preferisci:

1. **Database della prova**: su <https://supabase.com> crea un nuovo progetto gratuito (il piano gratuito ne permette
   due attivi; un progetto fermo da una settimana viene messo in pausa). Poi come al punto 1: in `supabase/setup.sql`
   metti nell'ultima riga l'email di chi farà il proprietario nella prova (tu o il titolare del centro) ed eseguilo
   nel **SQL Editor**. In **Authentication → Sign In / Providers → Email** spegni "Confirm email", così chi si iscrive
   entra subito.
2. In **Project Settings → API Keys** copia l'URL del progetto e la **Publishable key** (`sb_publishable_...`). Mai la
   Secret key.
3. Su GitHub: **Actions → App per Android → Run workflow**, con l'URL, la publishable key e i giorni (3). In una decina
   di minuti esce in **Releases → Prova di K9 Manager – xxxx** il file `K9Manager-Prova.apk`, che vale fino a oggi più
   i giorni scelti, compreso l'ultimo. Per il programma Windows del proprietario: **Actions → App per Windows → Run
   workflow** con gli stessi dati; esce `K9Manager-Prova-Windows.exe` nella stessa release, e si installa accanto
   alla demo.
4. Il repository è privato: scarica l'APK con il tuo account e mandalo tu a chi prova (WhatsApp, email). Si installa
   come la demo; è un'app a parte, quindi può stare accanto alla demo.
5. Il proprietario si iscrive dall'app con l'email scritta in `setup.sql` (punto 2), poi imposta il centro. Clienti e
   trainer si iscrivono dall'app come sempre.

Per allungare la prova rilancia il workflow con gli stessi dati e altri giorni, e manda il nuovo APK: si installa
sopra quello vecchio. Con **giorni 0** esce l'app senza scadenza (`K9Manager.apk`, Releases → **App per Android**).
Quando la prova è finita puoi mettere in pausa o cancellare il progetto in Supabase.

## 12. Prova generale: tutto il giro, dalla registrazione del centro

Come sarà davvero: un centro si registra dall'app (**Registra il tuo centro**), il gestore gli prepara il database da
solo, il proprietario entra, dà il codice del centro (K9-XXXXXX) a clienti e trainer, e poi prenotazioni, pagamenti al
centro e il conto del mese del gestore.

Serve solo il secret `SUPABASE_ACCESS_TOKEN` del punto 11. Poi **Actions → Prova generale → Run workflow** con la tua
email. In una ventina di minuti il workflow accende il gestore su Supabase (progetto "K9 Gestore": tabelle, funzioni,
chiave delle licenze, orari, il tuo utente) e costruisce:

- **Releases → Prova generale di K9 Manager**: `K9Manager-ProvaGenerale.apk` (sul telefono si chiama "K9 Prova
  generale" e sta accanto alle altre) e `K9Manager-ProvaGenerale-Windows.exe`;
- **Releases → K9 Gestore**: il pannello per Windows e Mac. Entri con la tua email e la password che trovi nel
  riepilogo dell'esecuzione (Actions → Prova generale → l'esecuzione → Summary).

La prova in pratica:

1. Dall'app: **Registra il tuo centro**, con l'email del proprietario. In 3-5 minuti il centro è pronto (lo vedi anche
   nel pannello, Centri).
2. Il proprietario si iscrive con quella email ed entra già come proprietario; imposta campi, lezioni e orari.
3. Clienti e trainer installano lo stesso APK, scrivono il codice del centro (o aprono il link di invito) e si iscrivono.
4. Prenotazioni e pagamenti al centro come sempre. Nel pannello, **Piani e addebiti → Addebita adesso** fa subito il
   conto del mese; il centro lo vede in Impostazioni → Piano e abbonamento, e tu lo segni con **Segna pagato**.

È una prova: chi si iscrive entra subito, senza codice per email né SMS, e i bonifici non si leggono dalla banca (l'IBAN
che vedono i centri è d'esempio, lo cambi dal pannello). Il piano gratuito di Supabase tiene due progetti attivi, il
gestore e il centro: per questo il workflow mette in pausa la prova del punto 11, che si riaccende da supabase.com con i
suoi dati. Per registrare un secondo centro cancella prima su supabase.com il progetto del primo.

Per la sezione **App e versioni** del pannello (le app da scaricare e i pulsanti per rifarle) crea su github.com →
Settings → Developer settings → Fine-grained tokens un token solo per questo repository, con i permessi Actions (Read and
write) e Contents (Read and write, per cancellare le versioni dal pannello), salvalo nei secrets del repository come `GESTORE_GITHUB_TOKEN` e rilancia la prova
generale: lo copia lei nel gestore.

Per **Password dimenticata** e la conferma dell'email serve un SMTP che mandi il codice: senza, Supabase manda solo un
link che nell'app non funziona. Con Gmail: attiva la verifica in due passaggi, crea una password per le app su
<https://myaccount.google.com/apppasswords> e salva nei secrets del repository `SMTP_USER` (il tuo indirizzo Gmail) e
`SMTP_PASS` (la password per le app, 16 lettere). Per un altro servizio aggiungi `SMTP_HOST` (e `SMTP_PORT` se non è 587).
Poi rilancia la prova generale: mette l'SMTP nel gestore e nei centri già pronti. Da allora chi si iscrive con email e
password conferma l'email con un codice. Dopo aver unito una PR lancia **Actions → Aggiorna le app → Run workflow**:
aggiorna anche la prova generale. Nessuna action parte da sola a ogni commit, tranne i due controlli veloci delle PR
(lingue e `setup.sql`). Il gestore vero, per i centri veri, si accende come dice `gestore/README.md`.

## Cosa fa l'app

**Cliente**
- Iscrizione con un modulo corto: nome, cognome, telefono, email, password, nome del cane e un solo consenso a
  regolamento e privacy. Del cane anche sesso, sterilizzazione, microchip (consigliato) e una nota su obiettivi e
  situazione attuale. Il cliente sceglie se è una persona (solo scontrino) o un'associazione/società (scontrino o
  fattura, con i dati della società). Foto, altri cani e consenso social sono facoltativi. Passo passo:
  [docs/MANUALE.md](docs/MANUALE.md).
- Prenota: cane, lezione e opzione (IGP: Pista, Obbedienza, Attacco; Educazione base: Cucciolo o Adulto), campo (se ce
  n'è più di uno), giorno, ora. Vede solo le mezz'ore aperte e non già occupate su quel campo.
- Le mie lezioni, con disdetta fino al limite di ore deciso dal campo.
- Pacchetti: vede quelli offerti e li richiede; paga al campo e il proprietario lo attiva. Da lì ogni prenotazione di quel
  tipo scala una lezione, e una lezione annullata torna nel pacchetto.
- Diario: per ogni cane, cosa si è fatto a ogni lezione e i commenti del trainer, con le schede di valutazione che il
  trainer ha compilato sul cane (piani Professional e Pro).
- Profilo: foto (fotocamera o galleria), dati, cani, penalità ricevute, regolamento e privacy.
- Tessera e quota campo (se il centro le usa): fino a quando valgono e lo storico; le richiede o le rinnova dal Profilo
  e le paga al campo o con bonifico.
- Bacheca: comunicazioni del centro ed eventi con "Partecipo"; gli avvisi importanti stanno anche in cima a Prenota
  finché non li legge.
- Campo libero (se il centro lo offre): prenota il campo per il suo turno, senza trainer.
- Le mie lezioni mostrano il trainer con la sua foto.
- Se il proprietario cambia regolamento o privacy, al prossimo accesso deve accettare il nuovo testo prima di prenotare.

**Proprietario**
- Giorno: lezioni con cliente e telefono, filtro per campo, assegnazione del trainer, tasto Ingresso, incasso, penalità,
  annullo. Un trainer non può avere due lezioni alla stessa ora, nemmeno su campi diversi.
- Settimana: griglia a colonne (giorni affiancati × ore) divisa per campi, con le ore chiuse in pastello e il trainer su
  ogni lezione; tocchi un'ora libera per prenotare per un cliente. Sul telefono i giorni si scorrono di lato, partendo da oggi.
- Orari: per ogni campo e per ogni trainer apri o chiudi le mezz'ore di ogni giorno, copiale sulle settimane seguenti o su
  tutti i campi. Un trainer senza orari impostati è sempre disponibile.
- Incassi: incassato (lezioni, pacchetti, tessere e quote), da incassare, previsto, uscite e saldo per settimana, mese o
  anno, con grafico e lezioni per tipo, campo, trainer e pagamento.
- Bacheca: avvisi (anche importanti, in cima a Prenota) ed eventi con posti, chi ha letto e chi partecipa.
- Spese: le uscite del centro per categoria, mese per mese.
- Trainer: elenco con foto (fotocamera o galleria), lezioni della settimana, ore disponibili, diari scritti e collegamento
  dell'app con la loro email.
- Clienti: lista in ordine alfabetico con filtri, diario di ogni cane, ricerca anche per codice fiscale, dati di fatturazione, pacchetti da attivare e lezioni rimaste, tessere e quote campo da incassare o da rinnovare con lo storico di ognuno, penalità per cane, sospensione e riattivazione. Alla penalità numero N (scelta in Impostazioni) il cane
  viene sospeso da solo; 0 spegne la sospensione automatica.
- Report mensile (piano Pro): l'ultimo venerdì del mese un Excel per email con lezioni, pacchetti, fatture e scontrini,
  incassi e statistiche.
- Impostazioni: nome del centro, logo, numero di campi (ognuno con nome e indirizzo, anche uguale), trainer con le
  lezioni che seguono, pacchetti (lezioni, prezzo, validità), tessera e quota campo (nome e importo, anno solare,
  stagione sportiva o un numero di mesi, con o senza IVA, se serve per prenotare), campo libero senza trainer, orario della griglia, ore per la disdetta, limite penalità, lezioni (nome, durata,
  prezzo, opzioni), modelli delle schede di valutazione del cane (piani Professional e Pro: per esempio primo incontro o ipersensibilità al tatto, con
  voci a voto da 1 a 5, sì/no, scelta tra risposte o testo), regolamento e
  privacy.

**Trainer**
- Il proprietario, nella scheda Trainer, scrive l'email del trainer. Il trainer si iscrive dall'app con quella email
  scegliendo "Sono un trainer del centro" (se aveva già un account, diventa trainer subito).
- Lezioni: le sue lezioni del giorno con cane, cliente e telefono; il giorno della lezione fa entrare il cane in campo.
- Diario: dopo la lezione scrive cosa si è fatto e i commenti. Nei piani Professional e Pro compila le schede di valutazione del centro
  sul cane, quando vuole ("+ Valuta il cane" nei Diari) o nella pagina della lezione. Li leggono il cliente e il
  proprietario.
- Disponibilità: segna le mezz'ore in cui può fare lezione.
- Penalità: il giorno della lezione o dopo dà una penalità al cane (stessi motivi del proprietario) e può toglierla se
  sbaglia. Alla soglia il cane viene sospeso; lo riattiva il proprietario.
- Profilo: cambia la sua foto; nome e lezioni che segue li decide il centro.

**Metodi di pagamento.** I clienti possono sempre pagare al campo. In **Impostazioni → Metodi di pagamento** il
proprietario apre anche il bonifico istantaneo (con il suo IBAN) e la carta con Nexi.

Con il bonifico il cliente vede IBAN, causale e codice QR. Se il centro è del gestore e il gestore ha acceso il pagamento
dalla banca (`PAGA_ORA=1`, vedi gestore/README.md), sopra c'è anche **Paga dalla tua banca**: il cliente sceglie la
sua banca, scrive il suo IBAN e conferma il bonifico già compilato; appena parte, la lezione risulta pagata da sola.

La carta con Nexi per ora è **solo di prova**: la funzione parla con l'ambiente di prova di Nexi (XPay) e non addebita
niente; si paga con le carte di prova di Nexi, per esempio
VISA `4999 3402 6197 7289`, scadenza `12/30`, CVV `663`. Il cliente sceglie "Carta (Nexi)" quando prenota, paga sulla
pagina sicura di Nexi e la lezione risulta pagata da sola (Nexi avvisa la funzione, che controlla l'ordine). Se la lezione
pagata viene disdetta, il rimborso torna sulla carta. Per installarla nel progetto del centro:
```sh
supabase functions deploy nexi --no-verify-jwt
```
Senza altro usa la chiave pubblica di prova di Nexi; con un tuo account di prova puoi mettere la tua:
`supabase secrets set NEXI_API_KEY=la_chiave_di_prova`. I dati della carta non passano mai dall'app né dal database.

## Sicurezza

Le regole stanno nel database, non solo nell'app: un cliente vede solo i propri dati e cani, prenota solo tramite il controllo
che verifica orari aperti, sovrapposizioni, cane non sospeso e consensi aggiornati, e non può cambiare il proprio ruolo né
togliersi una sospensione.

## Struttura

```
src/app/(auth)      accesso, iscrizione, password dimenticata
src/app/(client)    schede del cliente
src/app/(owner)     schede del proprietario
src/app/terms.tsx   nuovo consenso quando cambiano le regole
src/lib             collegamento a Supabase, sessione, date, colori
supabase/migrations database e regole di accesso
docs                manuale d'uso, manuale tecnico e studio dei costi
```

Manuali: [d'uso](docs/MANUALE.md), [tecnico](docs/MANUALE-TECNICO.md), [studio dei costi](docs/COSTI.md).
