# Studio dei costi totali di Club Manager

Quanto costa far girare Club Manager: a te come gestore di tutti i centri, e a ogni centro che usa l'app. In fondo ci
sono gli esempi con i conti fatti e le fonti.

**Come leggere i numeri**

- I prezzi sono quelli pubblicati sui siti dei servizi il **25 ottobre 2026** (le fonti sono in fondo). Cambiano: prima
  di firmare qualcosa ricontrollali.
- Sono **senza IVA**, salvo dove è scritto il contrario.
- Supabase, Twilio, Apple e Google Play hanno i prezzi in **dollari**. Per i conti uso **1 $ ≈ 0,90 €**: è
  un'ipotesi mia, controlla il cambio del giorno.
- Per Nexi le due fonti che ho letto **non sono d'accordo** fra loro (vedi il punto 2.2): riporto tutte e due e fai
  fede il contratto che ti propone Nexi.
- Per Enable Banking il sito **non pubblica prezzi**.

---

## 1. I costi del gestore (tu)

### 1.1 Supabase: il costo che cresce con i centri

Ogni centro ha il suo progetto Supabase, più uno per il gestore.

| Piano | Prezzo | Cosa comprende | Va bene per |
| --- | --- | --- | --- |
| Free | 0 $ | al massimo **2 progetti attivi**; un progetto fermo da una settimana va in pausa; 500 MB di database per progetto, 50.000 utenti attivi al mese, 5 GB di traffico, 1 GB di file | prove (la prova generale usa questi due posti: gestore + un centro) |
| Pro | **da 25 $ al mese** | il primo progetto compreso (i 10 $ di crediti coprono un'istanza Micro); progetti in più **da 10 $ al mese** ciascuno (Micro); non va mai in pausa; 8 GB di disco per progetto, 100.000 utenti attivi al mese, 250 GB di traffico, 100 GB di file | i centri veri |

Oltre i limiti del Pro: 0,00325 $ per utente attivo in più, 0,125 $ per GB di disco in più, 0,09 $ per GB di traffico in
più. Un centro cinofilo è piccolo (qualche centinaio di clienti, foto e loghi): non si arriva a questi limiti.

**Costo Supabase con N centri: 25 $ + 10 $ × N al mese** (il gestore sta nel primo progetto compreso).

| Centri | Al mese | In euro (circa) |
| --- | --- | --- |
| 1 | 35 $ | 31,50 € |
| 10 | 125 $ | 112,50 € |
| 25 | 275 $ | 247,50 € |
| 50 | 525 $ | 472,50 € |

### 1.2 SMS di conferma del cellulare (Twilio)

Ogni cliente nuovo riceve un SMS con il codice. Un SMS verso un cellulare italiano costa **0,0927 $** (circa 0,083 €),
più eventuali costi dell'operatore. Con 15 clienti nuovi al mese per centro: circa **1,25 € al mese per centro**.

### 1.3 Email

- Codici di conferma e password dimenticata: con Gmail e una password per le app è gratis (Gmail ha un limite
  giornaliero di invii; con tanti centri conviene un servizio SMTP vero).
- Report mensile: Resend è gratis fino a 3.000 email al mese.

### 1.4 Banca: Enable Banking

- **Lettura dei bonifici sul tuo conto** (i pagamenti dei centri): l'applicazione in modalità Production
  "restricted", che legge solo i conti che colleghi tu, si usa senza contratto. Il sito non indica un prezzo per
  questo uso.
- **"Paga ora" e "Paga dalla tua banca"** (`PAGA_ORA=1`): per disporre pagamenti in produzione serve un contratto. Il
  prezzo dipende dal volume (conti letti e pagamenti al mese) e c'è un **minimo mensile**: va chiesto a
  info@enablebanking.com. Finché non c'è il contratto, centri e clienti pagano con il bonifico e il QR, gratis.

### 1.5 Store e costi una tantum

| Voce | Prezzo | Quando serve |
| --- | --- | --- |
| Google Play | **25 $ una volta sola** | per pubblicare l'app Android sul Play Store |
| Apple Developer Program | **99 $ all'anno** (circa 7,40 € al mese) | per l'App Store e per firmare il programma per Mac |
| Certificato di firma per Windows | non calcolato | per togliere l'avviso di SmartScreen |
| GitHub (Actions su repository privato) | non calcolato | le action ora partono solo a mano, quindi consumano poco |

### 1.6 Totale del gestore al mese

| Centri | Supabase | SMS (15 clienti nuovi per centro) | Apple (diviso per 12) | **Totale** |
| --- | --- | --- | --- | --- |
| 1 | 31,50 € | 1,25 € | 7,40 € | **circa 40 €** |
| 10 | 112,50 € | 12,50 € | 7,40 € | **circa 132 €** |
| 25 | 247,50 € | 31,30 € | 7,40 € | **circa 286 €** |
| 50 | 472,50 € | 62,60 € | 7,40 € | **circa 543 €** |

In pratica **ogni centro ti costa circa 10,25 € al mese** (9 € di Supabase e 1,25 € di SMS), più una parte fissa di
circa 30 € al mese.

---

## 2. I costi di un centro

### 2.1 Il canone che il centro paga a te

I prezzi di partenza del gestore (si cambiano dal pannello, sezione Piani e addebiti):

| Piano | A consumo | Prezzo fisso | Da quante prenotazioni al mese conviene il fisso al centro |
| --- | --- | --- | --- |
| Base | 5,90 € + 1,00 € a prenotazione | 39 € | da 34 |
| Professional | 29,99 € + 0,60 € a prenotazione | 79 € | da 82 |
| Pro | 80,00 € + 0,30 € a prenotazione | 149 € | da 231 |

A consumo si aggiunge l'**1%** del prezzo di ogni pacchetto attivato.

**Attenzione al margine:** un centro Base a consumo con meno di 5 prenotazioni al mese ti paga meno di quanto ti costa
(5,90 € + 1 € × 4 = 9,90 €, contro circa 10,25 €). Con il prezzo fisso, invece, guadagni sempre.

### 2.2 Carte dei clienti dall'app: Nexi XPay

Oggi la carta con Nexi è solo in prova. Per incassare davvero il centro firma un contratto XPay. Le due fonti dicono
cose diverse:

| Offerta | Fonte | Attivazione | Canone al mese | Commissione (carte europee dei privati) |
| --- | --- | --- | --- | --- |
| XPay Link | finanzadigitale.com | 0 € | 0 € | 1,35% + 0,40 € |
| XPay Easy | finanzadigitale.com | 0 € | 5,90 € (nel testo: senza canone) | 1,20% + 0,25–0,35 € |
| XPay Pro | finanzadigitale.com | 0 € | 14,90 € | 1,25% + 0,29 € |
| XPay Easy | punto-informatico.it | — | 14,90 € | 2,4% + 0,29 € |
| XPay Pro | punto-informatico.it | — | 24,90 € | 1,90% + 0,24 € |

Le promozioni con canone 0 € che le due pagine citano sono **finite il 30 settembre 2026**.

### 2.3 Per confronto: Stripe (oggi non usato)

Nessun canone. Carte europee standard **1,5% + 0,25 €**, carte europee premium 2,8% + 0,25 €, carte extra-europee
3,15% + 0,25 € (più 2% se c'è il cambio). Contestazione di un pagamento: 20 €.

### 2.4 POS per le carte al campo (fuori dall'app)

L'app non si collega al POS: il centro usa il suo. Alcune offerte di Nexi (fonte punto-informatico.it, con cifre non
sempre coerenti nella stessa pagina):

| POS | Costo | Commissioni |
| --- | --- | --- |
| Nexi Mobile POS | 29 € IVA inclusa, una volta, senza canone | 1,89% |
| Nexi SmartPOS Mini | 129–169 € una volta, senza canone | 1,89–2,39% |
| Nexi SmartPOS | 24–29 € al mese + 79 € di attivazione | 0,99–1,99% secondo il piano |
| Nexi SmartPOS Mini con stampante | 17,50 € al mese + 79 € di attivazione | 1,2% |

### 2.5 Bonifico istantaneo

Per il centro **non costa niente** oltre al suo conto in banca. Per il cliente dipende dalla sua banca: con il
regolamento europeo sui bonifici istantanei non può costare più di un bonifico normale.

### 2.6 Fatture: Fatture in Cloud

Prezzi annuali (il sito li mostra al mese, ma si pagano per l'anno), più 1 € + IVA di spese per ogni pagamento annuale
con carta o PayPal (2,50 € con bonifico):

| Piano | Al mese | All'anno | Documenti all'anno |
| --- | --- | --- | --- |
| Forfettari | 4 € il primo anno, poi 8 € | 48 € il primo anno, poi 96 € | 100 |
| Standard | 12 € | 144 € | 100 |
| Premium | 21 € | 252 € | 400 |
| Premium Plus | 29 € | 348 € | 800 |
| Complete | 51 € | 612 € | 3.000 |

Tutti comprendono la fatturazione elettronica (PA, B2B e B2C). La prova gratuita no. L'app usa le **API** di Fatture
in Cloud: la pagina dei prezzi le elenca, ma non sono riuscito a leggere in quali piani sono comprese. Chiedilo a
loro prima di scegliere il piano.

Con Club Manager le fatture sono solo per le associazioni e società che le chiedono: di solito bastano Standard o
Premium.

### 2.7 Scontrini

| Modo | Costo |
| --- | --- |
| Lo batto io | 0 € (il centro ha già il suo registratore telematico) |
| Registratore Epson RT al campo | il prezzo del registratore (non calcolato); nessun costo per scontrino |
| Registratore in cloud (Openapi) | **0,019 €** a scontrino; con abbonamento annuale da 0,017 € (5.000 l'anno) a 0,009 € (1.000.000 l'anno); nessun costo di attivazione |

Openapi annuncia un servizio nuovo che sostituirà questo **da gennaio**, **da 0,0034 €** a scontrino.

---

## 3. Esempi con i conti fatti

### 3.1 Un centro Pro, in un mese

Le ipotesi sono mie: 300 prenotazioni, lezione da 25 €, 100 pagate con la carta dall'app, 50 con bonifico, 150 al
campo; 10 fatture a società e 290 scontrini.

| Voce | A consumo | Note |
| --- | --- | --- |
| Canone al gestore | 170,00 € | 80 € + 0,30 € × 300; con il fisso sarebbe 149 € |
| Nexi sulle 100 carte (2.500 €) | 73,75–103,90 € | da XPay Link (33,75 € + 40 €) a XPay Easy secondo punto-informatico (14,90 € + 60 € + 29 €) |
| *Stripe, per confronto* | *62,50 €* | *37,50 € + 25 €* |
| Bonifici | 0 € | |
| Fatture in Cloud | 21,00 € | 120 fatture l'anno: serve Premium (Standard ne ha 100) |
| Scontrini con Openapi | 5,51 € | 290 × 0,019 €; con "Lo batto io" 0 € |
| **Totale** | **circa 270–300 € al mese** | più il POS al campo, se lo usa |

### 3.2 Il tuo conto con 10 centri

Ipotesi: 4 centri Base con 80 prenotazioni al mese, 4 Professional con 150, 2 Pro con 300.

| | Tutti a consumo | Tutti a prezzo fisso |
| --- | --- | --- |
| Base (4 centri) | 4 × 85,90 € = 343,60 € | 4 × 39 € = 156 € |
| Professional (4 centri) | 4 × 119,99 € = 479,96 € | 4 × 79 € = 316 € |
| Pro (2 centri) | 2 × 170,00 € = 340,00 € | 2 × 149 € = 298 € |
| **Incassi al mese** | **1.163,56 €** | **770,00 €** |
| Costi (punto 1.6) | circa 132 € | circa 132 € |
| **Ti resta al mese** | **circa 1.030 €** | **circa 640 €** |

A questi si aggiunge l'1% dei pacchetti (solo a consumo). Tasse e contributi non sono calcolati.

### 3.3 Che cosa pesa di più

1. **Supabase**: circa 9 € al mese per ogni centro. È il costo principale e cresce con i centri.
2. **Le carte dei clienti** (Nexi o Stripe): le paga il centro, dal 2,5% al 4% circa di una lezione da 25 €. Il
   bonifico istantaneo è gratis: conviene spingerlo.
3. **Fatture in Cloud**: 12–21 € al mese per centro, solo per chi fattura alle società.
4. Gli SMS sono pochi centesimi per cliente nuovo.

---

## Fonti (lette il 25 ottobre 2026)

- Supabase: <https://supabase.com/pricing>
- Fatture in Cloud: <https://www.fattureincloud.it/costo/>
- Nexi XPay: <https://www.finanzadigitale.com/recensioni/nexi-xpay/> e <https://www.punto-informatico.it/nexi-pos-recensione/>
  (la pagina di Nexi non si è aperta)
- Stripe Italia: <https://stripe.com/it/pricing>
- Twilio SMS Italia: <https://www.twilio.com/en-us/sms/pricing/it>
- Openapi scontrino elettronico: <https://openapi.com/products/electronic-receipt-italy>
- Enable Banking: <https://enablebanking.com/docs/faq> (nessun prezzo pubblico)
- Apple Developer Program: <https://developer.apple.com/programs/>
- Google Play: <https://support.google.com/googleplay/android-developer/answer/6112435>
- Prezzi dei piani del gestore: `gestore/supabase/migrations/0004_prezzi.sql` e `0006_fisso_pacchetti.sql`
