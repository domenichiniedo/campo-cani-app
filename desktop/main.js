// K9 Manager per Windows e Mac: apre la versione web dell'app in una finestra, senza browser.
// I file dell'app stanno in web/ (creati da "npm run web") e si servono dall'indirizzo app://campo/.
const { app, BrowserWindow, ipcMain, net, protocol, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const WEB = path.join(app.isPackaged ? process.resourcesPath : __dirname, 'web');
const HOME = 'app://campo/';
const SCHEME = 'campocaniapp';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

let win = null;

/** Link di attivazione (campocaniapp://attiva?codice=...) passato a Windows all'avvio. */
const linkIn = (argv) => argv.find((a) => a.startsWith(`${SCHEME}://`));
const pageFor = (link) => (link ? `${HOME}attiva${new URL(link).search}` : HOME);

/** Il registratore sta nella rete del campo: accettiamo solo indirizzi locali. */
function isLocal(url) {
  try {
    const { protocol: p, hostname: h } = new URL(url);
    if (p !== 'http:' && p !== 'https:') return false;
    return (
      /^(127\.|10\.|192\.168\.)/.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
      h === 'localhost' ||
      h.endsWith('.local')
    );
  } catch {
    return false;
  }
}

function createWindow(link) {
  win = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 380,
    minHeight: 560,
    title: 'K9 Manager',
    backgroundColor: '#123a2b',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  // I link esterni (Stripe, documentazione) si aprono nel browser, non nella finestra dell'app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(HOME)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  win.loadURL(pageFor(link));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAsDefaultProtocolClient(SCHEME);

  // Su Mac il link di attivazione arriva qui, anche quando apre il programma.
  let macLink = null;
  app.on('open-url', (e, url) => {
    e.preventDefault();
    if (!win) return (macLink = url);
    win.loadURL(pageFor(url));
    win.focus();
  });

  app.on('second-instance', (_e, argv) => {
    if (!win) return;
    const link = linkIn(argv);
    if (link) win.loadURL(pageFor(link));
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    protocol.handle('app', (req) => {
      const { pathname } = new URL(req.url);
      let file = path.normalize(path.join(WEB, decodeURIComponent(pathname)));
      // Ogni indirizzo che non è un file (/, /impostazioni, ...) apre l'app, che pensa al resto.
      if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(WEB, 'index.html');
      return net.fetch(pathToFileURL(file).toString());
    });

    // Stampa sul registratore telematico: la chiamata parte da qui, non dalla pagina,
    // così il registratore non deve accettare richieste dal browser.
    ipcMain.handle('printer-post', async (_e, url, body) => {
      if (!isLocal(url)) throw new Error('Il registratore deve essere nella rete del campo.');
      const res = await net.fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8' }, body });
      return { status: res.status, text: await res.text() };
    });

    createWindow(macLink ?? linkIn(process.argv));
  });

  app.on('window-all-closed', () => app.quit());
}
