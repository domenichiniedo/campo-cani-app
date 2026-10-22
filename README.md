# Campo Cani

App per prenotare il campo di addestramento. I clienti si iscrivono, accettano regolamento e privacy e prenotano le lezioni
(IGP da 60 minuti, educazione base da 30). Il proprietario apre gli orari, vede il piano del giorno e della settimana, segna
l'ingresso dei cani, incassa, dà penalità e cambia tutte le impostazioni, logo compreso.

L'app è fatta con Expo (iPhone e Android dallo stesso codice). I dati stanno su Supabase, che offre gratis database e account.

## 1. Crea il database (una volta sola)

1. Vai su <https://supabase.com>, crea un account e un nuovo progetto. Come regione scegli Europa (per esempio Frankfurt).
2. Nel progetto apri **SQL Editor**, incolla tutto il file `supabase/migrations/0001_init.sql` e premi **Run**.
   Crea tabelle, regole di accesso, le due lezioni di partenza e lo spazio per il logo.
   Poi fai lo stesso con `supabase/migrations/0002_campi_trainer.sql`, che aggiunge campi e trainer.
   Se avevi già eseguito il primo file, esegui solo il secondo: orari e prenotazioni esistenti passano al primo campo.
   Poi, in ordine, `0003_fatturazione.sql` (codice fiscale e indirizzo di fatturazione), `0004_pacchetti.sql` (pacchetti
   di lezioni), `0005_cancellazione_account.sql` (il cliente può cancellare il proprio account), `0006_fatture.sql`
   (fatture dei pagamenti online), `0007_scontrini.sql` (scontrino elettronico in alternativa alla fattura) e
   `0008_licenza.sql` (licenza per l'app venduta ad altri centri). Ogni file va eseguito una volta sola.
3. In **Project Settings → API Keys** copia l'URL del progetto e la **Publishable key** (inizia con `sb_publishable_`).
   Non usare mai la Secret key nell'app.
4. Copia il file `.env.example` in `.env.local` e incolla i due valori:

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://il-tuo-progetto.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

### Email

- **Conferma email.** In **Authentication → Sign In / Providers → Email** puoi tenere attiva "Confirm email": il cliente riceve
  un link e poi accede. Se la spegni, entra subito dopo l'iscrizione.
- **Password dimenticata.** L'app chiede un codice, non un link. In **Authentication → Emails → Reset Password** sostituisci il
  testo con qualcosa come:

  ```
  <h2>Nuova password</h2>
  <p>Il tuo codice è: <strong>{{ .Token }}</strong></p>
  ```

- Le email gratuite di Supabase sono poche all'ora. Quando i clienti diventano tanti, collega un servizio SMTP in
  **Authentication → Emails → SMTP Settings**.

## 2. Il tuo account da proprietario

La password la scegli tu e non passa da nessun altro.

1. Avvia l'app (punto 3) e iscriviti come un cliente qualsiasi, con la tua email e la tua password. Come cane puoi scrivere
   quello che vuoi.
2. Su Supabase, in **SQL Editor**, esegui (con la tua email):

   ```sql
   update public.profiles set role = 'owner' where email = 'tua@email.it';
   ```

3. Esci e rientra nell'app: vedrai le schede del proprietario (Giorno, Settimana, Orari, Clienti, Impostazioni).

Per prima cosa vai in **Impostazioni**: nome del centro, logo, numero di campi con nome e indirizzo, trainer, prezzi,
regolamento e privacy. Poi in **Orari** apri, campo per campo, i giorni e le mezz'ore prenotabili.

## 3. Provare l'app sul telefono

Serve un computer con [Node.js](https://nodejs.org) (versione 20 o più recente).

```bash
npm install
npx expo start
```

Sul telefono installa **Expo Go** (App Store o Play Store) e inquadra il QR code che compare nel terminale.

## 4. Pubblicare sugli store

Si usa EAS, il servizio di Expo per creare le app vere:

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
  **Battuto** (il numero del documento è facoltativo). Va bene con qualsiasi registratore.
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

**Per ogni centro che compra**

1. Crea il suo progetto Supabase (meglio sul suo account, così i dati dei suoi clienti sono suoi) ed esegui le
   migrazioni, dalla `0001` alla `0008`, come al punto 1.
2. Genera la licenza con l'indirizzo e la **publishable key** del suo progetto:
   ```sh
   node tools/licenza.mjs genera --campo "Centro Cinofilo Le Querce" --id querce \
     --scadenza 2027-12-31 --url https://xxxx.supabase.co --chiave sb_publishable_xxxx
   ```
3. Manda il codice al centro. Il titolare installa l'app, incolla il codice, si iscrive e lo rendi proprietario come al
   punto 2. Da **Impostazioni → Licenza** manda ai suoi clienti il link di attivazione.

**Rinnovo e sospensione**

- Per rinnovare genera un codice con lo **stesso `--id`** e una scadenza più lontana. Il centro lo incolla in
  Impostazioni → Licenza e vale subito anche per i suoi clienti, senza che facciano niente.
- Per sospendere un centro basta non rinnovare: alla scadenza l'app non si apre più. Se vuoi più controllo, fai
  licenze brevi (per esempio mensili).
- `node tools/licenza.mjs verifica <codice>` mostra cosa c'è in un codice e se la firma è tua.

## Cosa fa l'app

**Cliente**
- Iscrizione con dati, codice fiscale (o partita IVA) e indirizzo di fatturazione, uno o più cani e consenso a
  regolamento e privacy. Il codice fiscale viene controllato. Chi era iscritto prima completa i dati al primo accesso.
- Prenota: cane, lezione e opzione (IGP: Pista, Obbedienza, Attacco; Educazione base: Cucciolo o Adulto), campo (se ce
  n'è più di uno), giorno, ora. Vede solo le mezz'ore aperte e non già occupate su quel campo.
- Le mie lezioni, con disdetta fino al limite di ore deciso dal campo.
- Pacchetti: vede quelli offerti e li richiede; paga al campo e il proprietario lo attiva. Da lì ogni prenotazione di quel
  tipo scala una lezione, e una lezione annullata torna nel pacchetto.
- Profilo: dati, cani, penalità ricevute, regolamento e privacy.
- Se il proprietario cambia regolamento o privacy, al prossimo accesso deve accettare il nuovo testo prima di prenotare.

**Proprietario**
- Giorno: lezioni con cliente e telefono, filtro per campo, assegnazione del trainer, tasto Ingresso, incasso, penalità,
  annullo. Un trainer non può avere due lezioni alla stessa ora, nemmeno su campi diversi.
- Settimana: vista dei 7 giorni con campo e trainer, tocca un giorno per aprirlo.
- Orari: per ogni campo apri o chiudi le mezz'ore di ogni giorno, copiale sulle settimane seguenti o su tutti i campi.
- Clienti: ricerca anche per codice fiscale, dati di fatturazione, pacchetti da attivare e lezioni rimaste, penalità per cane, sospensione e riattivazione. Alla penalità numero N (scelta in Impostazioni) il cane
  viene sospeso da solo; 0 spegne la sospensione automatica.
- Impostazioni: nome del centro, logo, numero di campi (ognuno con nome e indirizzo, anche uguale), trainer con le
  lezioni che seguono, pacchetti (lezioni, prezzo, validità), orario della griglia, ore per la disdetta, limite penalità, lezioni (nome, durata,
  prezzo, opzioni), regolamento e privacy.

**Pagamento online.** È predisposto ma spento: i clienti pagano al campo. Per accenderlo serve collegare un conto Stripe e un
piccolo servizio lato server, da fare a parte.

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
```
