import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';

import { Badge, Button, Card, ErrorText, H1, Muted, Row, Screen, Stat } from '@/components/ui';
import { NewClass } from '@/components/new-class';
import { OwnerBook, type BookStart } from '@/components/owner-book';
import { WeekGrid } from '@/components/week-grid';
import { addDays, cap, dayKey, hm, longDay, monthShort, today } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useLessonColors } from '@/lib/lesson-colors';
import { mondayOf, ownerBookings, ownerClasses, type OwnerBooking, type OwnerClass } from '@/lib/owner';
import { usePlan } from '@/lib/plans';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';

export default function OwnerWeek() {
  const c = useColors();
  const { fields, settings } = useSession();
  const color = useLessonColors();
  const plan = usePlan();
  // Sul PC (finestra larga) la settimana è a colonne; sul telefono resta la lista dei giorni.
  const wide = useWindowDimensions().width >= 900;
  const [monday, setMonday] = useState(mondayOf(today()));
  const [rows, setRows] = useState<OwnerBooking[]>([]);
  const [open, setOpen] = useState<Record<string, number[]>>({});
  const [booking, setBooking] = useState<BookStart | null>(null);
  const [newClass, setNewClass] = useState<BookStart | null>(null);
  const [classes, setClasses] = useState<OwnerClass[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const from = dayKey(monday);
  const to = dayKey(addDays(monday, 6));
  const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(monday, i)));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, a, cl] = await Promise.all([
        ownerBookings(from, to),
        supabase.from('availability').select('field_id, day, slots').gte('day', from).lte('day', to),
        plan.groups ? ownerClasses(from, to) : Promise.resolve([]),
      ]);
      setRows(b);
      setClasses(cl);
      setOpen(Object.fromEntries(((a.data ?? []) as { field_id: string; day: string; slots: number[] }[]).map((r) => [`${r.field_id}|${r.day}`, r.slots])));
      setErr('');
    } catch (e) {
      setErr(errorText(e));
    }
    setLoading(false);
  }, [from, to, plan.groups]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const sunday = addDays(monday, 6);
  const todayKey = dayKey(today());

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <H1>
        {`${monday.getDate()} ${monthShort(monday)} – ${sunday.getDate()} ${monthShort(sunday)}`}
      </H1>
      <Row>
        <Button small kind="ghost" title={t('‹ Settimana prima')} onPress={() => setMonday(addDays(monday, -7))} />
        <Button small kind="ghost" title={t('Questa')} onPress={() => setMonday(mondayOf(today()))} />
        <Button small kind="ghost" title={t('Dopo ›')} onPress={() => setMonday(addDays(monday, 7))} />
      </Row>
      <Button
        title={t('+ Prenota per un cliente')}
        onPress={() => setBooking({ day: days.includes(todayKey) ? todayKey : from, start: settings?.open_min ?? 540 })}
      />
      {plan.groups && (
        <Button
          kind="ghost"
          title={t('+ Nuova classe di gruppo')}
          onPress={() => setNewClass({ day: days.includes(todayKey) ? todayKey : from, start: settings?.open_min ?? 540 })}
        />
      )}
      <Row>
        <Stat label={t('Lezioni')} value={rows.length} />
      </Row>
      <ErrorText>{err}</ErrorText>
      {wide && <WeekGrid days={days} rows={rows} classes={classes} open={open} onSlot={(day, fieldId, start) => setBooking({ day, fieldId, start })} />}
      <NewClass
        start={newClass}
        onClose={() => setNewClass(null)}
        onDone={() => {
          setNewClass(null);
          load();
        }}
      />
      <OwnerBook
        start={booking}
        onClose={() => setBooking(null)}
        onDone={() => {
          setBooking(null);
          load();
        }}
      />
      {!wide && days.map((k) => {
        const list = rows.filter((b) => b.day === k);
        // Una riga per le lezioni singole e una per ogni classe di gruppo.
        const dayClasses = classes.filter((cl) => cl.day === k);
        const lines = [
          ...list
            .filter((b) => !b.class_id || !dayClasses.some((cl) => cl.id === b.class_id))
            .map((b) => ({
              id: b.id,
              start: b.start_min,
              type: b.lesson_type,
              text: `${b.dogs?.name} · ${b.lesson_types?.label ?? b.lesson_type}${b.lesson_option ? ` ${b.lesson_option}` : ''}${b.fields && fields.length > 1 ? ` · ${b.fields.name}` : ''}${b.trainers ? ` · ${b.trainers.name}` : ''}`,
              done: !!b.checked_in_at,
            })),
          ...dayClasses.map((cl) => ({
            id: cl.id,
            start: cl.start_min,
            type: cl.lesson_type,
            text: `${t('Gruppo {n}/{posti}', { n: list.filter((b) => b.class_id === cl.id).length, posti: cl.seats })} · ${cl.lesson_types?.label ?? cl.lesson_type}${cl.lesson_option ? ` ${cl.lesson_option}` : ''}${cl.fields && fields.length > 1 ? ` · ${cl.fields.name}` : ''}${cl.trainers ? ` · ${cl.trainers.name}` : ''}`,
            done: false,
          })),
        ].sort((x, y) => x.start - y.start);
        return (
          <Pressable key={k} accessibilityRole="button" onPress={() => router.navigate({ pathname: '/', params: { day: k } })}>
            <Card accent={k === todayKey}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: c.text, fontSize: 16, fontWeight: '800' }}>{cap(longDay(k))}</Text>
                <Badge tone={lines.length ? 'ok' : 'neutral'}>{list.length ? (list.length === 1 ? t('1 lezione') : t('{n} lezioni', { n: list.length })) : lines.length ? t('Classi senza iscritti') : t('Libero')}</Badge>
              </Row>
              {lines.map((l) => (
                <View key={l.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: color(l.type).bar }} />
                  <Text style={{ color: c.text, fontWeight: '700', width: 48 }}>{hm(l.start)}</Text>
                  <Text style={{ color: c.text, flex: 1 }} numberOfLines={1}>
                    {l.text}
                  </Text>
                  {l.done && <Text style={{ color: c.accent, fontWeight: '800' }}>✓</Text>}
                </View>
              ))}
              {lines.length > 0 && <Muted style={{ fontSize: 12 }}>{t('Tocca per aprire il giorno')}</Muted>}
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}
