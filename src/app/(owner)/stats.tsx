import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Stars } from '@/components/lesson-rating';
import { Button, Card, Chips, ErrorText, H1, Muted, Row, Screen, Stat, Step } from '@/components/ui';
import { addDays, cap, dayKey, euro, longDay, monthName, today } from '@/lib/format';
import { locale, t, tKey } from '@/lib/i18n';
import { mondayOf } from '@/lib/owner';
import { planWith, usePlan } from '@/lib/plans';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import { fullName, type Booking, type ClientPackage, type LessonRating } from '@/lib/types';

type Period = 'week' | 'month' | 'year';
type Line = Pick<Booking, 'id' | 'user_id' | 'day' | 'price_cents' | 'pay' | 'paid' | 'lesson_type' | 'field_id' | 'trainer_id' | 'checked_in_at' | 'status'>;
type Sold = Pick<ClientPackage, 'id' | 'name' | 'price_cents' | 'activated_at'>;
type Vote = Pick<LessonRating, 'booking_id' | 'day' | 'score' | 'comment'> & {
  profiles: { first_name: string; last_name: string } | null;
  bookings: { dogs: { name: string } | null } | null;
};

const PAY: Record<Booking['pay'], string> = { onsite: tKey('Al campo'), online: tKey('Online'), package: tKey('Pacchetto'), transfer: tKey('Bonifico') };
const PAGE = 1000;
/** Commenti dei clienti mostrati prima di "Mostra tutti". */
const FEW = 5;

