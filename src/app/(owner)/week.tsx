import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import { useAddLesson } from '@/components/add-lesson';
import { Button, ErrorText, H1, Row, Screen, Stat } from '@/components/ui';
import { WeekGrid } from '@/components/week-grid';
import { addDays, dayKey, monthShort, today } from '@/lib/format';
import { t } from '@/lib/i18n';
import { mondayOf, ownerBookings, ownerClasses, type OwnerBooking, type OwnerClass } from '@/lib/owner';
import { usePlan } from '@/lib/plans';
import { errorText, supabase } from '@/lib/supabase';

export default function OwnerWeek() {
  const plan = usePlan();
  // La settimana è sempre a griglia; sul telefono (finestra stretta) i giorni si scorrono di lato.
  const wide = useWindowDimensions().width >= 900;
  const [monday, setMonday] = useState(mondayOf(today()));
  const [rows, setRows] = useState<OwnerBooking[]>([]);
  const [open, setOpen] = useState<Record<string, number[]>>({});
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
  const add = useAddLesson(load);

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
      {add.buttons(days.includes(todayKey) ? todayKey : from)}
      <Row>
        <Stat label={t('Lezioni')} value={rows.length} />
      </Row>
      <ErrorText>{err}</ErrorText>
      <WeekGrid narrow={!wide} days={days} rows={rows} classes={classes} open={open} onSlot={(day, fieldId, start) => add.book({ day, fieldId, start })} />
      {add.dialogs}
    </Screen>
  );
}
