import type { AdminCentre, AdminData, Charge, PlanRow } from '@/lib/gestore-admin';

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
  { piano: 'base', canone_cents: 0, tariffa_cents: 100 },
  { piano: 'professional', canone_cents: 1900, tariffa_cents: 80 },
  { piano: 'pro', canone_cents: 3900, tariffa_cents: 60 },
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
    iban: i % 2 === 0 && stato === 'pronto' ? `IT${String(10 + i)}X05428111010000001234${String(50 + i)}` : '',
    scade: stato === 'pronto' ? (i === 4 ? dayThree(now, 0) : dayThree(now, 1)) : null,
    sospeso: false,
    creato: `${monthOf(now, -Math.max(mesiFa, 0))}-0${(i % 8) + 1}T10:00:00Z`,
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
        canone_cents: p.canone_cents,
        importo_cents: p.canone_cents + n * (i === 0 ? 50 : p.tariffa_cents),
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
  };
}

let data: AdminData | null = null;

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
      set({ piano: b.piano as AdminCentre['piano'] });
      break;
    case 'centro': {
      const patch: Partial<AdminCentre> = {};
      if (b.iban !== undefined) patch.iban = String(b.iban);
      if (b.canone_cents !== undefined) patch.canone_cents = b.canone_cents as number | null;
      if (b.tariffa_cents !== undefined) patch.tariffa_cents = b.tariffa_cents as number | null;
      set(patch);
      break;
    }
    case 'prezzi':
      d.piani = d.piani.map((x) => (x.piano === b.piano ? { ...x, canone_cents: Number(b.canone_cents), tariffa_cents: Number(b.tariffa_cents) } : x));
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
