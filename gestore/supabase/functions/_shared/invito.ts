// Il link (e il QR code) che un centro dà ai suoi clienti: .../functions/v1/invito?codice=K9-XXXXXX.
// Solo calcoli, senza database: le prove sono in gestore_test.ts.

/** L'app su Google Play: con il codice nel referrer, per quando l'app lo saprà leggere già all'installazione. */
export const linkPlay = (pacchetto: string, codice: string) =>
  `https://play.google.com/store/apps/details?id=${pacchetto}&referrer=${encodeURIComponent(`codice=${codice}`)}`;

/**
 * Su Android, Chrome apre l'app installata già sul centro (campocaniapp://attiva?codice=...); se l'app non c'è va
 * all'indirizzo di riserva, cioè a scaricarla.
 */
export const intentAndroid = (pacchetto: string, codice: string, riserva: string) =>
  `intent://attiva?codice=${encodeURIComponent(codice)}#Intent;scheme=campocaniapp;package=${pacchetto};S.browser_fallback_url=${encodeURIComponent(riserva)};end`;

export const daAndroid = (userAgent: string) => /Android/i.test(userAgent);
