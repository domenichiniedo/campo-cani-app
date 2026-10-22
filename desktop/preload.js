// Quello che la pagina dell'app può chiedere al programma Windows.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('campoCaniDesktop', {
  printerPost: (url, body) => ipcRenderer.invoke('printer-post', url, body),
});
