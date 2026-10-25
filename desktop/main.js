// K9 Manager per Windows e Mac: apre la versione web dell'app in una finestra, senza browser.
// I file dell'app stanno in web/ (creati da "npm run web") e si servono dall'indirizzo app://campo/.
const { app, BrowserWindow, ipcMain, net, protocol, shell } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
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

const b64url = (buf) => buf.toString('base64url');

/**
 * Accesso con Google: Google non lo permette dentro la finestra del programma, quindi si apre il browser del
 * computer, che alla fine torna qui su http://127.0.0.1 (il client "App desktop" di Google lo accetta su
 * qualsiasi porta). Il codice ricevuto diventa l'ID token che la pagina passa a Supabase.
 */
function googleLogin({ clientId, clientSecret, nonce }) {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));
  return new Promise((resolve, reject) => {
    let redirect = '';
    const done = (err, value) => {
      clearTimeout(timer);
      server.close();
      if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
      }
      if (err) reject(err);
      else resolve(value);
    };
    const server = http.createServer(async (req, res) => {
      const u = new URL(req.url, redirect);
      if (u.pathname !== '/') return res.writeHead(404).end();
      const ok = u.searchParams.get('state') === state && u.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        `<!doctype html><meta charset="utf-8"><title>${app.getName()}</title><body style="font-family:sans-serif;text-align:center;padding:48px">` +
          (ok ? `<h2>Fatto!</h2><p>Puoi chiudere questa pagina e tornare a ${app.getName()}.</p>` : '<h2>Accesso non riuscito</h2><p>Chiudi questa pagina e riprova dal programma.</p>') +
          '</body>',
      );
      if (!ok) return done(null, null);
      try {
        const r = await net.fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code: u.searchParams.get('code'),
            client_id: clientId,
            client_secret: clientSecret,
            code_verifier: verifier,
            redirect_uri: redirect,
            grant_type: 'authorization_code',
          }).toString(),
        });
        const t = await r.json();
        if (!t.id_token) throw new Error(t.error_description || t.error || `Google ha risposto ${r.status}`);
        done(null, { idToken: t.id_token, accessToken: t.access_token });
      } catch (e) {
        done(e);
      }
    });
    // Dopo 5 minuti senza risposta si lascia perdere: il pulsante torna a funzionare.
    const timer = setTimeout(() => done(null, null), 5 * 60_000);
    server.on('error', (e) => done(e));
    server.listen(0, '127.0.0.1', () => {
      redirect = `http://127.0.0.1:${server.address().port}/`;
      const q = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirect,
        response_type: 'code',
        scope: 'openid email profile',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        nonce,
        prompt: 'select_account',
      });
      shell.openExternal(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
    });
  });
}

function createWindow(link) {
  win = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 380,
    minHeight: 560,
    title: app.getName(),
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
  // Il pannello del gestore (K9 Gestore) non apre i link di attivazione: restano a K9 Manager.
  if (app.getName() !== 'K9 Gestore') app.setAsDefaultProtocolClient(SCHEME);

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

    ipcMain.handle('google-login', (_e, o) => googleLogin(o));

    createWindow(macLink ?? linkIn(process.argv));
  });

  app.on('window-all-closed', () => app.quit());
}
