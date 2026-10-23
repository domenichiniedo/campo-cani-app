import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Card, Chips, ErrorText, H1, Muted, Row, Screen, Stat, Step } from '@/components/ui';
import { addDays, cap, dayKey, euro, longDay, monthName, today } from '@/lib/format';
import { t, tKey } from '@/lib/i18n';
import { mondayOf } from '@/lib/owner';
import { planWith, usePlan } from '@/lib/plans';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import type { Booking, ClientPackage } from '@/lib/types';

type Period = 'week' | 'month' | 'year';
type Line = Pick<Booking, 'id' | 'user_id' | 'day' | 'price_cents' | 'pay' | 'paid' | 'lesson_type' | 'field_id' | 'trainer_id' | 'checked_in_at' | 'status'>;
type Sold = Pick<ClientPackage, 'id' | 'name' | 'price_cents' | 'activated_at'>;

const PAY: Record<Booking['pay'], string> = { onsite: tKey('Al campo'), online: tKey('Online'), package: tKey('Pacchetto') };
const PAGE = 1000;

/** Primo e ultimo giorno del periodo che contiene il giorno dato. */
function range(p: Period, d: Date) {
  if (p === 'week') {
    const m = mondayOf(d);
    return { from: m, to: addDays(m, 6) };
  }
  if (p === 'month') return { from: new Date(d.getFullYear(), d.getMonth(), 1), to: new Date(d.getFullYear(), d.getMonth() + 1, 0) };
  return { from: new Date(d.getFullYear(), 0, 1), to: new Date(d.getFullYear(), 11, 31) };
}

function shift(p: Period, d: Date, n: number) {
  if (p === 'week') return addDays(d, 7 * n);
  if (p === 'month') return new Date(d.getFullYear(), d.getMonth() + n, 1);
  return new Date(d.getFullYear() + n, 0, 1);
}

function title(p: Period, from: Date, to: Date) {
  if (p === 'week') return `${from.getDate()} ${monthName(from.getMonth()).slice(0, 3)} – ${to.getDate()} ${monthName(to.getMonth()).slice(0, 3)} ${to.getFullYear()}`;
  if (p === 'month') return `${cap(monthName(from.getMonth()))} ${from.getFullYear()}`;
  return String(from.getFullYear());
}

/** Tutte le prenotazioni del periodo, a pagine: in un anno possono essere migliaia. */
async function bookingsBetween(from: string, to: string) {
  const all: Line[] = [];
  for (let i = 0; ; i += PAGE) {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, user_id, day, price_cents, pay, paid, lesson_type, field_id, trainer_id, checked_in_at, status')
      .gte('day', from)
      .lte('day', to)
      .order('day')
      .order('id')
      .range(i, i + PAGE - 1);
    if (error) throw error;
    all.push(...((data ?? []) as Line[]));
    if ((data ?? []).length < PAGE) return all;
  }
}

