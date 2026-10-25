// Le app su GitHub, dal pannello (sezione "App e versioni"): le Releases da scaricare, le ultime build e i
// pulsanti per rifarle. Serve il segreto GITHUB_TOKEN: un token "fine-grained" di GitHub con accesso solo a
// questo repository, permessi Actions (lettura e scrittura) e Contents (lettura). GITHUB_REPO (facoltativo) è
// "proprietario/nome" del repository, se non è quello di sempre.
// Senza comune.ts, che apre il database appena caricato: così le prove girano senza Supabase.
const env = (k: string) => Deno.env.get(k) ?? '';

const REPO = () => env('GITHUB_REPO') || 'domenichiniedo/campo-cani-app';

export const githubSpento = () => !env('GITHUB_TOKEN');

export type Rilascio = {
  tag: string;
  titolo: string;
  data: string;
  note: string;
  file: { nome: string; url: string; mb: number; scaricato: number; data: string }[];
};
export type Build = { id: number; nome: string; stato: string; esito: string | null; quando: string; url: string; titolo: string };

/** Le build che si possono lanciare dal pannello: solo queste, con i loro parametri. */
export const LANCI = {
  // Ad ogni PR unita parte da sola: demo e prova per Android e per Windows.
  tutte: { file: 'aggiorna-app.yml', titolo: 'Tutte le app: demo e prova, Android e Windows' },
  'demo-mac': { file: 'mac.yml', titolo: 'Demo per Mac', inputs: { demo: true } },
  'demo-web': { file: 'demo-web.yml', titolo: 'Demo web per iPhone' },
  pannello: { file: 'pannello.yml', titolo: 'Demo del pannello K9 Gestore', inputs: { demo: true } },
} as const;
export type Lancio = keyof typeof LANCI | 'prova';

async function github(path: string, init: RequestInit = {}) {
  const r = await fetch(`https://api.github.com/repos/${REPO()}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env('GITHUB_TOKEN')}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'k9-gestore',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (r.status === 401 || r.status === 403) throw new Error('GitHub non accetta il token: controlla GITHUB_TOKEN e i suoi permessi (Actions e Contents).');
  if (!r.ok) throw new Error(`GitHub ha risposto ${r.status}.`);
  return r.status === 204 ? null : await r.json();
}

// deno-lint-ignore no-explicit-any
type Any = any;

/** Le Releases più recenti e le ultime build. */
export async function versioni(): Promise<{ rilasci: Rilascio[]; build: Build[] }> {
  const [rel, runs] = await Promise.all([github('/releases?per_page=20'), github('/actions/runs?per_page=20&event=workflow_dispatch')]);
  const push = await github('/actions/runs?per_page=10&branch=main&event=push');
  const build = [...(runs.workflow_runs ?? []), ...(push.workflow_runs ?? [])]
    .map(
      (w: Any): Build => ({
        id: w.id,
        nome: w.name,
        stato: w.status,
        esito: w.conclusion,
        quando: w.created_at,
        url: w.html_url,
        titolo: w.display_title ?? '',
      }),
    )
    .sort((a, b) => b.quando.localeCompare(a.quando))
    .slice(0, 12);
  return {
    rilasci: (rel as Any[]).map((r) => ({
      tag: r.tag_name,
      titolo: r.name || r.tag_name,
      data: r.published_at ?? r.created_at,
      note: String(r.body ?? '').slice(0, 600),
      file: (r.assets ?? []).map((a: Any) => ({
        nome: a.name,
        url: a.browser_download_url,
        mb: Math.round((a.size / 1e6) * 10) / 10,
        scaricato: a.download_count,
        data: a.updated_at,
      })),
    })),
    build,
  };
}

/** Lancia una build: una di LANCI, oppure "prova" (una prova nuova con il suo database). */
export async function lancia(quale: Lancio, b: { campo?: unknown; email?: unknown; giorni?: unknown } = {}) {
  if (quale === 'prova') {
    const email = String(b.email ?? '').trim().toLowerCase();
    const campo = String(b.campo ?? '').trim().slice(0, 80) || 'Centro di prova';
    const giorni = Math.round(Number(b.giorni));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Scrivi l'email del proprietario della prova.");
    if (!Number.isInteger(giorni) || giorni < 1 || giorni > 90) throw new Error('I giorni di prova vanno da 1 a 90.');
    await github('/actions/workflows/prova-database.yml/dispatches', {
      method: 'POST',
      body: JSON.stringify({ ref: 'main', inputs: { campo, email, giorni: String(giorni) } }),
    });
    return;
  }
  const l = LANCI[quale];
  if (!l) throw new Error('Build sconosciuta.');
  await github(`/actions/workflows/${l.file}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref: 'main', ...('inputs' in l ? { inputs: l.inputs } : {}) }),
  });
}
