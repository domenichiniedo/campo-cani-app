// Il programma per Windows e Mac è solo per il proprietario: niente iscrizione né schermate dei clienti.
// Lo attiva desktop/package.json ("npm run web") con EXPO_PUBLIC_SOLO_PROPRIETARIO=1.
export const ownerOnly = process.env.EXPO_PUBLIC_SOLO_PROPRIETARIO === '1';

// "K9 Gestore": il tuo pannello per tutti i centri, al posto dell'app (workflow "Pannello del gestore").
export const panelOnly = process.env.EXPO_PUBLIC_PANNELLO === '1';