export default function OwnerStats() {
  const c = useColors();
  const { lessonTypes, fields, trainers } = useSession();
  const plan = usePlan();
  const [period, setPeriod] = useState<Period>('month');
  const [anchor, setAnchor] = useState(today());
  const [rows, setRows] = useState<Line[]>([]);
  const [sold, setSold] = useState<Sold[]>([]);
  const [pick, setPick] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const fromK = dayKey(range(period, anchor).from);
  const toK = dayKey(range(period, anchor).to);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, p] = await Promise.all([
        bookingsBetween(fromK, toK),
        supabase
          .from('client_packages')
          .select('id, name, price_cents, activated_at')
          .eq('status', 'active')
          .gte('activated_at', `${fromK}T00:00:00`)
          .lte('activated_at', `${toK}T23:59:59`),
      ]);
      if (p.error) throw p.error;
      setRows(b);
      setSold((p.data ?? []) as Sold[]);
      setErr('');
    } catch (e) {
      setErr(errorText(e));
    }
    setLoading(false);
  }, [fromK, toK]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const { from, to } = range(period, anchor);
  const todayK = dayKey(today());
  const active = rows.filter((b) => b.status === 'active');
  const cancelled = rows.length - active.length;
  const past = active.filter((b) => b.day <= todayK);
  const lessonsPaid = active.filter((b) => b.paid && b.pay !== 'package').reduce((s, b) => s + b.price_cents, 0);
  const packagesPaid = sold.reduce((s, p) => s + p.price_cents, 0);
  const toCollect = past.filter((b) => !b.paid).reduce((s, b) => s + b.price_cents, 0);
  const expected = active.filter((b) => b.day > todayK && !b.paid).reduce((s, b) => s + b.price_cents, 0);
  const arrived = past.filter((b) => b.checked_in_at).length;
  const clients = new Set(active.map((b) => b.user_id)).size;

  // Barre: un giorno per settimana e mese, un mese per l'anno. Pacchetti nel giorno in cui sono stati attivati.
  const byMonth = period === 'year';
  const buckets = byMonth
    ? Array.from({ length: 12 }, (_, i) => ({ key: `${from.getFullYear()}-${String(i + 1).padStart(2, '0')}`, label: cap(monthName(i).slice(0, 3)) }))
    : Array.from({ length: Math.round((to.getTime() - from.getTime()) / 86400000) + 1 }, (_, i) => {
        const d = addDays(from, i);
        return { key: dayKey(d), label: String(d.getDate()) };
      });
  const totals = new Map(buckets.map((b) => [b.key, 0]));
  const add = (day: string, cents: number) => {
    const k = byMonth ? day.slice(0, 7) : day;
    totals.set(k, (totals.get(k) ?? 0) + cents);
  };
  active.filter((b) => b.paid && b.pay !== 'package').forEach((b) => add(b.day, b.price_cents));
  sold.forEach((p) => p.activated_at && add(dayKey(new Date(p.activated_at)), p.price_cents));
  const values = buckets.map((b) => totals.get(b.key) ?? 0);
  const max = Math.max(1, ...values);
  const picked = pick !== null && pick < buckets.length ? pick : null;

  /** Lezioni e valore raggruppati per una colonna. */
  function group(key: (b: Line) => string, name: (k: string) => string) {
    const m = new Map<string, { n: number; cents: number }>();
    active.forEach((b) => {
      const k = key(b);
      const g = m.get(k) ?? { n: 0, cents: 0 };
      g.n++;
      g.cents += b.price_cents;
      m.set(k, g);
    });
    return [...m.entries()].map(([k, g]) => ({ label: name(k), ...g })).sort((a, b) => b.n - a.n);
  }

  const byPay = t('Per pagamento');
  const sections = [
    { title: t('Per tipo di lezione'), rows: group((b) => b.lesson_type, (k) => lessonTypes.find((lt) => lt.id === k)?.label ?? k) },
    fields.length > 1 && { title: t('Per campo'), rows: group((b) => b.field_id, (k) => fields.find((f) => f.id === k)?.name ?? t('Campo tolto')) },
    trainers.length > 0 && {
      title: t('Per trainer'),
      rows: group((b) => b.trainer_id ?? '', (k) => (k ? trainers.find((tr) => tr.id === k)?.name ?? t('Trainer tolto') : t('Da assegnare'))),
    },
    { title: byPay, rows: group((b) => b.pay, (k) => t(PAY[k as Booking['pay']] ?? k)) },
  ]
    .filter((s): s is { title: string; rows: ReturnType<typeof group> } => !!s && s.rows.length > 0)
    // Senza statistiche resta solo come sono state pagate le lezioni.
    .filter((s) => plan.stats || s.title === byPay);

  const setP = (p: Period) => {
    setPeriod(p);
    setPick(null);
  };
  const move = (n: number) => {
    setAnchor(shift(period, range(period, anchor).from, n));
    setPick(null);
  };

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <H1>{`${t('Incassi')} · ${title(period, from, to)}`}</H1>
      <Chips
        items={[
          { value: 'week', label: t('Settimana') },
          { value: 'month', label: t('Mese') },
          { value: 'year', label: t('Anno') },
        ]}
        value={period}
        onChange={setP}
      />
      <Row>
        <Button small kind="ghost" title={t('‹ Prima')} onPress={() => move(-1)} />
        <Button small kind="ghost" title={t('Adesso')} onPress={() => setAnchor(today())} />
        <Button small kind="ghost" title={t('Dopo ›')} onPress={() => move(1)} />
      </Row>
      <ErrorText>{err}</ErrorText>

      <Row>
        <Stat label={t('Incassato')} value={euro(lessonsPaid + packagesPaid)} />
        <Stat label={sold.length === 1 ? t('1 pacchetto venduto') : t('{n} pacchetti venduti', { n: sold.length })} value={euro(packagesPaid)} />
        <Stat label={t('Da incassare')} value={euro(toCollect)} />
        <Stat label={t('Previsto')} value={euro(expected)} />
      </Row>
      <Muted style={{ fontSize: 12 }}>
        {t('Incassato: lezioni pagate più pacchetti venduti. Da incassare: lezioni già fatte e non ancora pagate. Previsto: lezioni prenotate nei prossimi giorni.')}
      </Muted>

      {!plan.stats && (
        <Muted style={{ fontSize: 13 }}>{t('Grafico, presenze, disdette e ripartizioni per lezione, campo e trainer sono compresi dal piano {piano}.', { piano: planWith('stats') })}</Muted>
      )}

      {plan.stats && (
        <Card>
          <Text style={{ color: c.text, fontWeight: '800' }}>
            {picked !== null
              ? `${byMonth ? cap(monthName(picked)) : cap(longDay(buckets[picked].key))}: ${euro(values[picked])}`
              : byMonth ? t('Incassato per mese') : t('Incassato per giorno')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 2 }}>
            {values.map((v, i) => (
              <Pressable
                key={buckets[i].key}
                accessibilityRole="button"
                accessibilityLabel={`${buckets[i].label}: ${euro(v)}`}
                onPress={() => setPick(picked === i ? null : i)}
                onHoverIn={() => setPick(i)}
                style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
                <View
                  style={{
                    height: v ? Math.max(3, (v / max) * 140) : 1,
                    borderTopLeftRadius: 4,
                    borderTopRightRadius: 4,
                    backgroundColor: v ? c.accent : c.line,
                    opacity: picked === null || picked === i ? 1 : 0.45,
                  }}
                />
              </Pressable>
            ))}
          </View>
          <View style={{ height: 18, borderTopWidth: 1, borderTopColor: c.line }}>
            {buckets.map((b, i) =>
              byMonth || buckets.length <= 7 || i % 7 === 0 || i === buckets.length - 1 ? (
                <Text
                  key={b.key}
                  style={{ position: 'absolute', top: 3, left: `${((i + 0.5) / buckets.length) * 100}%`, width: 32, marginLeft: -16, textAlign: 'center', color: c.muted, fontSize: 10 }}>
                  {b.label}
                </Text>
              ) : null,
            )}
          </View>
          <Muted style={{ fontSize: 12 }}>{t("Tocca una barra per vedere l'importo.")}</Muted>
        </Card>
      )}

      {plan.stats && (
        <Row>
          <Stat label={t('Lezioni')} value={active.length} />
          <Stat label={t('Presenze')} value={past.length ? `${Math.round((arrived / past.length) * 100)}%` : '–'} />
          <Stat label={t('Disdette')} value={cancelled} />
          <Stat label={t('Clienti')} value={clients} />
        </Row>
      )}

      {sections.map((s) => {
        const top = Math.max(...s.rows.map((r) => r.n));
        return (
          <View key={s.title} style={{ gap: 10 }}>
            <Step title={s.title} />
            <Card>
              {s.rows.map((r) => (
                <View key={r.label} style={{ gap: 4 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text style={{ color: c.text, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                      {r.label}
                    </Text>
                    <Text style={{ color: c.muted }}>
                      {r.n === 1 ? t('1 lezione') : t('{n} lezioni', { n: r.n })}
                      {r.cents ? ` · ${euro(r.cents)}` : ''}
                    </Text>
                  </Row>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: c.line, overflow: 'hidden' }}>
                    <View style={{ width: `${(r.n / top) * 100}%`, height: '100%', borderRadius: 3, backgroundColor: c.accent }} />
                  </View>
                </View>
              ))}
            </Card>
          </View>
        );
      })}
      {!loading && active.length === 0 && <Muted>{t('Nessuna lezione in questo periodo.')}</Muted>}
    </Screen>
  );
}
