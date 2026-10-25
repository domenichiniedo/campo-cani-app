// deno-lint-ignore-file no-explicit-any -- ExcelJS arriva da fuori (npm in Supabase, node nelle prove), senza i suoi tipi.
// Il file Excel del report mensile: riepilogo, lezioni, pacchetti, fatture e scontrini, statistiche.
// Non legge il database: riceve i dati già pronti, così si può provare anche fuori da Supabase.

export type Lesson = {
  day: string;
  start_min: number;
  dur_min: number;
  price_cents: number;
  pay: 'onsite' | 'online' | 'package' | 'transfer';
  paid: boolean;
  status: 'active' | 'cancelled';
  checked_in_at: string | null;
  client: string;
  dog: string;
  lesson: string;
  option: string;
  field: string;
  trainer: string;
  group: boolean;
};
export type Sale = { activated_at: string; client: string; name: string; lessons: number; price_cents: number };
export type Doc = { issued_on: string; kind: 'invoice' | 'receipt'; number: string; client: string; description: string; total_cents: number; status: string };
export type Penalty = { created_at: string; client: string; dog: string; reason: string };

export type ReportData = {
  centre: string;
  /** Mese del report, AAAA-MM. */
  month: string;
  /** Oggi, AAAA-MM-GG (ora italiana): le lezioni dopo oggi sono "previste". */
  today: string;
  lessons: Lesson[];
  sales: Sale[];
  docs: Doc[];
  penalties: Penalty[];
  newClients: number;
  /** Incassato nel mese prima, per il confronto (null se non c'è). */
  previousCents: number | null;
};

type Excel = { Workbook: new () => any };

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const DAYS = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const PAY = { onsite: 'Al campo', online: 'Online', package: 'Pacchetto', transfer: 'Bonifico' };

const GREEN = 'FF123A2B';
const SOFT = 'FFE7F0EA';
const EURO = '€ #,##0.00';

