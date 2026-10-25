import type { CentreBilling } from '@/lib/billing';
import type { AdminCentre, AdminData, AppVersions, BuildRun, Charge, PlanRow } from '@/lib/gestore-admin';

// Demo del pannello K9 Gestore: centri e addebiti finti, tutto nel dispositivo, senza server.
// Le azioni (piano, prezzi, IBAN, rinnovo, sospensione...) cambiano i dati finti finché la pagina resta aperta.

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthOf = (d: Date, delta: number) => {
  const x = new Date(d.getFullYear(), d.getMonth() + delta, 1);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`;
};
/** Il giorno 3 del mese (delta = 1: del mese dopo): fin lì vale la licenza. */
const dayThree = (d: Date, delta: number) => dayKey(new Date(d.getFullYear(), d.getMonth() + delta, 3));

const PIANI: PlanRow[] = [
  { piano: 'base', canone_cents: 590, tariffa_cents: 100, fisso_cents: 3900, pacchetti_bp: 100 },
  { piano: 'professional', canone_cents: 2999, tariffa_cents: 60, fisso_cents: 7900, pacchetti_bp: 100 },
  { piano: 'pro', canone_cents: 8000, tariffa_cents: 30, fisso_cents: 14900, pacchetti_bp: 100 },
];
const price = (p: AdminCentre['piano']) => PIANI.find((x) => x.piano === p)!;

type Seed = [campo: string, città: string, piano: AdminCentre['piano'], stato: AdminCentre['stato'], mesiFa: number, base: number];

const SEEDS: Seed[] = [
  ['Centro Cinofilo Le Querce', 'querce', 'pro', 'pronto', 14, 160],
  ['Dog Village', 'dogvillage', 'professional', 'pronto', 12, 95],
  ['Cani Felici', 'canifelici', 'base', 'pronto', 10, 40],
  ['Agility Team Brianza', 'agilitybrianza', 'pro', 'pronto', 8, 120],
  ['Scuola Cani Il Faro', 'ilfaro', 'professional', 'pronto', 6, 70],
  ['K9 Academy Torino', 'k9torino', 'pro', 'pronto', 4, 85],
  ['Bau Center Verona', 'baucenter', 'base', 'pronto', 2, 30],
  ['Campo Cani Monte Rosa', 'monterosa', 'professional', 'avvio', 0, 0],
  ['Asd Cinofila Adriatica', 'adriatica', 'base', 'errore', 0, 0],
  ['Educazione Cinofila Sole', 'sole', 'professional', 'mandato', 0, 0],
];

// Sedi finte per i dati di fatturazione. L'ultimo centro non li ha: si vede l'avviso nel pannello.
const SEDI: [comune: string, provincia: string, cap: string][] = [
  ['Bologna', 'BO', '40128'],
  ['Milano', 'MI', '20141'],
  ['Firenze', 'FI', '50127'],
  ['Monza', 'MB', '20900'],
  ['Pesaro', 'PU', '61121'],
  ['Torino', 'TO', '10137'],
  ['Verona', 'VR', '37135'],
  ['Biella', 'BI', '13900'],
  ['Rimini', 'RN', '47921'],
];

/** Partita IVA finta ma valida (cifra di controllo giusta), diversa per ogni centro. */
function vat(i: number) {
  const s = String(1234567000 + i * 7919).padStart(10, '0');
  let sum = 0;
  for (let k = 0; k < 10; k++) {
    let n = Number(s[k]);
    if (k % 2 === 1) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
    sum += n;
  }
  return s + ((10 - (sum % 10)) % 10);
}

function billing(campo: string, i: number): CentreBilling {
  const sede = SEDI[i];
  if (!sede) return { ragione_sociale: '', partita_iva: '', codice_fiscale: '', indirizzo: '', cap: '', comune: '', provincia: '', codice_sdi: '', pec: '' };
  const asd = i % 3 === 2;
  return {
    ragione_sociale: asd ? `Asd ${campo}` : `${campo} Srl`,
    partita_iva: asd ? '' : vat(i),
    codice_fiscale: vat(i),
    indirizzo: `Via dei Campi ${12 + i}`,
    cap: sede[2],
    comune: sede[0],
    provincia: sede[1],
    codice_sdi: asd ? '' : 'M5UXCR1',
    pec: asd ? `${campo.toLowerCase().replace(/[^a-z]+/g, '')}@pec.it` : '',
  };
}

function build(): AdminData {
  const now = new Date();
  const centri: AdminCentre[] = SEEDS.map(([campo, mail, piano, stato, mesiFa], i) => ({
    id: `demo-${i}`,
    codice: `K9-${'DEMO'}${String.fromCharCode(65 + i)}${i + 2}`,
    campo,
    email: `titolare@${mail}.it`,
    piano,
    stato,
    errore: stato === 'errore' ? 'Supabase 402 su POST /projects: raggiunto il limite dei progetti gratuiti.' : '',
    tariffa_cents: i === 0 ? 50 : null,
    canone_cents: null,
    // Agility Team Brianza paga il prezzo fisso.
    formula: i === 3 ? 'fisso' : 'consumo',
    fisso_cents: null,
    // Dog Village passa a Base dal mese prossimo; K9 Academy Torino ha disdetto.
    piano_prossimo: i === 1 ? 'base' : null,
    disdetta: i === 5 ? dayKey(new Date(now.getFullYear(), now.getMonth() + 2, 0)) : null,
    iban: i % 2 === 0 && stato === 'pronto' ? `IT${String(10 + i)}X05428111010000001234${String(50 + i)}` : '',
    scade: stato === 'pronto' ? (i === 4 ? dayThree(now, 0) : dayThree(now, 1)) : null,
    sospeso: false,
    creato: `${monthOf(now, -Math.max(mesiFa, 0))}-0${(i % 8) + 1}T10:00:00Z`,
    ...billing(campo, i),
  }));
  const addebiti: Charge[] = [];
  SEEDS.forEach(([, , piano, stato, mesiFa, base], i) => {
    if (stato !== 'pronto') return;
    for (let k = Math.min(mesiFa, 12); k >= 1; k--) {
      const mese = monthOf(now, -k);
      // Crescita nel tempo, estate più calma, un po' di variazione per centro.
      const m = Number(mese.slice(5, 7));
      const stagione = m === 8 ? 0.55 : m === 7 || m === 12 ? 0.8 : 1;
      const n = Math.round(base * stagione * (1 + (mesiFa - k) * 0.06) * (0.9 + ((i * 7 + k * 3) % 5) * 0.05));
      const ultimo = k === 1;
      const statoAddebito: Charge['stato'] = ultimo && i === 4 ? 'non_pagato' : ultimo && i % 2 === 0 ? 'inviato' : 'pagato';
      const p = price(piano);
      const codice = centri[i].codice;
      const [y, mm] = mese.split('-').map(Number);
      addebiti.push({
        id: `a-${i}-${mese}`,
        centro: `demo-${i}`,
        mese,
        prenotazioni: n,
        canone_cents: i === 3 ? p.fisso_cents : p.canone_cents,
        // Qualche pacchetto da 120 € al mese: l'1% del prezzo.
        pacchetti_cents: i === 3 ? 0 : Math.round(n / 25) * 120,
        importo_cents: i === 3 ? p.fisso_cents : p.canone_cents + n * (i === 0 ? 50 : p.tariffa_cents) + Math.round(n / 25) * 120,
        bonus_cents: 0,
        stato: statoAddebito,
        fattura: null,
        errore: '',
        scadenza: dayKey(new Date(y, mm, 3)),
        causale: `${codice} ${mese}`,
        pagato_il: statoAddebito === 'pagato' ? dayKey(new Date(y, mm, 1 + (i % 3))) : null,
      });
    }
  });
  return {
    oggi: dayKey(now),
    centri,
    addebiti,
    piani: PIANI.map((x) => ({ ...x })),
    banca: {
      bonifico_iban: 'IT60X0542811101000000123456',
      bonifico_intestatario: 'Edoardo Domenichini',
      banca: 'Banca Demo',
      paese: 'IT',
      tipo: 'personal',
      iban: 'IT60X0542811101000000123456',
      valido_fino: `${dayThree(now, 4)}T00:00:00Z`,
      ultimo_controllo: new Date(now.getTime() - 2 * 3600_000).toISOString(),
      errore: '',
      collegata: true,
      abilitata: true,
    },
    movimenti: [
      { id: 'm-1', data: dayKey(now), importo_cents: 4100, iban: 'IT02L1234512345123456789012', nome: 'ASD Cani Felici', causale: 'K9 abbonamento', centro: null },
    ],
    codici: [
      { codice: 'BENVENUTO30', importo_cents: 3000, usi_max: null, usati: 4, scade: null, nota: 'Benvenuto per i centri nuovi', attivo: true, creato: `${monthOf(now, -5)}-01T10:00:00Z` },
      { codice: 'FIERA-BO', importo_cents: 5000, usi_max: 10, usati: 10, scade: dayKey(new Date(now.getFullYear(), now.getMonth() - 1, 20)), nota: 'Fiera di Bologna', attivo: true, creato: `${monthOf(now, -3)}-10T10:00:00Z` },
    ],
    crediti: [
      { id: 'cr-1', centro: 'demo-6', importo_cents: 3000, residuo_cents: 1200, codice: 'BENVENUTO30', nota: 'Benvenuto per i centri nuovi', creato: `${monthOf(now, -2)}-04T10:00:00Z` },
      { id: 'cr-2', centro: 'demo-1', importo_cents: 2000, residuo_cents: 2000, codice: null, nota: 'Scuse per il disservizio di settembre', creato: `${monthOf(now, 0)}-02T10:00:00Z` },
    ],
  };
}

const REPO = 'https://github.com/domenichiniedo/campo-cani-app';
const LANCI = [
  { id: 'tutte', titolo: 'Tutte le app: demo e prova, Android e Windows' },
  { id: 'demo-mac', titolo: 'Demo per Mac' },
  { id: 'demo-web', titolo: 'Demo web per iPhone' },
  { id: 'pannello', titolo: 'Demo del pannello K9 Gestore' },
];

/** Releases e build finte, come le mostra GitHub. */
function versions(): AppVersions {
  const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
  const file = (tag: string, nome: string, mb: number, scaricato: number, h: number) => ({
    nome,
    url: `${REPO}/releases/download/${tag}/${nome}`,
    mb,
    scaricato,
    data: ago(h),
  });
  const run = (id: number, nome: string, h: number, esito: string | null, titolo: string): BuildRun => ({
    id,
    nome,
    stato: esito ? 'completed' : 'in_progress',
    esito,
    quando: ago(h),
    url: `${REPO}/actions/runs/${id}`,
    titolo,
  });
  return {
    abilitato: true,
    lanci: LANCI,
    build: [
      run(9, 'Aggiorna le app', 0.2, null, 'Merge pull request #54'),
      run(8, 'Prova con database', 26, 'success', 'Prova con database'),
      run(7, 'Aggiorna le app', 50, 'success', 'Merge pull request #53'),
      run(6, 'Demo per Mac', 75, 'failure', 'Demo per Mac'),
    ],
    rilasci: [
      { tag: 'demo-android', titolo: 'Demo per Android', data: ago(50), note: '', file: [file('demo-android', 'K9Manager-Demo.apk', 9.4, 128, 50), file('demo-android', 'K9Manager-Demo.aab', 8.1, 3, 50)] },
      { tag: 'demo-windows', titolo: 'Demo per Windows', data: ago(50), note: '', file: [file('demo-windows', 'K9Manager-Windows-Demo.exe', 92.3, 41, 50)] },
      { tag: 'prova-jnysclqgutqetrxitlez', titolo: 'Prova di K9 Manager – jnysclqgutqetrxitlez', data: ago(26), note: '', file: [file('prova-jnysclqgutqetrxitlez', 'K9Manager-Prova.apk', 9.5, 17, 26), file('prova-jnysclqgutqetrxitlez', 'K9Manager-Prova-Windows.exe', 92.4, 6, 26)] },
      { tag: 'demo-mac', titolo: 'Demo per Mac', data: ago(300), note: '', file: [file('demo-mac', 'K9Manager-Mac-Demo.dmg', 118.0, 9, 300)] },
    ],
  };
}

let data: AdminData | null = null;
let ver: AppVersions | null = null;

export async function demoCall<T>(azione: string, b: Record<string, unknown>): Promise<T> {
  data ??= build();
  const d = data;
  await new Promise((r) => setTimeout(r, 250));
  const c = d.centri.find((x) => x.id === b.id);
  const set = (patch: Partial<AdminCentre>) => (d.centri = d.centri.map((x) => (x.id === b.id ? { ...x, ...patch } : x)));
  const today = new Date();
  switch (azione) {
    case 'dati':
      return structuredClone(d) as T;
    case 'piano':
      set({ piano: b.piano as AdminCentre['piano'], piano_prossimo: null, ...(b.formula ? { formula: b.formula as AdminCentre['formula'] } : {}) });
      break;
    case 'centro': {
      const patch: Partial<AdminCentre> = {};
      if (b.iban !== undefined) patch.iban = String(b.iban);
      if (b.canone_cents !== undefined) patch.canone_cents = b.canone_cents as number | null;
      if (b.tariffa_cents !== undefined) patch.tariffa_cents = b.tariffa_cents as number | null;
      if (b.fisso_cents !== undefined) patch.fisso_cents = b.fisso_cents as number | null;
      if (b.disdetta === null) patch.disdetta = null;
      if (b.fattura !== undefined) Object.assign(patch, b.fattura);
      set(patch);
      break;
    }
    case 'prezzi':
      d.piani = d.piani.map((x) =>
        x.piano === b.piano
          ? {
              ...x,
              canone_cents: Number(b.canone_cents),
              tariffa_cents: Number(b.tariffa_cents),
              fisso_cents: b.fisso_cents === undefined ? x.fisso_cents : Number(b.fisso_cents),
              pacchetti_bp: b.pacchetti_bp === undefined ? x.pacchetti_bp : Number(b.pacchetti_bp),
            }
          : x,
      );
      break;
    case 'conto':
      d.banca = { ...d.banca, bonifico_iban: String(b.iban), bonifico_intestatario: String(b.intestatario) };
      break;
    case 'banche':
      return { banche: ['Banca Demo', 'BPER Banca', 'Intesa Sanpaolo', 'UniCredit', 'Fineco', 'Banca Sella'].map((nome) => ({ nome, paese: 'IT', tipi: ['personal', 'business'] })) } as T;
    case 'collega_banca':
      throw new Error('Nella demo non ci si collega a una banca vera.');
    case 'controlla':
      d.banca = { ...d.banca, ultimo_controllo: new Date().toISOString() };
      return { letti: 3, nuovi: 0, abbinati: 0, non_riconosciuti: 0 } as T;
    case 'abbina': {
      const a = d.addebiti.find((x) => x.id === b.addebito);
      if (a) {
        d.addebiti = d.addebiti.map((x) => (x.id === a.id ? { ...x, stato: 'pagato', pagato_il: dayKey(today) } : x));
        d.centri = d.centri.map((x) => (x.id === a.centro ? { ...x, scade: dayThree(today, 1) } : x));
      }
      d.movimenti = d.movimenti.filter((x) => x.id !== b.movimento);
      break;
    }
    case 'rinnova':
      set({ scade: dayThree(today, 1) > (c?.scade ?? '') ? dayThree(today, 1) : c?.scade });
      break;
    case 'sospendi':
      set({ sospeso: !!b.sospeso });
      break;
    case 'riprova':
      set({ stato: 'avvio', errore: '' });
      // Nella demo la preparazione finisce da sola dopo qualche secondo.
      setTimeout(() => (d.centri = d.centri.map((x) => (x.id === b.id ? { ...x, stato: 'pronto', scade: dayThree(today, 1) } : x))), 8000);
      break;
    case 'pagato': {
      const a = d.addebiti.find((x) => x.id === b.addebito);
      if (a) {
        d.addebiti = d.addebiti.map((x) => (x.id === a.id ? { ...x, stato: 'pagato', errore: '', pagato_il: dayKey(today) } : x));
        d.centri = d.centri.map((x) => (x.id === a.centro ? { ...x, scade: dayThree(today, 1) } : x));
      }
      break;
    }
    case 'bonus_codice_crea': {
      const codice = String(b.codice ?? '').trim().toUpperCase();
      if (!/^[A-Z0-9-]{4,20}$/.test(codice)) throw new Error('Il codice va da 4 a 20 lettere, cifre o trattini.');
      if (d.codici.some((x) => x.codice === codice)) throw new Error('Questo codice esiste già.');
      if (!Number(b.importo_cents)) throw new Error('Scrivi quanto vale il bonus.');
      const usi = b.usi_max === null || b.usi_max === '' || b.usi_max === undefined ? null : Number(b.usi_max);
      d.codici.unshift({ codice, importo_cents: Number(b.importo_cents), usi_max: usi, usati: 0, scade: (b.scade as string) || null, nota: String(b.nota ?? ''), attivo: true, creato: new Date().toISOString() });
      break;
    }
    case 'bonus_codice':
      d.codici = d.codici.map((x) => (x.codice === b.codice ? { ...x, attivo: !!b.attivo } : x));
      break;
    case 'bonus_dai':
      if (!Number(b.importo_cents)) throw new Error('Scrivi quanto vale il bonus.');
      d.crediti.unshift({ id: `cr-${Date.now()}`, centro: String(b.id), importo_cents: Number(b.importo_cents), residuo_cents: Number(b.importo_cents), codice: null, nota: String(b.nota ?? ''), creato: new Date().toISOString() });
      break;
    case 'versioni':
      ver ??= versions();
      return structuredClone(ver) as T;
    case 'lancia': {
      // Nella demo la build compare fra quelle in corso, ma non parte davvero.
      if (b.quale === 'prova' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.email ?? ''))) throw new Error("Scrivi l'email del proprietario della prova.");
      ver ??= versions();
      const nome = b.quale === 'prova' ? 'Prova con database' : (LANCI.find((l) => l.id === b.quale)?.titolo ?? String(b.quale));
      ver.build.unshift({ id: Date.now(), nome, stato: 'queued', esito: null, quando: new Date().toISOString(), url: `${REPO}/actions`, titolo: nome });
      break;
    }
    case 'addebita': {
      const mese = typeof b.mese === 'string' && /^\d{4}-\d{2}$/.test(b.mese) ? b.mese : monthOf(today, -1);
      const centri = Object.fromEntries(
        d.centri
          .filter((x) => x.stato === 'pronto')
          .map((x) => {
            const a = d.addebiti.find((y) => y.centro === x.id && y.mese === mese);
            return [x.codice, a ? `già fatto (${a.stato})` : 'nessuna prenotazione'];
          }),
      );
      return { mese, centri } as T;
    }
    default:
      throw new Error('Azione sconosciuta.');
  }
  return { fatto: true } as T;
}
