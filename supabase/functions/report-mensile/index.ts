// Report mensile del piano Pro: l'ultimo venerdì del mese manda al proprietario, per email, un Excel
// con le lezioni, i pacchetti, le fatture e le statistiche del mese.
// Gira su Supabase (Edge Function), mai nell'app: usa la chiave di servizio e la chiave di Resend.
//
// La chiamano:
// - pg_cron ogni venerdì, con l'intestazione x-webhook-secret: manda il report solo l'ultimo venerdì del mese;
// - il proprietario dall'app ("Mandami ora il report"), con il suo accesso: lo manda subito.
//
// Secrets da impostare (vedi README):
//   RESEND_API_KEY        chiave di Resend (resend.com), il servizio che spedisce l'email
//   REPORT_FROM           mittente, per esempio "Club Manager <report@iltuodominio.it>"
//   WEBHOOK_SECRET        la stessa parola segreta delle altre funzioni
// Facoltativi:
//   REPORT_TO             altri indirizzi a cui mandarlo, separati da virgola
//   LICENSE_PUBLIC_KEY    chiave pubblica delle licenze, per controllare la firma del piano
//   LICENSE_SERVER_KEY    chiave pubblica del server gestore, per i centri registrati dall'app

import ExcelJS from 'npm:exceljs@4.4.0';
import nacl from 'npm:tweetnacl@1.0.3';

import { admin, allowed, env } from '../_shared/common.ts';
import { buildReport, cashCents, monthTitle, type Lesson, type ReportData, type Sale } from './report.ts';

const romeDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(d);
const nextMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
const prevMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};

/** Venerdì e tra una settimana è già il mese dopo. */
export function isLastFriday(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const week = new Date(Date.UTC(y, m - 1, d + 7));
  return date.getUTCDay() === 5 && week.getUTCMonth() !== date.getUTCMonth();
}

function b64(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Il piano della licenza salvata nell'app; senza licenza il centro è completo (come nell'app). Scaduta: nessuno. */
function planOf(code: string, today: string) {
  const [prefix, body, sig] = (code ?? '').trim().split('.');
  if (!prefix) return 'pro';
  if (prefix !== 'CC1' || !body || !sig) return null;
  const keys = [env('LICENSE_PUBLIC_KEY'), env('LICENSE_SERVER_KEY')].filter(Boolean);
  const signed = (key: string) => nacl.sign.detached.verify(new TextEncoder().encode(`${prefix}.${body}`), b64(sig), b64(key));
  if (keys.length && !keys.some(signed)) return null;
  try {
    const l = JSON.parse(new TextDecoder().decode(b64(body))) as { piano?: string; scade?: string | null };
    if (l.scade && l.scade < today) return null;
    return l.piano ?? 'pro';
  } catch {
    return null;
  }
}

const fullName = (p?: { first_name: string; last_name: string } | null) => (p ? `${p.first_name} ${p.last_name}`.trim() : '');

