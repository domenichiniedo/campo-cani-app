// Configurazione di Expo: è app.json, con una variante per il programma Windows (cartella desktop/).
// Con CAMPO_CANI_DESKTOP=1 la versione web diventa una pagina sola con tutto il codice dentro,
// che il programma Windows apre senza bisogno di un server.
module.exports = ({ config }) => {
  if (!process.env.CAMPO_CANI_DESKTOP) return config;
  return {
    ...config,
    web: { ...config.web, output: 'single' },
    plugins: config.plugins.map((p) =>
      p === 'expo-router' ? ['expo-router', { asyncRoutes: false }] : Array.isArray(p) && p[0] === 'expo-router' ? ['expo-router', { ...p[1], asyncRoutes: false }] : p,
    ),
  };
};
