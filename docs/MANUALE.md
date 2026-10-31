# Manuale d'uso di K9 Manager

Questo manuale spiega l'app a chi la usa: clienti, trainer, proprietari dei centri e te che gestisci tutti i centri
(K9 Gestore). Le istruzioni tecniche per installare i database sono nel [README](../README.md) e in
[gestore/README.md](../gestore/README.md); qui ci sono i passi da fare nell'app e i collegamenti con i servizi esterni
(Fatture in Cloud, registratore e POS, Nexi, Stripe). Il codice è spiegato nel [manuale tecnico](MANUALE-TECNICO.md) e
i costi nello [studio dei costi](COSTI.md).

## Indice

1. [Le app e chi le usa](#1-le-app-e-chi-le-usa)
2. [Cliente: iscriversi passo passo](#2-cliente-iscriversi-passo-passo)
3. [Cliente: prenotare, pagare, disdire](#3-cliente-prenotare-pagare-disdire)
4. [Trainer](#4-trainer)
5. [Proprietario: registrare il centro passo passo](#5-proprietario-registrare-il-centro-passo-passo)
6. [Proprietario: il lavoro di ogni giorno](#6-proprietario-il-lavoro-di-ogni-giorno)
7. [Collegare Fatture in Cloud](#7-collegare-fatture-in-cloud)
8. [Scontrini, registratore e POS](#8-scontrini-registratore-e-pos)
9. [Pagamento con carta: Nexi](#9-pagamento-con-carta-nexi)
10. [Stripe](#10-stripe)
11. [Bonifico istantaneo e "Paga dalla tua banca"](#11-bonifico-istantaneo-e-paga-dalla-tua-banca)
12. [K9 Gestore: il tuo pannello](#12-k9-gestore-il-tuo-pannello)
13. [Le action di GitHub](#13-le-action-di-github)

---

## 1. Le app e chi le usa

| Chi | Che cosa usa | Dove si trova |
| --- | --- | --- |
| Cliente | l'app K9 Manager | Android (Play Store o APK), iPhone dal browser (Safari → Condividi → Aggiungi alla schermata Home) |
| Trainer | la stessa app, area trainer | come il cliente |
| Proprietario del centro | la stessa app, area proprietario; sul computer anche il programma per Windows e Mac (piano Pro) | app sul telefono, oppure Releases su GitHub per Windows e Mac |
| Tu (gestore di tutti i centri) | K9 Gestore | Releases → K9 Gestore: `K9Gestore-Windows.exe`, `K9Gestore-Mac.dmg`, `K9Gestore-Android.apk` |

L'app è una sola per tutti: chi entra decide che cosa vede. Il database riconosce il proprietario dalla sua email, il
trainer dall'email che il proprietario ha scritto nella scheda Trainer, e tutti gli altri sono clienti.

Ogni centro ha il suo database, separato da quelli degli altri centri. Per questo, al primo avvio, l'app chiede **a
quale centro collegarsi**:

- con il **codice del centro** (`K9-XXXXXX`), che il centro dà ai suoi clienti;
- oppure aprendo il **link di invito** o inquadrando il **QR code** del centro: l'app si apre già sul centro giusto.

Si possono avere più centri sullo stesso telefono: nella schermata di attivazione compaiono sotto **I tuoi centri**.

---

## 2. Cliente: iscriversi passo passo

### Prima di iniziare: collegarsi al centro

1. Il centro ti manda un link su WhatsApp, oppure trovi il QR code appeso al campo.
2. Sul telefono Android apri il link o inquadra il QR con la fotocamera: se l'app è installata si apre già sul centro;
   se non c'è, il link porta a scaricarla.
3. Se l'app chiede **Attiva l'app**, scrivi nel campo **Codice del centro** il codice `K9-XXXXXX` (è scritto anche al
   centro del QR code) e premi **Attiva**.

### Iscriversi con email e password

1. Nella schermata **Accedi** premi **Iscriviti** (in basso).
2. In alto lascia scelto **Sono un cliente**.
3. Compila il modulo corto. Sono obbligatori solo:
   - **Nome** e **Cognome**;
   - **Telefono** (il cellulare: il centro lo usa per contattarti e, se lo chiede, ti manda un SMS di conferma);
   - **Email**;
   - **Password** di almeno 8 caratteri;
   - **Nome del cane**.
4. Sotto il nome del cane ci sono alcuni dati facoltativi ma utili al centro:
   - **Maschio / Femmina** e **Sterilizzato / Non sterilizzato**: tocca la scelta giusta (toccala di nuovo per toglierla);
   - **Microchip (consigliato)**: le 15 cifre del libretto o del passaporto del cane. Se non le hai sotto mano lascialo
     vuoto e mettilo dopo dal Profilo. Se scrivi qualcosa, devono essere proprio 15 cifre (gli spazi non contano);
   - **Obiettivi e situazione attuale**: poche righe per spiegare al centro e ai trainer come sta il cane adesso e che
     cosa vuoi ottenere (per esempio "tira al guinzaglio e abbaia agli altri cani; vorrei il richiamo"). Massimo 500
     caratteri.
5. Scegli **chi sei**:
   - **Sono una persona**: ricevi sempre lo **scontrino**. Non serve nessun altro dato.
   - **Associazione o società**: puoi avere lo scontrino oppure la fattura. Se vuoi la fattura spunta **Voglio la
     fattura per le lezioni e i pacchetti** e compila: ragione sociale, codice fiscale, sede (via, CAP, comune,
     provincia). Partita IVA, codice SDI e PEC sono facoltativi ma, se li scrivi, vengono controllati. Senza la spunta
     ricevi lo scontrino; la fattura puoi chiederla anche dopo, dal Profilo.
6. Spunta **Ho letto e accetto il regolamento del campo e l'informativa privacy**. Toccando "il regolamento" e
   "l'informativa privacy" leggi i testi del centro.
7. Se vuoi, premi **Aggiungi altri dati (facoltativi)**: puoi mettere la tua foto, razza e data di nascita del cane
   (AAAA-MM-GG, per esempio 2024-03-15), **altri cani** con **+ Aggiungi un altro cane**, e il consenso a foto e video
   sui social del centro. Tutto si può aggiungere anche dopo dal Profilo.
8. Premi **Crea il mio account**.
9. **Conferma l'email**: ti arriva un'email con un codice. Scrivilo nell'app. Se hai sbagliato l'indirizzo premi
   **Ho sbagliato l'email: correggila**: torni al modulo con tutti i dati già scritti.
10. **Conferma il cellulare** (solo se il centro lo chiede): ti arriva un SMS con un codice, scrivilo nell'app.
11. Sei dentro: puoi prenotare.

Se l'app risponde con un errore, dice che cosa manca: per esempio "Inserisci nome, cognome e telefono", "Il microchip
ha 15 cifre: controllalo o lascialo vuoto" o "Il centro ha raggiunto il numero massimo di iscritti" (in quel caso
contatta il centro).

### Iscriversi con Google

1. Nella schermata di iscrizione (o di accesso) premi **Continua con Google** e scegli il tuo account.
   Il pulsante c'è solo se il centro ha acceso l'accesso con Google.
2. L'account nasce subito e l'email non va confermata: l'ha già verificata Google.
3. Si apre la schermata **Benvenuto!** con nome e cognome già presi da Google. Completa telefono, nome del cane (con
   sesso, sterilizzazione, microchip e obiettivi, come sopra), scegli persona o associazione/società, spunta il
   consenso e premi **Completa l'iscrizione**.
4. Se il centro lo chiede, conferma il cellulare con il codice SMS.

Chi era già iscritto con la stessa email entra nel suo account di sempre.

### Password dimenticata

Nella schermata **Accedi** premi **Password dimenticata?**, scrivi l'email, ricevi un codice, scrivilo con la password
nuova.

---

## 3. Cliente: prenotare, pagare, disdire

### Prenotare

Nella scheda **Prenota** scegli cane, lezione (e la sua opzione, per esempio IGP: Pista, Obbedienza o Attacco), campo
se ce n'è più di uno, giorno e ora. Vedi solo le mezz'ore aperte e libere. Se hai un pacchetto attivo per quella
lezione, la prenotazione scala una lezione dal pacchetto.

### Pagare

Quando prenoti scegli come pagare (le scelte dipendono da quello che il centro ha acceso):

- **Pago al campo**: paghi al centro (contanti o POS del centro). Il proprietario segna la lezione come pagata con
  **Incassa**.
- **Bonifico istantaneo**: dopo la conferma vedi IBAN, importo, causale e un QR da inquadrare con l'app della tua
  banca. Se il centro lo ha attivo, c'è anche **Paga dalla tua banca** (vedi il [punto 11](#11-bonifico-istantaneo-e-paga-dalla-tua-banca)).
- **Carta (Nexi)**: paghi con la carta sulla pagina sicura di Nexi (vedi il [punto 9](#9-pagamento-con-carta-nexi)).
  La lezione risulta pagata da sola.

### Disdire

In **Le mie lezioni** puoi disdire fino al limite di ore deciso dal centro (per esempio 24 ore prima). Una lezione
del pacchetto disdetta torna nel pacchetto; una pagata con carta viene rimborsata sulla carta.

### Entrare in campo e penalità

Il giorno della lezione il trainer o il proprietario fanno **entrare in campo** il cane (tasto **Ingresso**).
Se nessuno lo fa entrare, **un'ora dopo la fine della lezione** il cliente riceve da solo la penalità
**"Assenza senza disdetta"** (il centro può spegnere questa regola). Se è un errore, il proprietario la toglie dalla
scheda del cliente, e non torna più. Se il trainer fa entrare il cane in ritardo, la penalità sparisce da sola.

Alla penalità numero N (la decide il centro) il cane viene sospeso e non si può più prenotare per lui finché il
proprietario non lo riattiva.

### Profilo

Nel **Profilo** cambi foto, dati, persona o associazione/società e i dati per la fattura (premi **Salva**). Per ogni
cane vedi razza, sesso, sterilizzazione, data di nascita, microchip e la nota con gli obiettivi: premi **Cambia i
dettagli** (o **Aggiungi microchip e dettagli**) per cambiarli e poi **Salva**, oppure aggiungi un cane nuovo con
**Aggiungi**. Vedi anche le penalità ricevute, il regolamento e la privacy.

### Tessera e quota campo

Il centro può usare la tessera (per esempio quella associativa) e la quota campo (per esempio mensile). In cima al
**Profilo** vedi per ognuna fino a quando vale, il numero della tessera e lo storico dei pagamenti. Quando sta per
scadere (o è scaduta) premi **Rinnova** (la prima volta **Richiedi**) e paga al campo o con il bonifico istantaneo che
compare sotto. Vale appena il proprietario segna il pagamento; se rinnovi prima della scadenza, quella nuova parte dal
giorno dopo e non perdi giorni. Se il centro la chiede per prenotare, senza tessera o quota valida il giorno della
lezione l'app non ti fa prenotare.

### Bacheca ed eventi

Nella scheda **Bacheca** trovi le comunicazioni del centro e gli eventi (gare, serate, uscite). Gli avvisi importanti
compaiono anche in cima a **Prenota** finché non premi **Ho letto**. Per un evento premi **Partecipo** (o **Non
partecipo più**); se ha i posti contati vedi quanti ne restano. Non arrivano notifiche sul telefono: le comunicazioni
si vedono aprendo l'app.

### Campo libero

Se il centro lo offre, tra le lezioni c'è il **campo libero**: prenoti il campo per il tuo turno e lo paghi come una
lezione, ma senza trainer.

### Pacchetti, diario e voti

- **Pacchetti**: vedi quelli offerti e li richiedi; li paghi al campo e il proprietario li attiva.
- **Diario**: per ogni cane, cosa si è fatto a ogni lezione, i commenti del trainer e le schede di valutazione.
- Dopo una lezione puoi darle un voto da 1 a 5 stelle con un commento.

---

## 4. Trainer

1. Il proprietario, nella scheda **Trainer**, scrive la tua email.
2. Installa l'app, collegati al centro (codice o link), premi **Iscriviti** e scegli **Sono un trainer del centro**.
   Usa la stessa email che hai dato al centro. Servono solo nome, cognome, telefono, email, password e il consenso.
   Se avevi già un account, diventi trainer subito.
3. Nella scheda **Lezioni** vedi le tue lezioni del giorno, con cane (sesso, sterilizzazione e obiettivi del
   proprietario), cliente e telefono. Il giorno della lezione premi **Ingresso** per far entrare il cane: senza
   ingresso il cliente prende la penalità per assenza.
4. Dopo la lezione scrivi il **diario** (cosa si è fatto e i commenti) e, nei piani Professional e Pro, compili le
   **schede di valutazione**.
5. In **Disponibilità** segni le mezz'ore in cui puoi fare lezione.
6. Puoi dare una penalità al cane e toglierla se sbagli.

---

## 5. Proprietario: registrare il centro passo passo

Così un centro nuovo si registra da solo dall'app. Il server gestore gli prepara il database in pochi minuti.

1. Installa l'app. Alla prima apertura c'è **Attiva l'app**: sotto, in **Hai un centro cinofilo?**, premi **Registra
   il tuo centro**.
2. Scrivi il **Nome del centro** e l'**Email del titolare** (quella con cui entrerai come proprietario).
3. Scegli il **Piano** (Base, Professional o Pro): sotto vedi il prezzo. Poi **Come paghi**: **A consumo** (canone
   più una quota per prenotazione) o **Prezzo fisso**. Piano e modo di pagare si cambiano quando vuoi dalle
   Impostazioni.
4. **Chi apre il centro** (servono per la fattura del canone):
   - **Sono una persona**: nome e cognome, telefono e codice fiscale;
   - **Associazione o società**: ragione sociale, partita IVA o codice fiscale, sede completa, codice SDI o PEC, e
     telefono.
5. Scrivi l'**IBAN da cui paghi** (obbligatorio: il gestore riconosce i tuoi bonifici anche da qui) e, se ne hai uno,
   il **Codice bonus**.
6. Premi **Continua**. L'app mostra i passi della preparazione: *Creo il database del centro… Avvio il database…
   Preparo tabelle e permessi… Collego il database… Attivo la licenza…* Di solito bastano 3 o 4 minuti; puoi lasciare
   l'app aperta. Vedi già il **Codice del centro** (`K9-XXXXXX`).
7. Quando è pronto, l'app si apre sul tuo centro. **Iscriviti con l'email del titolare**: entri già come
   proprietario.
8. Vai in **Impostazioni** e prepara il centro (vedi sotto), poi in **Orari** apri i giorni e le mezz'ore prenotabili.

Se la preparazione non riesce, l'app lo dice con il codice del centro: contatta il gestore, che la riprova dal
pannello.

### Le Impostazioni, in ordine

- **Licenza**: scadenza, piano, numero di clienti, il **QR code per i clienti** e il link di attivazione (sotto).
- **Piano e abbonamento**: quanto paghi questo mese al gestore, con IBAN, causale e QR per il bonifico; cambio di
  piano e disdetta. In fondo lo **Storico dei pagamenti**: mese per mese quanto hai pagato, se è pagato e in che giorno
  il bonifico è arrivato (ultimi 24 mesi).
- **Centro e logo**, **Campi** (nome e indirizzo di ognuno), **Trainer**.
- **Orari e regole**: apertura e chiusura della griglia, ore per la disdetta, penalità che sospende il cane, e
  **Penalità automatica se il cane non entra in campo** (accesa all'inizio).
- **Metodi di pagamento**: bonifico istantaneo (il tuo IBAN) e carta con Nexi.
- **Lezioni** (con **Campo libero, senza trainer** per i turni sul campo senza trainer, che non compaiono tra le
  lezioni da assegnare), **Pacchetti**, **Tesseramento** e **Quota campo** (per ognuna: accesa o spenta, nome e
  importo; durata: anno solare, stagione sportiva dal 1 settembre al 31 agosto o un numero di mesi dal pagamento, per
  esempio 1 per la quota mensile; da quanti giorni prima della scadenza si rinnova; **Senza IVA** o **Con IVA**; se
  serve per prenotare), **Schede di valutazione**.
- **Fatture** (o **Fatture e scontrini**): vedi i punti [7](#7-collegare-fatture-in-cloud) e [8](#8-scontrini-registratore-e-pos).
- **Report mensile**, **Proprietari** (altri proprietari con la loro email), **Regolamento e privacy**.

### Il QR code da mandare su WhatsApp

In **Impostazioni → Licenza** c'è **QR code per i clienti**: un QR con il **codice del centro scritto nel mezzo**.

- **Scarica il QR code** salva l'immagine sul telefono o sul computer (sull'app Android finisce nei Documenti), da
  allegare poi su WhatsApp.
- **Condividi (WhatsApp, social...)** e **Manda su WhatsApp** la mandano subito: chi inquadra il QR o apre il link
  arriva già alla pagina del tuo centro.
- **Copia l'immagine** e **Copia il link** la mettono negli appunti.
- **Stampa il QR code** prepara un foglio con QR, nome del centro e codice da appendere al campo.
- **Manda il link di attivazione ai clienti** manda solo il link.

---

## 6. Proprietario: il lavoro di ogni giorno

- **Giorno**: le lezioni con cliente e telefono, il cane con sesso, sterilizzazione e obiettivi, il trainer. Tasti
  **Ingresso** (fa entrare il cane), **Incassa** (pagato al campo), penalità e annullo.
- **Settimana**: la griglia per campi; tocchi un'ora libera per prenotare per un cliente.
- **Orari**: apri e chiudi le mezz'ore di ogni campo e trainer.
- **Clienti**: per ognuno "Persona: scontrino" oppure i dati della società, i cani con il microchip, pacchetti,
  penalità (qui togli una penalità sbagliata), sospensione. La ricerca trova anche la ragione sociale e il codice
  fiscale.
- **Tessera e quota campo** (se le usi): in Clienti ogni cliente ha il segno con il nome della quota, per esempio
  **Tessera scaduta**, **Quota campo in scadenza**, **… mancante** o **… da incassare**, e il filtro **… da rinnovare**
  li mostra tutti. In cima c'è chi le ha chieste dall'app. Nella scheda del cliente scegli **Contanti**, **Carta** o
  **Bonifico**, scrivi se vuoi il numero della tessera e premi **Incassata** (o **Rinnovo incassato**): vale da oggi, o
  dal giorno dopo la scadenza di quella in corso. Lì sotto c'è lo storico di tutti i pagamenti, con il tasto
  **Annulla** per uno registrato per sbaglio. **Senza IVA** (quota associativa fuori campo IVA) non parte nessun
  documento; **Con IVA** all'incasso parte la fattura o lo scontrino, come per i pacchetti.
- **Bacheca**: **+ Nuovo avviso** (con **Importante** resta in cima a Prenota finché il cliente non lo legge; puoi dire
  fino a quando si vede) e **+ Nuovo evento** (giorno, ora, luogo e posti, vuoto = senza limite). Per ogni avviso vedi
  quanti clienti l'hanno letto, per ogni evento chi partecipa. **Modifica** ed **Elimina** sotto ognuno.
- **Spese**: segni le uscite del centro (affitto, utenze, attrezzatura, manutenzione, compensi trainer,
  assicurazione, tasse, pubblicità o altro) con giorno, importo e come hai pagato; vedi il totale del mese e per
  categoria.
- **Incassi** e **Statistiche** (secondo il piano): l'incassato comprende anche tessere e quote; **Uscite** sono le
  spese del periodo e **Saldo** è l'incassato meno le uscite.

---

## 7. Collegare Fatture in Cloud

Serve il piano **Pro** del centro. Le fatture partono da sole per i **pagamenti online** dei clienti che le hanno
chieste (associazioni e società con i dati completi). La fattura riporta ragione sociale, partita IVA o codice
fiscale, codice SDI e PEC del cliente.

Si fa **una volta sola** per centro, dal computer:

1. Crea un account su [Fatture in Cloud](https://www.fattureincloud.it) con un piano che comprenda la fatturazione
   elettronica (vedi i prezzi nello [studio dei costi](COSTI.md)).
2. Nell'area sviluppatori di Fatture in Cloud crea un'**applicazione** con **autenticazione manuale** e genera un
   **token** con i permessi su anagrafiche, documenti emessi e fatturazione elettronica.
3. Installa la [Supabase CLI](https://supabase.com/docs/guides/cli) e, nella cartella del progetto:
   ```sh
   supabase login
   supabase link --project-ref IL_PROJECT_REF_DEL_CENTRO
   supabase secrets set FIC_ACCESS_TOKEN=il_token WEBHOOK_SECRET=una_parola_lunga_a_caso
   supabase functions deploy fatture-in-cloud
   ```
4. Su supabase.com, nel progetto del centro, apri **Database → Webhooks** e crea un webhook sulla tabella `invoices`,
   evento **Insert**, tipo **Supabase Edge Functions**, funzione `fatture-in-cloud`, con l'intestazione
   `x-webhook-secret` uguale alla `WEBHOOK_SECRET`.
5. Nell'app, **Impostazioni → Fatture**: accendi **Prepara fattura o scontrino per i pagamenti online**, scegli il
   regime (**Ordinario (con IVA)** con l'aliquota inclusa nei prezzi, oppure **Forfettario (senza IVA)**), premi
   **Salva** e poi **Invia ora**.
6. All'inizio è **in prova**: le fatture si creano su Fatture in Cloud ma non vanno allo SDI. Controlla le prime;
   quando sono giuste attiva l'invio vero:
   ```sh
   supabase secrets set FIC_SEND_TO_SDI=si
   ```

Se il token vede più aziende aggiungi `FIC_COMPANY_ID`; se l'aliquota non si trova da sola `FIC_VAT_ID`; per
registrare l'incasso su un conto preciso `FIC_PAYMENT_ACCOUNT_ID`. Una fattura con un errore resta nell'elenco con il
motivo e il tasto **Riprova**.

---

## 8. Scontrini, registratore e POS

Le persone ricevono sempre lo scontrino; le società che non chiedono la fattura anche. In **Impostazioni → Fatture**
scegli come emetterlo:

### Lo batto io (qualsiasi registratore)

Lo scontrino compare come **Da emettere**. Lo batti sul registratore telematico del campo, poi nell'app scrivi il
**N. documento** e premi **Battuto**. Il numero finisce nel report mensile. Non serve collegare niente.

### Registratore al campo (Wi-Fi, Epson RT)

Il telefono o il PC del campo stampa lo scontrino direttamente sul registratore e salva il numero da solo
(piano Pro).

1. Serve un registratore **Epson RT** che accetti **ePOS-Print XML** (per esempio FP-81 II RT o FP-90 III RT),
   collegato alla rete Wi-Fi del campo.
2. Trova l'indirizzo del registratore (lo stampa il registratore nelle impostazioni di rete, per esempio
   `192.168.1.50`) e scrivilo in **Indirizzo del registratore**.
3. Il telefono o il PC devono stare sulla **stessa rete Wi-Fi**. Serve l'app installata o il programma per Windows e
   Mac: dalla demo nel browser non funziona.
4. Su ogni scontrino premi **Stampa sul registratore**.

### Registratore in cloud (Openapi)

Lo scontrino va all'Agenzia delle Entrate anche quando non sei al campo (piano Pro).

1. Su [Openapi](https://openapi.com/products/electronic-receipt-italy) configura la partita IVA per gli scontrini, con
   le credenziali Fisconline della persona incaricata alla trasmissione. Openapi indica il servizio solo per le
   società.
2. Genera un token con il permesso `POST:invoice.openapi.com/IT-receipts` (e la lettura dello stesso indirizzo).
3. Dalla cartella del progetto:
   ```sh
   supabase secrets set OPENAPI_TOKEN=il_token OPENAPI_FISCAL_ID=la_tua_partita_iva
   supabase functions deploy scontrini-openapi
   ```
4. Crea un secondo webhook come quello delle fatture (punto 7.4) per la funzione `scontrini-openapi`.
5. All'inizio usa l'ambiente di prova di Openapi; quando è tutto a posto:
   `supabase secrets set OPENAPI_LIVE=si`.

Openapi lavora in differita: lo scontrino diventa **Emesso** con il suo numero quando la trasmissione è fatta (premi
**Invia ora** per controllare). Openapi ha annunciato un nuovo servizio scontrini che sostituirà questo: prima di
attivarlo chiedi a loro quale usare.

### Il POS per le carte al campo

L'app **non si collega al POS** delle carte (Nexi SmartPOS, Mobile POS o quello della tua banca): il POS resta
separato. Il cliente sceglie **Pago al campo**, paga con il POS e tu premi **Incassa** sulla lezione. Lo scontrino lo
batti come al solito sul registratore (molti SmartPOS hanno anche il registratore telematico dentro). Per incassare le
carte **dall'app**, senza POS, c'è Nexi XPay (punto 9).

---

## 9. Pagamento con carta: Nexi

Con Nexi XPay il cliente paga la lezione con la carta, sulla pagina sicura di Nexi, e la lezione risulta pagata da sola.
I dati della carta non passano mai dall'app né dal database.

**Oggi funziona solo in prova**: la funzione parla con l'ambiente di prova di Nexi e non addebita niente.

1. Dalla cartella del progetto, collegata al progetto del centro (come al punto 7.3):
   ```sh
   supabase functions deploy nexi --no-verify-jwt
   ```
2. Senza altro usa la chiave pubblica di prova di Nexi. Con un tuo account di prova Nexi metti la tua:
   ```sh
   supabase secrets set NEXI_API_KEY=la_chiave_di_prova
   ```
3. Nell'app, **Impostazioni → Metodi di pagamento → Carta con Nexi**: accendila. Compare l'avviso della modalità di
   prova.
4. Il cliente, quando prenota, sceglie **Carta (Nexi)**. Per provare usa le carte di prova di Nexi, per esempio
   VISA `4999 3402 6197 7289`, scadenza `12/30`, CVV `663`.
5. Se la lezione pagata viene disdetta, il rimborso torna sulla carta da solo.

**Per incassare davvero** serve un contratto Nexi XPay del centro (per esempio XPay Link, Easy o Pro: vedi i costi in
[COSTI.md](COSTI.md)) e una piccola modifica alla funzione `nexi` per passare dall'ambiente di prova a quello vero.
Chiedila quando il centro ha il contratto.

---

## 10. Stripe

**Stripe oggi non è usato.** All'inizio il gestore prendeva i pagamenti dei centri con Stripe; è stato tolto e
sostituito:

- i **centri pagano il gestore** con un **bonifico istantaneo** (il gestore legge i bonifici con Enable Banking, in
  sola lettura);
- i **clienti pagano il centro** al campo, con bonifico istantaneo o con la carta tramite **Nexi**.

Se avevi già acceso il gestore con Stripe: togli il webhook di Stripe e cancella le funzioni `stripe-webhook` e
`stripe-collega` (vedi gestore/README.md, passo 6). Non serve nessun account Stripe.

Se un giorno vuoi Stripe al posto di Nexi per le carte dei clienti, andrebbe scritta una funzione nuova come `nexi`.
Il confronto dei costi è in [COSTI.md](COSTI.md): per lezioni da poche decine di euro Stripe costa più o meno come
Nexi, senza canone.

---

## 11. Bonifico istantaneo e "Paga dalla tua banca"

1. In **Impostazioni → Metodi di pagamento** il proprietario scrive il suo IBAN e l'intestatario e accende il
   bonifico istantaneo.
2. Il cliente sceglie **Bonifico istantaneo**: vede IBAN, importo, causale e il QR da inquadrare con l'app della banca.
   Il proprietario, visto l'accredito, segna la lezione pagata.
3. Se il gestore ha acceso **Paga dalla tua banca** (`PAGA_ORA=1`, gestore/README.md passo 5), il cliente sceglie la
   sua banca, scrive il suo IBAN e conferma il bonifico già compilato: appena parte, la lezione risulta pagata da sola.
   I soldi vanno dal cliente al centro; il gestore non li tocca.

---

## 12. K9 Gestore: il tuo pannello

### Installare

Releases → **K9 Gestore** (lo crea l'action **Pannello del gestore**):

- **Windows**: `K9Gestore-Windows.exe`. Al primo avvio SmartScreen dice "Windows ha protetto il PC": **Ulteriori
  informazioni → Esegui comunque**.
- **Mac**: `K9Gestore-Mac.dmg`, trascina in Applicazioni, la prima volta **clic destro → Apri**.
- **Android**: `K9Gestore-Android.apk`. Scaricalo dal telefono e aprilo; se Android lo chiede, permetti
  l'installazione da questa fonte. L'icona è quella di K9 Manager con lo sfondo blu.

### Entrare

- Con **email e password** del tuo utente del gestore (con la prova generale le trovi nel riepilogo dell'esecuzione:
  Actions → Prova generale → l'esecuzione → Summary).
- Con **Continua con Google**, se l'hai acceso nel progetto del gestore (gestore/README.md passo 8). Entra chiunque
  abbia Google, ma il pannello risponde solo alle email in `AMMINISTRATORI`.
- **Password dimenticata?**: scrivi l'email, ricevi un codice, scrivilo con la password nuova ed entri. Non serve
  rilanciare nessuna action. Serve che il progetto del gestore mandi le email (SMTP: la prova generale lo prepara con i
  secret `SMTP_USER` e `SMTP_PASS`).
- **Il tuo accesso** (icona ⚿): da dentro il pannello cambi la password.

### Le sezioni

- **Centri**: tutti i centri, chi deve pagare, modifica del piano e dei prezzi di un centro, rinnovo a mano,
  sospensione, cambio della password di chi entra in un centro, "Riprova la preparazione". Aprendo un centro vedi lo
  **Storico dei pagamenti** degli ultimi 12 mesi: per ogni mese l'importo, se è pagato e il giorno del bonifico, o
  da quando è scaduto.
- **Database**: stato e spazio usato dei database dei centri.
- **Statistiche**: addebitato, incassato, prenotazioni, centri nuovi.
- **Banca e bonifici**: il tuo IBAN, il collegamento al conto (Enable Banking) e i bonifici da abbinare.
- **Piani e addebiti**: prezzi dei piani, **Addebita adesso**, **Segna pagato**.
- **Bonus**: crediti ai centri e codici bonus per la registrazione.
- **App e versioni**: le app da scaricare e i pulsanti per rifarle (serve `GITHUB_TOKEN`).
- **Il tuo accesso**: email e password.

---

## 13. Le action di GitHub

Le action che costruiscono le app **partono solo quando le lanci tu**: GitHub → **Actions** → scegli l'action →
**Run workflow**. Un commit o una PR non le fa partire. Restano automatici solo due controlli veloci sulle PR
(**Traduzioni** e **Database in un file**) e, per Windows e Mac, la creazione di un tag `v1.0.0`.

| Action | Quando lanciarla |
| --- | --- |
| Aggiorna le app | dopo aver unito una PR: rifà le app e aggiorna la prova generale |
| App per Android, App per Windows, App per Mac | per avere una versione nuova di una sola app |
| Demo per Android | per aggiornare la demo per Android |
| Sito web (web app e demo) | per pubblicare la web app e la demo web dopo una modifica |
| Pannello del gestore | per avere K9 Gestore nuovo (Windows, Mac, Android) |
| Prova con database | per una prova di qualche giorno per un centro |
| Prova generale | per provare tutto il giro con il gestore di prova |
| Pulizia delle Releases | per togliere le versioni vecchie |