/** Media dei voti con una cifra decimale ("4,6"). */
const avg = (xs: number[]) => (xs.reduce((s, x) => s + x, 0) / xs.length).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });

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
  const [votes, setVotes] = useState<Vote[]>([]);
  // Tessere e quote campo incassate e spese del periodo (vuote se il database non le ha ancora).
  const [dues, setDues] = useState(0);
  const [spent, setSpent] = useState(0);
  const [allComments, setAllComments] = useState(false);
  const [pick, setPick] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const fromK = dayKey(range(period, anchor).from);
  const toK = dayKey(range(period, anchor).to);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, p, v, m, x] = await Promise.all([
        bookingsBetween(fromK, toK),
        supabase
          .from('client_packages')
          .select('id, name, price_cents, activated_at')
          .eq('status', 'active')
          .gte('activated_at', `${fromK}T00:00:00`)
          .lte('activated_at', `${toK}T23:59:59`),
        supabase
          .from('lesson_ratings')
          .select('booking_id, day, score, comment, profiles(first_name, last_name), bookings(dogs(name))')
          .gte('day', fromK)
          .lte('day', toK)
          .order('day', { ascending: false }),
        supabase
          .from('memberships')
          .select('price_cents')
          .eq('status', 'active')
          .gte('paid_at', `${fromK}T00:00:00`)
          .lte('paid_at', `${toK}T23:59:59`),
        supabase.from('expenses').select('amount_cents').gte('day', fromK).lte('day', toK),
      ]);
      setDues(((m.data ?? []) as { price_cents: number }[]).reduce((s, r) => s + r.price_cents, 0));
      setSpent(((x.data ?? []) as { amount_cents: number }[]).reduce((s, r) => s + r.amount_cents, 0));
      if (p.error) throw p.error;
      if (v.error) throw v.error;
      setRows(b);
      setSold((p.data ?? []) as Sold[]);
      setVotes((v.data ?? []) as unknown as Vote[]);
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
  const lessonOf = new Map(rows.map((b) => [b.id, b]));
  const comments = votes.filter((v) => v.comment);

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

  /** Voto medio raggruppato per una colonna della lezione votata. */
  function votesBy(key: (b: Line) => string, name: (k: string) => string) {
    const m = new Map<string, number[]>();
    votes.forEach((v) => {
      const b = lessonOf.get(v.booking_id);
      if (!b) return;
      const k = key(b);
      m.set(k, [...(m.get(k) ?? []), v.score]);
    });
    return [...m.entries()].map(([k, xs]) => ({ label: name(k), n: xs.length, mean: xs.reduce((s, x) => s + x, 0) / xs.length })).sort((a, b) => b.mean - a.mean || b.n - a.n);
  }
  const voteSections = plan.stats
    ? [
        trainers.length > 0 && {
          title: t('Voto per trainer'),
          rows: votesBy((b) => b.trainer_id ?? '', (k) => (k ? trainers.find((tr) => tr.id === k)?.name ?? t('Trainer tolto') : t('Da assegnare'))),
        },
        { title: t('Voto per tipo di lezione'), rows: votesBy((b) => b.lesson_type, (k) => lessonTypes.find((lt) => lt.id === k)?.label ?? k) },
      ].filter((s): s is { title: string; rows: ReturnType<typeof votesBy> } => !!s && s.rows.length > 0)
    : [];

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
        <Stat label={t('Incassato')} value={euro(lessonsPaid + packagesPaid + dues)} />
        <Stat label={sold.length === 1 ? t('1 pacchetto venduto') : t('{n} pacchetti venduti', { n: sold.length })} value={euro(packagesPaid)} />
        <Stat label={t('Da incassare')} value={euro(toCollect)} />
        <Stat label={t('Previsto')} value={euro(expected)} />
      </Row>
      <Row>
        {dues > 0 && <Stat label={t('Tessere e quote')} value={euro(dues)} />}
        <Stat label={t('Uscite')} value={euro(spent)} />
        <Stat label={t('Saldo')} value={euro(lessonsPaid + packagesPaid + dues - spent)} />
      </Row>
      <Muted style={{ fontSize: 12 }}>
        {t('Incassato: lezioni pagate, pacchetti venduti, tessere e quote campo. Da incassare: lezioni già fatte e non ancora pagate. Previsto: lezioni prenotate nei prossimi giorni. Saldo: incassato meno le uscite segnate in Spese.')}
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

      <Step title={t('Gradimento dei clienti')} />
      {votes.length === 0 ? (
        <Muted>{t('Nessun voto dei clienti in questo periodo. I clienti votano le lezioni fatte da «Le mie lezioni».')}</Muted>
      ) : (
        <>
          <Row>
            <Stat label={t('Voto medio')} value={`${avg(votes.map((v) => v.score))} / 5`} />
            <Stat label={t('Voti ricevuti')} value={votes.length} />
            {plan.stats && active.length > 0 && <Stat label={t('Lezioni votate')} value={`${Math.round((votes.length / active.length) * 100)}%`} />}
          </Row>
          {plan.stats && (
            <Card>
              {[5, 4, 3, 2, 1].map((n) => {
                const k = votes.filter((v) => v.score === n).length;
                return (
                  <Row key={n} style={{ flexWrap: 'nowrap' }}>
                    <Stars score={n} size={13} />
                    <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: c.line, overflow: 'hidden' }}>
                      <View style={{ width: `${(k / votes.length) * 100}%`, height: '100%', borderRadius: 3, backgroundColor: c.brass }} />
                    </View>
                    <Text style={{ color: c.muted, width: 28, textAlign: 'right' }}>{k}</Text>
                  </Row>
                );
              })}
            </Card>
          )}
          {voteSections.map((s) => (
            <View key={s.title} style={{ gap: 10 }}>
              <Step title={s.title} />
              <Card>
                {s.rows.map((r) => (
                  <Row key={r.label} style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                    <Text style={{ color: c.text, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                      {r.label}
                    </Text>
                    <Stars score={r.mean} size={13} />
                    <Text style={{ color: c.muted }}>
                      {`${avg([r.mean])} · ${r.n === 1 ? t('1 voto') : t('{n} voti', { n: r.n })}`}
                    </Text>
                  </Row>
                ))}
              </Card>
            </View>
          ))}
          {comments.length > 0 && (
            <View style={{ gap: 10 }}>
              <Step title={t('Commenti dei clienti')} />
              {(allComments ? comments : comments.slice(0, FEW)).map((v) => {
                const b = lessonOf.get(v.booking_id);
                const trainer = trainers.find((tr) => tr.id === b?.trainer_id);
                const lesson = lessonTypes.find((lt) => lt.id === b?.lesson_type)?.label ?? b?.lesson_type;
                return (
                  <Card key={v.booking_id}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text style={{ color: c.text, fontWeight: '700' }}>
                        {fullName(v.profiles)}
                        {v.bookings?.dogs?.name ? ` · ${v.bookings.dogs.name}` : ''}
                      </Text>
                      <Stars score={v.score} />
                    </Row>
                    <Muted style={{ fontSize: 13 }}>{[longDay(v.day), lesson, trainer?.name].filter(Boolean).join(' · ')}</Muted>
                    <Text style={{ color: c.text }}>{v.comment}</Text>
                  </Card>
                );
              })}
              {comments.length > FEW && (
                <Button
                  small
                  kind="ghost"
                  title={allComments ? t('Mostra meno') : t('Mostra tutti i {n} commenti', { n: comments.length })}
                  onPress={() => setAllComments(!allComments)}
                />
              )}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}
