# Manuale tecnico di K9 Manager

Come è fatto il codice, passo per passo: da dove parte l'app, come trova il database del centro, come si iscrive un
cliente, che cosa fanno il database e le funzioni sul server, come lavora il gestore e come si costruiscono le app.
Il manuale per chi usa l'app è [MANUALE.md](MANUALE.md); i passi di installazione sono nel [README](../README.md) e in
[gestore/README.md](../gestore/README.md).

## Indice

1. [La mappa del repository](#1-la-mappa-del-repository)
2. [Le tecnologie](#2-le-tecnologie)
3. [L'avvio dell'app, passo per passo](#3-lavvio-dellapp-passo-per-passo)
4. [Licenza e collegamento al database del centro](#4-licenza-e-collegamento-al-database-del-centro)
5. [La sessione e le schermate protette](#5-la-sessione-e-le-schermate-protette)
6. [L'iscrizione di un cliente, dal modulo al database](#6-liscrizione-di-un-cliente-dal-modulo-al-database)
7. [Prenotare, entrare in campo, penalità](#7-prenotare-entrare-in-campo-penalità)
8. [Pagamenti, fatture e scontrini](#8-pagamenti-fatture-e-scontrini)
9. [Il database del centro: le migrazioni](#9-il-database-del-centro-le-migrazioni)
10. [Le funzioni del centro (supabase/functions)](#10-le-funzioni-del-centro-supabasefunctions)
11. [Il gestore](#11-il-gestore)
12. [Il pannello K9 Gestore](#12-il-pannello-k9-gestore)
13. [Le schermate: src/app](#13-le-schermate-srcapp)
14. [I componenti: src/components](#14-i-componenti-srccomponents)
15. [Le librerie: src/lib](#15-le-librerie-srclib)
16. [Le traduzioni](#16-le-traduzioni)
17. [Windows, Mac, Android e le demo](#17-windows-mac-android-e-le-demo)
18. [Gli strumenti: tools](#18-gli-strumenti-tools)
19. [Le action di GitHub](#19-le-action-di-github)
20. [Le prove e i controlli](#20-le-prove-e-i-controlli)
21. [Come aggiungere una funzione nuova](#21-come-aggiungere-una-funzione-nuova)

---

## 1. La mappa del repository

```
src/app/                schermate (Expo Router: un file = una pagina)
  _layout.tsx           radice: sceglie pannello, licenza, sessione e schermate protette
  (auth)/               accesso, iscrizione, password dimenticata
  (client)/             schede del cliente
  (owner)/              schede del proprietario
  (trainer)/            schede del trainer
  welcome.tsx, terms.tsx, phone.tsx, billing.tsx, attiva.tsx   passaggi obbligati
src/components/         pezzi di interfaccia riusati (moduli, schede, pannelli delle impostazioni, K9 Gestore)
src/lib/                logica senza interfaccia: Supabase, sessione, licenze, piani, fatturazione, traduzioni
src/locales/            traduzioni (en, de, es, fr); l'italiano è il testo del codice
supabase/migrations/    il database di ogni centro, una migrazione per volta (0001 → 0024)
supabase/setup.sql      tutte le migrazioni in un file (generato da tools/setup-sql.mjs)
supabase/functions/     funzioni sul server del centro: fatture, scontrini, Nexi, report mensile
gestore/                il server gestore: migrazioni e funzioni (un progetto Supabase tuo)
desktop/                il programma per Windows e Mac (Electron) e il finto database delle demo
mobile-demo/            l'app Android (Capacitor), la demo web e le pagine pubbliche (privacy, cancella account)
tools/                  comandi da lanciare sul computer: licenze, centri, prove, setup.sql, traduzioni
.github/workflows/      le action che costruiscono app, demo e prove
metro.config.js         toglie il pannello del gestore dalle app dei centri
docs/                   i manuali e lo studio dei costi
```

## 2. Le tecnologie

- **Expo (SDK 58) e React Native**, con **Expo Router**: lo stesso codice gira su Android, iPhone e nel browser.
  La web app (GitHub Pages, installabile come PWA con `mobile-demo/sw.js`), l'app Android e la demo web usano la
  versione **web** esportata (`npx expo export -p web`), da sola o messa dentro
  **Capacitor** (Android) o **Electron** (Windows e Mac).
- **Supabase** per ogni centro: database Postgres con le regole di accesso (RLS), account (email e password, Google),
  spazi per i file (logo e foto) e funzioni sul server (Deno).
- **TypeScript** dappertutto; le funzioni sul server sono TypeScript per Deno.
- **tweetnacl** per controllare la firma Ed25519 delle licenze.

## 3. L'avvio dell'app, passo per passo

Il file di partenza è `src/app/_layout.tsx` (`RootLayout`):

1. Se la build è quella del pannello (`EXPO_PUBLIC_PANNELLO=1`, `panelOnly` in `src/lib/edition.ts`) mostra
   `GestorePanel` e basta.
2. Se è una prova a tempo scaduta (`src/lib/trial.ts`) mostra "La prova è finita".
3. Se le licenze sono accese (`licensingEnabled`, cioè c'è una chiave pubblica in `src/lib/license-key.ts`) oppure la
   build ha già un database (`hasEnvConfig`: `EXPO_PUBLIC_SUPABASE_URL` e la chiave publishable), avvolge tutto in
   `LicenseGate` → `SessionProvider` → `Navigator`.
4. Altrimenti mostra "Manca il collegamento", con le istruzioni.

`LicenseGate` (sezione 4) decide a quale database collegarsi; se manca un codice valido mostra `Activate`
(`src/components/activate.tsx`), dove si scrive il codice del centro o si registra un centro nuovo.

## 4. Licenza e collegamento al database del centro

### Il codice di licenza

`src/lib/license.ts` legge codici della forma `CC1.<dati>.<firma>`: i dati sono un JSON in base64url (`id`, `campo`,
`scade`, `emessa`, `piano`, `url` e `chiave` del database) e la firma è Ed25519. Valgono due chiavi pubbliche
(`src/lib/license-key.ts`): la tua (licenze fatte a mano con `tools/licenza.mjs`) e quella del server gestore (centri
registrati dall'app). Senza la chiave privata non si può creare né cambiare un codice.

### Il codice corto del centro

Clienti e trainer scrivono `K9-XXXXXX` (`isCentreCode` in `src/lib/gestore.ts`). `LicenseGate` chiama la funzione
`centro` del gestore (`centreStatus`), che risponde con la licenza firmata del centro.

### Il collegamento

`src/lib/supabase.ts` esporta `supabase`, un **Proxy** che passa ogni chiamata al client del centro collegato in quel
momento. `connectTo(url, key)` crea il client nuovo quando l'app passa a un altro centro: tutto il resto del codice
usa sempre `supabase` senza sapere quale centro è.

`LicenseGate` (`src/lib/license-gate.tsx`) tiene nel `localStorage` il codice attivo e l'elenco dei centri aperti sul
dispositivo (`SavedCentre`), così si passa da un centro all'altro senza riscrivere il codice. Fra il codice salvato e
quello nel database del centro (`settings.license_code`) vale il più lungo (`longer`): quando il centro rinnova, tutti
i clienti hanno subito la licenza nuova. Il piano letto dalla licenza arriva a tutta l'app con `usePlan()`
(`src/lib/plans.ts`), che dà i limiti (campi, clienti, lezioni, trainer...) e le funzioni comprese.

### Il link di invito e il QR

Il link `…/functions/v1/invito?codice=K9-XXXXXX` (funzione `invito` del gestore) apre l'app già sul centro (su Android
con un intent filter) o porta a scaricarla. Il QR del centro (`src/components/centre-qr.tsx`) contiene quel link: lo
disegna quadratino per quadratino con correzione d'errore alta (livello H) e mette nel mezzo un riquadro bianco con il
codice del centro. Il livello H regge il riquadro: il QR si legge lo stesso. `src/lib/share.ts` lo condivide, lo copia
e lo salva (nell'app Android con i plugin di Capacitor, nei Documenti).

## 5. La sessione e le schermate protette

`SessionProvider` (`src/lib/session.tsx`) carica, per l'utente collegato:

- `settings` (riga unica `id = 1`), `lesson_types`, `fields`, `trainers` attivi, tagliati ai limiti del piano;
- il `profile` dell'utente e, per un trainer, il trainer collegato (`trainer_accounts`);
- ogni minuto e quando l'app torna in primo piano li ricarica (`useWhenActive`), così un ruolo nuovo o un regolamento
  cambiato arrivano senza riaprire l'app;
- a ogni `refresh()` chiama anche `penalize_no_shows()` (sezione 7), senza aspettare la risposta.

Da questi dati calcola dove deve andare l'utente:

| Flag | Vuol dire | Schermata |
| --- | --- | --- |
| `needsSignup` | entrato con Google, senza consensi | `welcome.tsx` |
| `needsTerms` | regolamento o privacy cambiati | `terms.tsx` |
| `needsPhone` | conferma SMS accesa e cellulare non confermato | `phone.tsx` |
| `needsBilling` | vuole la fattura ma mancano i dati (`billingOk`) | `billing.tsx` |
| `isOwner`, `isTrainer` | ruolo nel profilo | `(owner)`, `(trainer)` |

`Navigator` in `_layout.tsx` usa `Stack.Protected` di Expo Router: ogni gruppo di schermate si apre solo quando la sua
condizione è vera, nell'ordine della tabella. Il programma per computer (`ownerOnly`) si apre solo con il piano che lo
comprende e solo ai proprietari.

## 6. L'iscrizione di un cliente, dal modulo al database

### Con email e password (`src/app/(auth)/register.tsx`)

1. Il modulo corto chiede nome, cognome, telefono, email, password e nome del cane, con i pezzi di
   `src/components/signup-parts.tsx`: `DogFacts` (sesso e sterilizzazione), `ChipField`, `GoalsField`,
   `ClientKindCard` (persona o società, fattura sì o no, con `BillingFields`), `ConsentCard` (regolamento e privacy in
   un solo consenso), `OptionalSection` (foto, altri cani con `DogCards`, consenso social).
2. `submit()` controlla: nome, cognome e telefono; i dati di fatturazione con `docError` (`src/lib/billing.ts`: per una
   società con fattura servono ragione sociale, codice fiscale e sede, partita IVA, SDI e PEC se ci sono devono essere
   validi); almeno un cane; microchip di 15 cifre o vuoto (`chipOk`); date AAAA-MM-GG; password di 8 caratteri; il
   consenso; il limite di clienti del piano (`client_count`).
3. Chiama `supabase.auth.signUp` mettendo tutto nei **metadati** dell'utente: dati, `docColumns(kind, wants, billing)`
   (client_kind, doc_pref, company_name, vat_number, tax_code, indirizzo, sdi_code, pec), versioni di regolamento e
   privacy accettate, consenso social e `dogs: cleanDogs.map(dogColumns)`.
4. Nel database il trigger **`handle_new_user`** (ultima versione in `0024_clienti_societa.sql`) parte all'inserimento
   in `auth.users` e crea in una volta il profilo e i cani: normalizza codice fiscale, partita IVA (toglie "IT"), SDI e
   PEC; mette `doc_pref = 'receipt'` alle persone; mette `phone_ok = false` se il centro chiede l'SMS; scarta un
   microchip scritto male invece di bloccare l'iscrizione.
5. Se il progetto chiede la conferma dell'email non arriva la sessione: l'app mostra `EmailCode` e aspetta il codice
   (`verifyOtp`). Con il codice giusto arriva la sessione e il layout porta avanti.
6. Se c'è una foto, `saveSignupPhoto` la carica appena c'è l'account.

### Con Google (`src/components/google-button.tsx`, `src/lib/google.ts`, `src/app/welcome.tsx`)

Ogni centro ha un suo progetto Supabase, quindi niente redirect: l'app si fa dare da Google un **ID token** (Google
Identity Services nel browser, il client desktop nel programma per computer) e lo passa a
`supabase.auth.signInWithIdToken`. L'account nasce senza metadati dell'iscrizione: profilo con `rules_ver` e
`privacy_ver` vuoti, quindi `needsSignup`. `welcome.tsx` chiede i dati che mancano, aggiorna `profiles`, inserisce i
cani con `dogColumns` e per ultimo chiama `accept_terms`: da lì l'iscrizione è completa.

### Persona o società, e il database

`0024_clienti_societa.sql` aggiunge a `profiles` `client_kind`, `company_name`, `vat_number`, `sdi_code`, `pec`. Il
trigger `receipt_for_people` impedisce a una persona di avere `doc_pref = 'invoice'`. `has_billing` richiede la
ragione sociale per le società. Quando nasce una fattura, il trigger `invoice_company_buyer` copia nella riga di
`invoices` partita IVA, SDI e PEC del cliente (`buyer_vat`, `buyer_sdi`, `buyer_pec`).

## 7. Prenotare, entrare in campo, penalità

- **Orari liberi**: `src/app/(client)/index.tsx` legge `availability` (le mezz'ore aperte di campi e trainer) e
  `busy_slots` (le mezz'ore prese, senza dire da chi); `src/lib/slots.ts` calcola gli inizi possibili per la durata
  della lezione.
- **Prenotare**: `book_slot` (cliente) e `owner_book` (proprietario per un cliente) sono funzioni del database che
  rifanno tutti i controlli: orari aperti, sovrapposizioni sul campo e del trainer, cane non sospeso, consensi
  aggiornati, pacchetto. Le classi di gruppo passano da `join_class`. Il cliente non può scrivere direttamente in
  `bookings`.
- **Disdire**: `cancel_booking` controlla il limite di ore; una lezione di pacchetto torna nel pacchetto
  (`refund_package_lesson`).
- **Ingresso**: il proprietario scrive `checked_in_at` (`src/components/booking-card.tsx`); il trainer passa da
  `trainer_check_in`.
- **Assenza** (`0023_cani.sql`): `penalize_no_shows()` è `security definer` e la può chiamare ogni utente collegato.
  Cerca le prenotazioni attive finite da più di un'ora, senza ingresso, non ancora guardate (`noshow_done = false`) e
  successive a `settings.noshow_since` (così non punisce le lezioni di prima dell'aggiornamento). Per ognuna segna
  `noshow_done` e, se `settings.noshow_penalty` è acceso, inserisce la penalità "Assenza senza disdetta". Siccome
  `noshow_done` resta vero, una penalità tolta a mano non torna. Il trigger `checked_in_clears_no_show` toglie la
  penalità se il cane viene fatto entrare dopo.
- **Sospensione**: `auto_block_dog` sospende il cane alla penalità numero `penalty_limit`.

## 8. Pagamenti, fatture e scontrini

- **Al campo**: il proprietario preme Incassa (`bookings.paid`).
- **Bonifico istantaneo**: `src/lib/transfer.ts` e `src/components/transfer.tsx` mostrano IBAN, causale e QR EPC.
  Con "Paga dalla tua banca" (`src/components/pay-now.tsx`) l'app chiama la funzione `lezione` del gestore, che crea un
  pagamento con Enable Banking; al ritorno dalla banca la funzione `pagamento` segna la lezione pagata nel database del
  centro.
- **Carta con Nexi**: `src/lib/nexi.ts` chiama la funzione `nexi` del centro, che crea l'ordine su XPay (oggi
  l'ambiente di prova, indirizzo fisso nel codice) e torna la pagina di pagamento. Nexi avvisa la funzione dell'esito;
  la funzione richiede l'ordine a Nexi e segna la lezione pagata solo se Nexi conferma. Alla disdetta l'app chiama
  `nexi` con `rimborsa`. Le righe stanno in `nexi_orders` (`0021_nexi.sql`).
- **Documenti**: quando una lezione pagata online risulta incassata, `invoice_online_booking` crea una riga in
  `invoices` (fattura o scontrino secondo `doc_pref`) con una copia dei dati del cliente; per i pacchetti
  `invoice_package`. Un webhook sull'inserimento chiama `fatture-in-cloud` o `scontrini-openapi`. Lo scontrino "Lo batto
  io" si chiude con `mark_receipt_done`; quello sull'Epson al campo lo stampa `src/lib/epson-rt.ts` (ePOS-Print XML a
  `fpmate.cgi`) e salva il numero.

## 9. Il database del centro: le migrazioni

Ogni migrazione si esegue una volta, in ordine. `tools/setup-sql.mjs` le unisce in `supabase/setup.sql` (progetto
nuovo) e in `gestore/supabase/functions/_shared/migrazioni.ts` (il gestore le aggiunge da solo ai centri).

| Migrazione | Cosa fa |
| --- | --- |
| 0001_init | profili, cani, impostazioni, orari, prenotazioni, penalità; `handle_new_user`, `book_slot`, `cancel_booking`, `accept_terms`, `is_owner`, le regole RLS |
| 0002_campi_trainer | più campi e trainer; orari e prenotazioni per campo |
| 0003_fatturazione | codice fiscale e indirizzo; `has_billing` |
| 0004_pacchetti | pacchetti di lezioni e loro uso nelle prenotazioni |
| 0005_cancellazione_account | `delete_my_account` |
| 0006_fatture, 0007_scontrini | tabella `invoices`, fatture e scontrini automatici |
| 0008_licenza, 0009_piani | codice di licenza nel database, `client_count` |
| 0010_prenota_proprietario | `owner_book` |
| 0011_disponibilita_trainer | orari dei trainer |
| 0012_documento_pacchetti | fattura o scontrino anche per i pacchetti |
| 0013_area_trainer | account dei trainer, diario dei cani, `trainer_check_in` |
| 0014_foto_e_penalita | foto, penalità date dal trainer |
| 0015_proprietario_automatico | il titolare diventa proprietario da solo (`owner_setup`) |
| 0016_lezioni_di_gruppo | classi di gruppo |
| 0017_consenso_social | consenso a foto e video |
| 0018_schede_valutazione | schede di valutazione nel diario |
| 0019_piu_proprietari | `add_owner`, `remove_owner` |
| 0020_nota_bonifico_conferme | nota alla prenotazione, bonifico istantaneo, conferma SMS (`phone_ok`) |
| 0021_nexi | `nexi_orders` e pagamento con carta |
| 0022_voto_lezioni | `rate_lesson` |
| 0023_cani | microchip, obiettivi, sesso e sterilizzazione del cane; assenze e `penalize_no_shows` |
| 0024_clienti_societa | persona o società; dati della società e della fattura |
| 0025_tesseramento | `membership_settings` e `memberships` (una riga per tessera, così resta lo storico); `request_membership`, `membership_end`, `has_membership`; il trigger `check_membership` ferma la prenotazione del cliente senza tessera valida se il centro la chiede; con la tessera con IVA `invoice_membership` prepara fattura o scontrino (`invoices.membership_id`) |

Le regole stanno nel database, non solo nell'app: le policy RLS fanno vedere a un cliente solo i suoi dati, e i
trigger `guard_profile` e `guard_dog` gli impediscono di cambiare ruolo o togliere una sospensione.

## 10. Le funzioni del centro (supabase/functions)

Girano su Supabase, mai nell'app: le chiavi stanno nei Secrets del progetto.

| Funzione | La chiamano | Cosa fa |
| --- | --- | --- |
| `fatture-in-cloud` | webhook su `invoices`, "Invia ora" | crea la fattura su Fatture in Cloud con i dati del cliente (anche partita IVA, codice SDI e PEC), e con `FIC_SEND_TO_SDI=si` la manda allo SDI |
| `scontrini-openapi` | webhook su `invoices`, "Invia ora" | trasmette lo scontrino con Openapi e ne legge il numero quando è fatto |
| `nexi` | app del cliente e del proprietario, Nexi | ordine, esito, rimborso |
| `report-mensile` | pg_cron ogni venerdì, il proprietario | Excel del mese per email con Resend (piano Pro) |
| `_shared/common.ts` | | parti comuni di fatture e scontrini |

## 11. Il gestore

Il gestore è un progetto Supabase tuo (`gestore/`), separato dai centri. Non tiene mai dati dei clienti.

### Le tabelle (gestore/supabase/migrations)

`centri` e `addebiti` (0001), prezzi dei piani, cambi di piano, il tuo conto e i bonifici (0002), dati di fatturazione
del centro (0003, con persona o associazione e telefono in 0008), prezzi di partenza (0004), bonus (0005), prezzo fisso
e 1% dei pacchetti (0006), bonifici delle lezioni dei clienti (0007).

### La registrazione di un centro, passo per passo

1. `src/components/register-centre.tsx` raccoglie nome, email, piano, formula, chi apre il centro
   (`CentreBillingFields`, controllo con `centreBillingError(…, true)`), IBAN e bonus, e chiama `registra-centro`.
2. `registra-centro` controlla i dati (`leggiFatturazione(…, true)` in `_shared/fatturazione.ts`, rigida solo per le
   registrazioni nuove), crea la riga in `centri` con il codice `K9-XXXXXX` e risponde subito.
3. `prepara-centri` (pg_cron ogni minuto) porta avanti ogni centro un passo alla volta (`_shared/passi.ts`):
   **progetto** (crea il progetto Supabase con la Management API, `_shared/supabase-api.ts`) → **avvio** (aspetta che
   sia attivo) → **database** (esegue le migrazioni di `migrazioni.ts`, scrive l'email del titolare, imposta email,
   SMS e Google) → **chiavi** (prende la publishable key) → **licenza** (la firma con la chiave del server,
   `_shared/licenza.ts`) → **pronto**. Ogni passo si può ripetere senza danni: se uno fallisce, il giro dopo riprova da
   lì. Ai centri pronti aggiunge le migrazioni nuove.
4. L'app, intanto, chiede lo stato a `centro` e mostra i passi; a "pronto" riceve la licenza e si collega.

### Il conto del mese e i bonifici

- `addebito-mensile` (il primo del mese) calcola con `_shared/costi.ts` (`contoDelMese`) canone diviso a giorni, quote
  per prenotazione, 1% dei pacchetti o prezzo fisso, meno il bonus.
- `controlla-bonifici` (ogni 6 ore) legge i movimenti del tuo conto con Enable Banking (`_shared/banca.ts`, firma JWT
  delle chiamate), li abbina agli addebiti dalla causale o dall'IBAN (`_shared/bonifici.ts`) e rinnova la licenza fino
  al giorno `GIORNI_PER_PAGARE` del mese dopo (`_shared/addebiti.ts`).
- `abbonamento` serve l'app del proprietario: conto da pagare, cambio di piano, disdetta, "Paga ora" (`_shared/paga.ts`).
- `banca`, `pagamento`: pagine di ritorno dalla banca. `lezione`: "Paga dalla tua banca" dei clienti
  (`_shared/lezioni.ts`). `invito`: il link dei centri (`_shared/invito.ts`).
- `pannello`: tutte le azioni del pannello (sezione 12), solo per le email in `AMMINISTRATORI`; il cambio password di
  chi entra in un centro sta in `_shared/password.ts`, le app su GitHub in `_shared/github.ts`, lo stato dei database
  in `_shared/database.ts`.

## 12. Il pannello K9 Gestore

`src/components/gestore-panel.tsx` è tutto il pannello (in italiano, lo usi solo tu). Entra nel progetto del gestore
con il tuo utente e chiede tutto alla funzione `pannello` (`src/lib/gestore-admin.ts`). Sezioni: Centri, Database,
Statistiche, Banca e bonifici, Piani e addebiti, Bonus, App e versioni, Il tuo accesso.

- **Password dimenticata**: `adminSendReset` manda il codice (`resetPasswordForEmail`), `adminResetPassword` lo
  verifica (`verifyOtp` di tipo recovery) e scrive la password nuova; `adminChangePassword` cambia la password da
  dentro. Serve che il progetto mandi le email: `tools/prova-generale.mjs` imposta SMTP e il modello con il codice.
- **Google**: lo stesso `GoogleButton` dell'app, sul progetto del gestore.
- **Demo**: `src/lib/gestore-demo.ts`, dati finti senza server.
- **Leggerezza**: `metro.config.js` sostituisce `@/components/gestore-panel` con `gestore-panel-assente.tsx` (un
  componente vuoto) in tutte le build tranne quella del pannello, così le app dei centri non si portano dietro quasi
  100 KB di codice che non usano.

## 13. Le schermate: src/app

| File | Cosa fa |
| --- | --- |
| `(auth)/index.tsx` | accesso con email e password o Google; rimanda il codice se l'email non è confermata |
| `(auth)/register.tsx` | iscrizione di clienti e trainer (sezione 6) |
| `(auth)/forgot.tsx` | password dimenticata con codice |
| `welcome.tsx` | completa l'iscrizione di chi entra con Google |
| `terms.tsx`, `phone.tsx`, `billing.tsx` | nuovo consenso, codice SMS, dati per la fattura mancanti |
| `attiva.tsx` | ritorno dal link di attivazione |
| `(client)/index.tsx` | prenotare lezioni e classi, scelta del pagamento |
| `(client)/bookings.tsx` | le mie lezioni, disdetta, pagamento, voto |
| `(client)/packages.tsx`, `diary.tsx`, `profile.tsx` | pacchetti, diario dei cani, profilo con cani e fattura |
| `(owner)/index.tsx`, `week.tsx` | giorno e settimana |
| `(owner)/hours.tsx` | orari di campi e trainer |
| `(owner)/clients.tsx` | schede dei clienti con persona o società, cani con microchip, penalità |
| `(owner)/trainers.tsx`, `stats.tsx`, `settings.tsx` | trainer, incassi e statistiche, impostazioni |
| `(trainer)/index.tsx`, `dogs.tsx`, `hours.tsx`, `profile.tsx` | lezioni con ingresso e diario, diari dei cani, disponibilità, profilo |

## 14. I componenti: src/components

| File | Cosa fa |
| --- | --- |
| `ui.tsx` | i mattoni: Screen, Card, Field, Button, Chips, Check, Toggle, Badge, Step, menu delle lingue e dei centri |
| `signup-parts.tsx` | i pezzi del modulo di iscrizione e del cane (sezione 6) |
| `billing-fields.tsx`, `centre-billing-fields.tsx` | dati della società del cliente; chi apre il centro (persona o associazione) |
| `booking-card.tsx` | la scheda di una prenotazione per proprietario e trainer: cane con sesso e obiettivi, ingresso, incasso, penalità |
| `class-card.tsx`, `new-class.tsx`, `add-lesson.tsx`, `owner-book.tsx`, `week-grid.tsx`, `slot-editor.tsx` | classi, prenotazioni del proprietario, griglia della settimana, orari |
| `centre-qr.tsx`, `license-panel.tsx` | QR del centro e licenza |
| `register-centre.tsx`, `activate.tsx` | registrazione del centro e attivazione |
| `subscription-panel.tsx` | piano e abbonamento, conto del gestore |
| `transfer.tsx`, `transfer-panel.tsx`, `pay-now.tsx`, `card-pay.tsx`, `nexi-panel.tsx` | pagamenti |
| `invoices-panel.tsx` | fatture e scontrini, registratore |
| `packages-editor.tsx`, `eval-forms-editor.tsx`, `owners-panel.tsx`, `report-panel.tsx` | parti delle impostazioni |
| `dog-diary.tsx`, `lesson-rating.tsx`, `photo.tsx`, `email-code.tsx`, `google-button.tsx`, `limit-note.tsx`, `owner-sidebar.tsx` | diario, voti, foto, codice email, Google, avvisi dei limiti, menu del programma per computer |
| `gestore-panel.tsx`, `gestore-panel-assente.tsx` | il pannello e il suo posto vuoto |

## 15. Le librerie: src/lib

| File | Cosa fa |
| --- | --- |
| `supabase.ts` | il client che punta al centro collegato (`connectTo`), messaggi d'errore leggibili |
| `session.tsx` | sessione, profilo, impostazioni, flag delle schermate (sezione 5) |
| `license.ts`, `license-key.ts`, `license-gate.tsx` | licenze firmate e collegamento al centro |
| `plans.ts` | i tre piani e i loro limiti |
| `edition.ts` | quale app è: completa, solo proprietario (computer), solo pannello |
| `gestore.ts`, `gestore-admin.ts`, `gestore-demo.ts` | chiamate al gestore, al pannello e la demo del pannello |
| `billing.ts` | controlli di codice fiscale e partita IVA, dati del cliente e del centro |
| `types.ts` | i tipi delle righe del database (Profile, Dog, Booking, Settings...) |
| `owner.ts` | letture del proprietario (prenotazioni con cliente e cane, classi) |
| `slots.ts`, `format.ts`, `lesson-colors.ts` | mezz'ore libere, date e ore, colori delle lezioni |
| `transfer.ts`, `nexi.ts`, `epson-rt.ts` | bonifico, carta, registratore |
| `google.ts`, `images.ts`, `share.ts`, `phone.ts` | Google, immagini, condivisione e salvataggio, numeri di telefono |
| `i18n.ts`, `refresh.ts`, `sections.ts`, `theme.ts`, `trial.ts` | traduzioni, aggiornamenti periodici, menu laterale, colori, prova a tempo |

## 16. Le traduzioni

I testi sono scritti in italiano dentro `t('…')` (`src/lib/i18n.ts`); le parti variabili sono `{nome}`. Per le altre
lingue ogni frase italiana ha la sua traduzione in `src/locales/{en,de,es,fr}.ts`; se manca resta l'italiano. Le frasi
in costanti fuori dai componenti si segnano con `tKey`. `node tools/lingue.mjs` dice quali frasi mancano o non servono
più, e l'action **Traduzioni** lo controlla su ogni PR.

## 17. Windows, Mac, Android e le demo

- **Windows e Mac** (`desktop/`): Electron apre la versione web esportata (`npm run web` in `desktop`) dall'indirizzo
  `app://campo/`, con `EXPO_PUBLIC_SOLO_PROPRIETARIO=1`. `preload.js` passa all'app le poche cose che il browser non
  ha: l'invio dello scontrino al registratore Epson della rete (`printerPost`, che il browser bloccherebbe) e
  l'accesso con Google nel browser del computer (`googleLogin`, con il client desktop).
- **Android** (`mobile-demo/`): `build.mjs` prepara `www/` con l'app web; con `APP_VERA=1` è l'app vera collegata al
  database, senza dati finti. `android-build.sh` costruisce APK e AAB con Capacitor, controlla i requisiti di Google
  Play (API 36, build di rilascio, pagine da 16 KB) e usa l'icona di `ICONA` (per K9 Gestore
  `assets/images/icon-gestore.png`, lo sfondo blu). Per il pannello (`EXPO_PUBLIC_PANNELLO=1`) salta il link di invito.
- **Demo**: `desktop/demo/demo-backend.js` è un finto Supabase in memoria che risponde alle chiamate dell'app (anche
  il gestore finto, per provare la registrazione di un centro). `mobile-demo/index.html` ha il bottone **Demo** per
  cambiare persona e piano.
- **Pagine pubbliche**: `mobile-demo/privacy.html` e `cancella-account.html`, richieste dagli store.

## 18. Gli strumenti: tools

| Comando | Cosa fa |
| --- | --- |
| `node tools/licenza.mjs chiavi` / `chiavi-server` / `genera` / `verifica` | chiavi e licenze |
| `node tools/nuovo-centro.mjs …` | apre un centro a mano: progetto, migrazioni, email, licenza |
| `node tools/nuova-prova.mjs …` | il database di una prova a tempo |
| `node tools/prova-generale.mjs` | accende il gestore di prova (usata dall'action Prova generale): progetto, funzioni, segreti, SMTP con il modello del codice, Google |
| `node tools/setup-sql.mjs` | rigenera `supabase/setup.sql` e `migrazioni.ts` |
| `node tools/lingue.mjs` | controlla le traduzioni |

## 19. Le action di GitHub

Le action che costruiscono partono solo a mano (`workflow_dispatch`); App per Windows e App per Mac anche con un tag
`v*`. Su ogni PR girano solo **Traduzioni** (`lingue.yml`) e **Database in un file** (`setup-sql.yml`, controlla che
`setup.sql` sia rigenerato).

| File | Nome | Cosa costruisce |
| --- | --- | --- |
| `aggiorna-app.yml` | Aggiorna le app | rilancia le build e la prova generale dopo una PR unita |
| `android.yml`, `windows.yml`, `mac.yml` | App per Android / Windows / Mac | le app vere o le prove |
| `android-demo.yml` | Demo per Android | la demo per Android |
| `demo-web.yml` | Sito web (web app e demo) | la web app installabile (`/app/`) e la demo web, su GitHub Pages |
| `pannello.yml` | Pannello del gestore | K9 Gestore per Windows, Mac e Android |
| `prova-database.yml`, `prova-generale.yml` | Prova con database, Prova generale | le prove con Supabase vero |
| `pulizia-releases.yml` | Pulizia delle Releases | toglie le versioni vecchie |

## 20. Le prove e i controlli

```sh
npx tsc --noEmit                      # tipi
npx eslint src metro.config.js        # stile ed errori comuni
node tools/lingue.mjs                 # traduzioni
node tools/setup-sql.mjs              # setup.sql aggiornato
npx -y deno@2 test --allow-read gestore/supabase/functions/_shared/    # prove del gestore
npx -y deno@2 check supabase/functions/fatture-in-cloud/index.ts       # funzioni (una per volta)
```

Le prove del gestore controllano firma delle licenze, passi della preparazione con un Supabase finto, conto del mese,
riconoscimento dei bonifici e dati di fatturazione. Le migrazioni si provano su un Postgres locale eseguendole in
ordine su un database con dati vecchi.

## 21. Come aggiungere una funzione nuova

1. **Database**: una migrazione nuova `supabase/migrations/00NN_nome.sql` (mai cambiare quelle vecchie), poi
   `node tools/setup-sql.mjs`. Il gestore la porta da solo ai centri pronti.
2. **Tipi**: aggiorna `src/lib/types.ts`.
3. **Interfaccia**: la schermata in `src/app`, i pezzi riusati in `src/components`; i testi in italiano dentro `t()`.
4. **Traduzioni**: aggiungi le frasi in `src/locales/*.ts` e lancia `node tools/lingue.mjs`.
5. **Demo**: se la schermata legge dati nuovi, aggiorna `desktop/demo/demo-backend.js`.
6. **Controlli** della sezione 20, poi la PR. Dopo l'unione lancia **Aggiorna le app**.