async function load(month: string, today: string, centre: string): Promise<ReportData> {
  const from = `${month}-01`;
  const to = `${nextMonth(month)}-01`;
  const lessonsOf = async (f: string, t: string) => {
    // Supabase restituisce al massimo 1000 righe per volta: si leggono a pagine.
    // deno-lint-ignore no-explicit-any
    const rows: any[] = [];
    for (let page = 0; ; page++) {
      const { data, error } = await admin
        .from('bookings')
        .select(
          'id, day, start_min, dur_min, price_cents, pay, paid, status, checked_in_at, lesson_option, class_id, profiles(first_name, last_name), dogs(name), lesson_types(label), fields(name), trainers(name)',
        )
        .gte('day', f)
        .lt('day', t)
        .order('id')
        .range(page * 1000, page * 1000 + 999);
      if (error) throw error;
      rows.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }
    // deno-lint-ignore no-explicit-any
    return rows.map((b: any): Lesson => ({
      day: b.day,
      start_min: b.start_min,
      dur_min: b.dur_min,
      price_cents: b.price_cents,
      pay: b.pay,
      paid: b.paid,
      status: b.status,
      checked_in_at: b.checked_in_at,
      client: fullName(b.profiles),
      dog: b.dogs?.name ?? '',
      lesson: b.lesson_types?.label ?? '',
      option: b.lesson_option ?? '',
      field: b.fields?.name ?? '',
      trainer: b.trainers?.name ?? '',
      group: !!b.class_id,
    }));
  };
  const salesOf = async (f: string, t: string) => {
    const { data, error } = await admin
      .from('client_packages')
      .select('activated_at, name, lessons_total, price_cents, profiles(first_name, last_name)')
      .eq('status', 'active')
      .gte('activated_at', `${f}T00:00:00`)
      .lt('activated_at', `${t}T00:00:00`);
    if (error) throw error;
    // deno-lint-ignore no-explicit-any
    return (data ?? []).map((p: any): Sale => ({ activated_at: p.activated_at, client: fullName(p.profiles), name: p.name, lessons: p.lessons_total, price_cents: p.price_cents }));
  };
  const prev = prevMonth(month);
  const [lessons, sales, prevLessons, prevSales, docs, penalties, clients] = await Promise.all([
    lessonsOf(from, to),
    salesOf(from, to),
    lessonsOf(`${prev}-01`, from),
    salesOf(`${prev}-01`, from),
    admin.from('invoices').select('issued_on, kind, year, number, receipt_number, buyer_name, description, total_cents, status').gte('issued_on', from).lt('issued_on', to).order('issued_on'),
    admin.from('penalties').select('created_at, reason, dogs(name, profiles(first_name, last_name))').gte('created_at', `${from}T00:00:00`).lt('created_at', `${to}T00:00:00`).order('created_at'),
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'client').gte('created_at', `${from}T00:00:00`).lt('created_at', `${to}T00:00:00`),
  ]);
  return {
    centre,
    month,
    today,
    lessons,
    sales,
    // deno-lint-ignore no-explicit-any
    docs: (docs.data ?? []).map((x: any) => ({
      issued_on: x.issued_on,
      kind: x.kind,
      number: x.number ? `${x.number}/${x.year}` : (x.receipt_number ?? ''),
      client: x.buyer_name,
      description: x.description,
      total_cents: x.total_cents,
      status: x.status,
    })),
    // deno-lint-ignore no-explicit-any
    penalties: (penalties.data ?? []).map((p: any) => ({ created_at: p.created_at, client: fullName(p.dogs?.profiles), dog: p.dogs?.name ?? '', reason: p.reason })),
    newClients: clients.count ?? 0,
    previousCents: prevLessons.length || prevSales.length ? cashCents({ lessons: prevLessons, sales: prevSales }) : null,
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (!(await allowed(req))) return new Response('Non autorizzato', { status: 401 });
  // Dal cron: solo l'ultimo venerdì. Dall'app il proprietario lo chiede quando vuole.
  const fromCron = !!env('WEBHOOK_SECRET') && req.headers.get('x-webhook-secret') === env('WEBHOOK_SECRET');
  const today = romeDay();
  if (fromCron && !isLastFriday(today)) return json({ skipped: 'Non è l\'ultimo venerdì del mese' });

  try {
    const { data: s } = await admin.from('settings').select('field_name, license_code').eq('id', 1).maybeSingle();
    if (planOf(s?.license_code ?? '', today) !== 'pro') return json({ skipped: 'Il report mensile è nel piano Pro' }, fromCron ? 200 : 403);
    if (!env('RESEND_API_KEY') || !env('REPORT_FROM')) throw new Error('Mancano RESEND_API_KEY o REPORT_FROM nei Secrets di Supabase');

    const { data: owners } = await admin.from('profiles').select('email').eq('role', 'owner');
    const to = [...(owners ?? []).map((o) => o.email), ...env('REPORT_TO').split(',')].map((e) => e?.trim()).filter(Boolean);
    if (!to.length) throw new Error('Nessun indirizzo a cui mandare il report');

    const month = today.slice(0, 7);
    const data = await load(month, today, s?.field_name || 'Club Manager');
    const buffer = await buildReport(ExcelJS, data).xlsx.writeBuffer();
    let bin = '';
    new Uint8Array(buffer).forEach((b) => (bin += String.fromCharCode(b)));
    const title = monthTitle(month);
    const file = `Report-${title.replace(' ', '-').toLowerCase()}.xlsx`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env('REPORT_FROM'),
        to,
        subject: `${data.centre}: report di ${title.toLowerCase()}`,
        html:
          `<p>Ciao,</p><p>in allegato il report di ${title.toLowerCase()} di <b>${data.centre}</b>: lezioni, pacchetti, ` +
          `fatture e scontrini, statistiche del mese.</p><p>Totale incassato: <b>€ ${(cashCents(data) / 100).toLocaleString('it-IT', { minimumFractionDigits: 2 })}</b>.</p>` +
          `<p style="color:#5a675f">Club Manager</p>`,
        attachments: [{ filename: file, content: btoa(bin) }],
      }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    return json({ sent: true, to, month });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
