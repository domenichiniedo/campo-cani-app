// Quello che la pagina dell'app può chiedere al programma Windows.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('campoCaniDesktop', {
  printerPost: (url, body) => ipcRenderer.invoke('printer-post', url, body),
  // Accesso con Google nel browser del computer: torna { idToken, accessToken }, o null se annullato.
  googleLogin: (o) => ipcRenderer.invoke('google-login', o),
});
