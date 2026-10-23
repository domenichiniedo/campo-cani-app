import type { AdminCentre, AdminData, Charge } from '@/lib/gestore-admin';

// Demo del pannello K9 Gestore: centri e addebiti finti, tutto nel dispositivo, senza server.
// Le azioni (piano, tariffa, rinnovo, sospensione...) cambiano i dati finti finché la pagina resta aperta.

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthOf = (d: Date, delta: number) => {
  const x = new Date(d.getFullYear(), d.getMonth() + delta, 1);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`;
};
const endOfMonth = (d: Date, delta: number) => dayKey(new Date(d.getFullYear(), d.getMonth() + delta + 1, 0));

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
    tariffa_cents: i === 0 ? 80 : 100,
    stripe_metodo: stato === 'mandato' ? null : `pm_demo_${i}`,
    stripe_conto: stato === 'pronto' && i % 3 !== 2 ? `acct_demo_${i}` : null,
    stripe_attivo: stato === 'pronto' && i % 3 === 0,
    scade: stato === 'pronto' ? (i === 4 ? endOfMonth(now, 0) : endOfMonth(now, 1)) : null,
    sospeso: false,
    creato: `${monthOf(now, -Math.max(mesiFa, 0))}-0${(i % 8) + 1}T10:00:00Z`,
  }));
  const addebiti: Charge[] = [];
  SEEDS.forEach(([, , , stato, mesiFa, base], i) => {
    if (stato !== 'pronto') return;
    for (let k = Math.min(mesiFa, 12); k >= 1; k--) {
      const mese = monthOf(now, -k);
      // Crescita nel tempo, estate più calma, un po' di variazione per centro.
      const m = Number(mese.slice(5, 7));
      const stagione = m === 8 ? 0.55 : m === 7 || m === 12 ? 0.8 : 1;
      const n = Math.round(base * stagione * (1 + (mesiFa - k) * 0.06) * (0.9 + ((i * 7 + k * 3) % 5) * 0.05));
      const ultimo = k === 1;
      const statoAddebito: Charge['stato'] = ultimo && i === 4 ? 'non_pagato' : ultimo && i % 2 === 0 ? 'inviato' : 'pagato';
      addebiti.push({
        id: `a-${i}-${mese}`,
        centro: `demo-${i}`,
        mese,
        prenotazioni: n,
        importo_cents: n * (i === 0 ? 80 : 100),
        stato: statoAddebito,
        fattura: `in_demo_${i}_${k}`,
        errore: statoAddebito === 'non_pagato' ? 'Addebito SEPA rifiutato dalla banca: fondi insufficienti.' : '',
      });
    }
  });
  return { oggi: dayKey(now), centri, addebiti };
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
    case 'tariffa':
      set({ tariffa_cents: Number(b.cents) });
      break;
    case 'rinnova':
      set({ scade: endOfMonth(today, 1) > (c?.scade ?? '') ? endOfMonth(today, 1) : c?.scade });
      break;
    case 'sospendi':
      set({ sospeso: !!b.sospeso });
      break;
    case 'riprova':
      set({ stato: 'avvio', errore: '' });
      // Nella demo la preparazione finisce da sola dopo qualche secondo.
      setTimeout(() => (d.centri = d.centri.map((x) => (x.id === b.id ? { ...x, stato: 'pronto', scade: endOfMonth(today, 1), stripe_metodo: x.stripe_metodo } : x))), 8000);
      break;
    case 'pagato': {
      const a = d.addebiti.find((x) => x.id === b.addebito);
      if (a) {
        d.addebiti = d.addebiti.map((x) => (x.id === a.id ? { ...x, stato: 'pagato', errore: '' } : x));
        d.centri = d.centri.map((x) => (x.id === a.centro ? { ...x, scade: endOfMonth(today, 1) } : x));
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
