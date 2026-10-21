# Campo Cani

App per prenotare il campo di addestramento. I clienti si iscrivono, accettano regolamento e privacy e prenotano le lezioni
(IGP da 60 minuti, educazione base da 30). Il proprietario apre gli orari, vede il piano del giorno e della settimana, segna
l'ingresso dei cani, incassa, dà penalità e cambia tutte le impostazioni, logo compreso.

L'app è fatta con Expo (iPhone e Android dallo stesso codice). I dati stanno su Supabase, che offre gratis database e account.

## 1. Crea il database (una volta sola)

1. Vai su <https://supabase.com>, crea un account e un nuovo progetto. Come regione scegli Europa (per esempio Frankfurt).
2. Nel progetto apri **SQL Editor**, incolla tutto il file `supabase/migrations/0001_init.sql` e premi **Run**.
   Crea tabelle, regole di accesso, le due lezioni di partenza e lo spazio per il logo.
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

Per prima cosa vai in **Impostazioni**: nome del campo, indirizzo, logo, prezzi, regolamento e privacy. Poi in **Orari** apri
i giorni e le mezz'ore in cui il campo è prenotabile.

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

## Cosa fa l'app

**Cliente**
- Iscrizione con dati, uno o più cani e consenso a regolamento e privacy.
- Prenota: cane, lezione e opzione (IGP: Pista, Obbedienza, Attacco; Educazione base: Cucciolo o Adulto), giorno, ora.
  Vede solo le mezz'ore aperte e non già occupate.
- Le mie lezioni, con disdetta fino al limite di ore deciso dal campo.
- Profilo: dati, cani, penalità ricevute, regolamento e privacy.
- Se il proprietario cambia regolamento o privacy, al prossimo accesso deve accettare il nuovo testo prima di prenotare.

**Proprietario**
- Giorno: lezioni con cliente e telefono, tasto Ingresso, incasso, penalità, annullo.
- Settimana: vista dei 7 giorni, tocca un giorno per aprirlo.
- Orari: apri o chiudi le mezz'ore di ogni giorno, e copiale sulle settimane seguenti.
- Clienti: ricerca, penalità per cane, sospensione e riattivazione. Alla penalità numero N (scelta in Impostazioni) il cane
  viene sospeso da solo; 0 spegne la sospensione automatica.
- Impostazioni: nome, indirizzo, logo, orario della griglia, ore per la disdetta, limite penalità, lezioni (nome, durata,
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