export const monthTitle = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} ${y}`;
};
const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const date = (day: string) => {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const euro = (cents: number) => cents / 100;

/** Come la pagina Incassi: lezioni incassate (non da pacchetto) e pacchetti attivati nel mese. */
export function cashCents(d: Pick<ReportData, 'lessons' | 'sales'>) {
  const lessons = d.lessons.filter((b) => b.status === 'active' && b.paid && b.pay !== 'package').reduce((s, b) => s + b.price_cents, 0);
  return lessons + d.sales.reduce((s, p) => s + p.price_cents, 0);
}

function state(b: Lesson, today: string) {
  if (b.status === 'cancelled') return 'Disdetta';
  if (b.day > today) return 'Prevista';
  return b.checked_in_at ? 'Fatta' : 'Non entrato';
}

export function buildReport(ExcelJS: Excel, d: ReportData) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'K9 Manager';
  wb.created = new Date();

  const active = d.lessons.filter((b) => b.status === 'active');
  const past = active.filter((b) => b.day <= d.today);
  const done = past.filter((b) => b.checked_in_at).length;
  const lessonsCents = active.filter((b) => b.paid && b.pay !== 'package').reduce((s, b) => s + b.price_cents, 0);
  const salesCents = d.sales.reduce((s, p) => s + p.price_cents, 0);
  const toCollect = past.filter((b) => !b.paid && b.pay !== 'package').reduce((s, b) => s + b.price_cents, 0);
  const expected = active.filter((b) => b.day > d.today && !b.paid && b.pay !== 'package').reduce((s, b) => s + b.price_cents, 0);
  const total = lessonsCents + salesCents;

  const header = (ws: any, row: number) => {
    ws.getRow(row).eachCell((cell: any) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
      cell.alignment = { vertical: 'middle' };
    });
    ws.getRow(row).height = 20;
  };
  const totals = (ws: any, row: number) => {
    ws.getRow(row).eachCell((cell: any) => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } };
    });
  };
  const table = (name: string, columns: { header: string; key: string; width: number; euro?: boolean }[], rows: any[], sum: string[] = []) => {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width, style: c.euro ? { numFmt: EURO } : {} }));
    rows.forEach((r) => ws.addRow(r));
    header(ws, 1);
    if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    if (sum.length) {
      // Totali con SUBTOTALE: se filtri le righe, sommano solo quelle visibili.
      const last = rows.length + 1;
      const r = ws.addRow({ [columns[0].key]: rows.length ? `Totale (${rows.length})` : 'Nessuna riga' });
      sum.forEach((key) => {
        const col = ws.getColumn(key).letter;
        r.getCell(key).value = rows.length ? { formula: `SUBTOTAL(9,${col}2:${col}${last})` } : 0;
      });
      totals(ws, r.number);
    }
    return ws;
  };

  // 1. Riepilogo
  const sum = wb.addWorksheet('Riepilogo');
  sum.columns = [{ width: 38 }, { width: 18 }, { width: 50 }];
  sum.addRow([`${d.centre}`]).font = { bold: true, size: 16, color: { argb: GREEN } };
  sum.addRow([`Report di ${monthTitle(d.month).toLowerCase()}`]).font = { size: 13 };
  sum.addRow([`Creato il ${date(d.today).toLocaleDateString('it-IT', { timeZone: 'UTC' })} da K9 Manager. Le lezioni dopo questa data sono quelle già prenotate.`]).font = {
    italic: true,
    color: { argb: 'FF5A675F' },
  };
  const section = (title: string) => {
    sum.addRow([]);
    const r = sum.addRow([title, '', '']);
    header(sum, r.number);
  };
  const line = (label: string, value: number | string, fmt?: string, note = '') => {
    const r = sum.addRow([label, value, note]);
    if (fmt) r.getCell(2).numFmt = fmt;
    r.getCell(3).font = { color: { argb: 'FF5A675F' } };
    return r;
  };
  section('Incassi');
  line('Lezioni incassate', euro(lessonsCents), EURO, 'Pagate al campo o online; non quelle scalate da un pacchetto');
  line('Pacchetti venduti', euro(salesCents), EURO, `${d.sales.length} pacchetti attivati nel mese`);
  totals(sum, line('Totale incassato', euro(total), EURO).number);
  if (d.previousCents !== null) {
    const diff = d.previousCents ? (total - d.previousCents) / d.previousCents : null;
    line('Mese precedente', euro(d.previousCents), EURO, diff === null ? '' : `${diff >= 0 ? '+' : ''}${Math.round(diff * 100)}% questo mese`);
  }
  line('Da incassare', euro(toCollect), EURO, 'Lezioni già passate e non ancora pagate');
  line('Previsto', euro(expected), EURO, 'Lezioni prenotate per i prossimi giorni del mese');
  // Nel foglio vanno solo i documenti emessi, che hanno il numero; gli altri si contano qui.
  const issued = d.docs.filter((x) => x.status === 'sent');
  const waiting = d.docs.filter((x) => x.status !== 'sent');
  line('Fatture e scontrini emessi', euro(issued.reduce((s, x) => s + x.total_cents, 0)), EURO, `${issued.length} documenti, con il loro numero`);
  if (waiting.length) {
    line('Ancora da emettere', euro(waiting.reduce((s, x) => s + x.total_cents, 0)), EURO, `${waiting.length} documenti: prendono il numero quando li emetti`);
  }

  section('Attività');
  line('Lezioni prenotate', active.length);
  line('Lezioni fatte', done, undefined, 'Cane entrato in campo');
  line('Non entrati', past.length - done, undefined, 'Lezioni passate senza ingresso');
  line('Disdette', d.lessons.length - active.length);
  line('Presenze', past.length ? done / past.length : 0, '0%', 'Lezioni fatte su quelle già passate');
  line('Clienti con almeno una lezione', new Set(active.map((b) => b.client)).size);
  line('Nuovi iscritti', d.newClients);
  line('Ore di campo occupate', Math.round(active.reduce((s, b) => s + b.dur_min, 0) / 6) / 10, '0.0');
  line('Penalità date', d.penalties.length);

  // 2. Lezioni, una riga per prenotazione
  table(
    'Lezioni',
    [
      { header: 'Data', key: 'day', width: 12 },
      { header: 'Giorno', key: 'wd', width: 11 },
      { header: 'Ora', key: 'time', width: 8 },
      { header: 'Cliente', key: 'client', width: 22 },
      { header: 'Cane', key: 'dog', width: 14 },
      { header: 'Lezione', key: 'lesson', width: 32 },
      { header: 'Opzione', key: 'option', width: 18 },
      { header: 'Campo', key: 'field', width: 12 },
      { header: 'Trainer', key: 'trainer', width: 14 },
      { header: 'Stato', key: 'state', width: 12 },
      { header: 'Pagamento', key: 'pay', width: 12 },
      { header: 'Incassata', key: 'paid', width: 10 },
      { header: 'Prezzo', key: 'price', width: 11, euro: true },
      { header: 'Incassato', key: 'cash', width: 11, euro: true },
    ],
    d.lessons
      .slice()
      .sort((a, b) => a.day.localeCompare(b.day) || a.start_min - b.start_min)
      .map((b) => ({
        day: date(b.day),
        wd: DAYS[date(b.day).getUTCDay()],
        time: hm(b.start_min),
        client: b.client,
        dog: b.dog,
        lesson: b.group ? `${b.lesson} (gruppo)` : b.lesson,
        option: b.option,
        field: b.field,
        trainer: b.trainer,
        state: state(b, d.today),
        pay: PAY[b.pay],
        paid: b.pay === 'package' ? '–' : b.paid ? 'Sì' : 'No',
        price: b.status === 'active' ? euro(b.price_cents) : 0,
        cash: b.status === 'active' && b.paid && b.pay !== 'package' ? euro(b.price_cents) : 0,
      })),
    ['price', 'cash'],
  ).getColumn('day').numFmt = 'dd/mm/yyyy';

  // 3. Pacchetti venduti
  table(
    'Pacchetti',
    [
      { header: 'Attivato il', key: 'day', width: 12 },
      { header: 'Cliente', key: 'client', width: 22 },
      { header: 'Pacchetto', key: 'name', width: 24 },
      { header: 'Lezioni', key: 'lessons', width: 9 },
      { header: 'Prezzo', key: 'price', width: 11, euro: true },
    ],
    d.sales.map((p) => ({ day: date(p.activated_at), client: p.client, name: p.name, lessons: p.lessons, price: euro(p.price_cents) })),
    ['lessons', 'price'],
  ).getColumn('day').numFmt = 'dd/mm/yyyy';

  // 4. Fatture e scontrini
  table(
    'Fatture e scontrini',
    [
      { header: 'Data', key: 'day', width: 12 },
      { header: 'Tipo', key: 'kind', width: 10 },
      { header: 'Numero', key: 'number', width: 14 },
      { header: 'Cliente', key: 'client', width: 22 },
      { header: 'Descrizione', key: 'description', width: 40 },
      { header: 'Importo', key: 'total', width: 11, euro: true },
    ],
    issued
      .slice()
      .sort((a, b) => a.issued_on.localeCompare(b.issued_on) || a.kind.localeCompare(b.kind) || a.number.localeCompare(b.number, 'it', { numeric: true }))
      .map((x) => ({
        day: date(x.issued_on),
        kind: x.kind === 'invoice' ? 'Fattura' : 'Scontrino',
        number: x.number || 'Da inserire',
        client: x.client,
        description: x.description,
        total: euro(x.total_cents),
      })),
    ['total'],
  ).getColumn('day').numFmt = 'dd/mm/yyyy';

  // 5. Statistiche: lezioni, ore e soldi per lezione, trainer, campo, giorno, ora e pagamento
  const stats = wb.addWorksheet('Statistiche');
  stats.columns = [{ width: 30 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 13 }, { width: 13 }];
  const group = (title: string, key: (b: Lesson) => string, order?: string[]) => {
    const m = new Map<string, { n: number; done: number; min: number; cash: number; open: number }>();
    active.forEach((b) => {
      const k = key(b) || '—';
      const g = m.get(k) ?? { n: 0, done: 0, min: 0, cash: 0, open: 0 };
      g.n++;
      g.min += b.dur_min;
      if (b.checked_in_at) g.done++;
      if (b.paid && b.pay !== 'package') g.cash += b.price_cents;
      if (!b.paid && b.pay !== 'package') g.open += b.price_cents;
      m.set(k, g);
    });
    const r = stats.addRow([title, 'Lezioni', 'Fatte', 'Ore', 'Incassato', 'Non pagato']);
    header(stats, r.number);
    const keys = order ? order.filter((k) => m.has(k)) : [...m.keys()].sort((a, b) => m.get(b)!.n - m.get(a)!.n);
    keys.forEach((k) => {
      const g = m.get(k)!;
      const row = stats.addRow([k, g.n, g.done, Math.round(g.min / 6) / 10, euro(g.cash), euro(g.open)]);
      row.getCell(4).numFmt = '0.0';
      row.getCell(5).numFmt = EURO;
      row.getCell(6).numFmt = EURO;
    });
    stats.addRow([]);
  };
  group('Per lezione', (b) => b.lesson);
  group('Per trainer', (b) => b.trainer || 'Senza trainer');
  group('Per campo', (b) => b.field);
  group('Per giorno della settimana', (b) => DAYS[date(b.day).getUTCDay()], [...DAYS.slice(1), DAYS[0]]);
  group(
    'Per fascia oraria',
    (b) => `${hm(Math.floor(b.start_min / 60) * 60)}–${hm(Math.floor(b.start_min / 60) * 60 + 60)}`,
    Array.from({ length: 24 }, (_, h) => `${hm(h * 60)}–${hm(h * 60 + 60)}`),
  );
  group('Per pagamento', (b) => PAY[b.pay], Object.values(PAY));

  // 6. Penalità
  table(
    'Penalità',
    [
      { header: 'Data', key: 'day', width: 12 },
      { header: 'Cliente', key: 'client', width: 22 },
      { header: 'Cane', key: 'dog', width: 14 },
      { header: 'Motivo', key: 'reason', width: 50 },
    ],
    d.penalties.map((p) => ({ day: date(p.created_at), client: p.client, dog: p.dog, reason: p.reason })),
  ).getColumn('day').numFmt = 'dd/mm/yyyy';

  return wb;
}
