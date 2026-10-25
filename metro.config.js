// Configurazione di Metro: quella di Expo, più una cosa sola. Il pannello del gestore (K9 Gestore, quasi 100 KB di
// codice) serve solo nella build del pannello (EXPO_PUBLIC_PANNELLO=1): nelle app dei centri al suo posto c'è un
// pezzo vuoto, così l'app è più leggera e parte prima.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (process.env.EXPO_PUBLIC_PANNELLO !== '1') {
  const vuoto = path.join(__dirname, 'src/components/gestore-panel-assente.tsx');
  const resolve = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, name, platform) => {
    if (name === '@/components/gestore-panel') return { type: 'sourceFile', filePath: vuoto };
    return (resolve ?? context.resolveRequest)(context, name, platform);
  };
}

module.exports = config;
