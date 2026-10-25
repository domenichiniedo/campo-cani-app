// Chiave pubblica delle licenze. Generala con "node tools/licenza.mjs chiavi" e incollala qui.
// Vuota: l'app non chiede la licenza (va bene per la copia del tuo campo).
export const LICENSE_PUBLIC_KEY = '';

// Chiave pubblica del server gestore, che firma da solo le licenze dei centri che si registrano dall'app.
// Generala con "node tools/licenza.mjs chiavi-server" e incollala al posto di ''. Nelle build della prova generale
// (Actions → Prova generale) arriva da sola, in EXPO_PUBLIC_LICENSE_SERVER_KEY. Vuota: valgono solo le licenze firmate da te.
export const LICENSE_SERVER_KEY = process.env.EXPO_PUBLIC_LICENSE_SERVER_KEY || '';
