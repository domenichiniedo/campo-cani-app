import { Platform } from 'react-native';

// Il programma per Windows e Mac è solo per il proprietario: niente iscrizione né schermate dei clienti.
// Lo attiva desktop/package.json ("npm run web") con EXPO_PUBLIC_SOLO_PROPRIETARIO=1.
export const ownerOnly = process.env.EXPO_PUBLIC_SOLO_PROPRIETARIO === '1';

// "Club Gestore": il tuo pannello per tutti i centri, al posto dell'app (workflow "Pannello del gestore").
export const panelOnly = process.env.EXPO_PUBLIC_PANNELLO === '1';

// App installata come app vera (Android e iPhone, anche dagli store): Google Play e App Store non vogliono che dentro
// l'app si paghi il piano di Club Gestore, che è un servizio digitale. Lì il proprietario vede piano e conti, e li
// paga dal programma per computer.
const capacitor = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
export const storeApp = Platform.OS !== 'web' || !!capacitor?.isNativePlatform?.();
