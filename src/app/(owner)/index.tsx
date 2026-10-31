import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';

import { useAddLesson } from '@/components/add-lesson';
import { OwnerBookingCard } from '@/components/booking-card';
import { ClassCard } from '@/components/class-card';
import { Button, Chips, ErrorText, H1, Muted, Row, Screen, Stat } from '@/components/ui';
import { addDays, cap, dayKey, euro, fromKey, isDayKey, longDay, today } from '@/lib/format';
import { t } from '@/lib/i18n';
import { ownerBookings, ownerClasses, type OwnerBooking, type OwnerClass } from '@/lib/owner';
import { usePlan } from '@/lib/plans';
import { useSession } from '@/lib/session';
import { errorText } from '@/lib/supabase';

export default function OwnerDay() {
  const params = useLocalSearchParams<{ day?: string }>();
  // Il giorno sta nell'indirizzo, così la Settimana può aprire un giorno preciso.
  const day = params.day && isDayKey(params.day) ? params.day : dayKey(today());
  const setDay = (k: string) => router.setParams({ day: k });
  const { fields, trainers, lessonTypes } = useSession();
  const plan = usePlan();
  const [classes, setClasses] = useState<OwnerClass[]>([]);
  const [fieldFilter, setFieldFilter] = useState('');
  const [rows, setRows] = useState<OwnerBooking[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, cl] = await Promise.all([ownerBookings(day, day), plan.groups ? ownerClasses(day, day) : Promise.resolve([])]);
      setRows(b);
      setClasses(cl);
      setErr('');
    } catch (e) {
      setErr(errorText(e));
    }
    setLoading(false);
  }, [day, plan.groups]);
  const add = useAddLesson(load);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const move = (n: number) => setDay(dayKey(addDays(fromKey(day), n)));
  const shown = fieldFilter ? rows.filter((b) => b.field_id === fieldFilter) : rows;
  const shownClasses = fieldFilter ? classes.filter((cl) => cl.field_id === fieldFilter) : classes;
  // Lezioni singole e classi di gruppo in ordine di orario; i cani di una classe stanno dentro la sua scheda.
  const items = [
    ...shown.filter((b) => !b.class_id || !classes.some((cl) => cl.id === b.class_id)).map((b) => ({ start: b.start_min, b, cl: null })),
    ...shownClasses.map((cl) => ({ start: cl.start_min, b: null, cl })),
  ].sort((x, y) => x.start - y.start);
  const unassigned = shown.filter((b) => !b.class_id && !b.trainer_id && !lessonTypes.find((lt) => lt.id === b.lesson_type)?.free_field).length + shownClasses.filter((cl) => !cl.trainer_id).length;
  const arrived = rows.filter((b) => b.checked_in_at).length;
  const toCollect = rows.filter((b) => !b.paid).reduce((s, b) => s + b.price_cents, 0);

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <H1>{cap(longDay(day))}</H1>
      <Row>
        <Button small kind="ghost" title={t('‹ Prima')} onPress={() => move(-1)} />
        <Button small kind="ghost" title={t('Oggi')} onPress={() => setDay(dayKey(today()))} />
        <Button small kind="ghost" title={t('Dopo ›')} onPress={() => move(1)} />
      </Row>
      {add.buttons(day, fieldFilter || undefined)}
      <Row>
        <Stat label={t('Lezioni')} value={rows.length} />
        <Stat label={t('Entrati')} value={`${arrived}/${rows.length}`} />
        {plan.payments && <Stat label={t('Da incassare')} value={euro(toCollect)} />}
      </Row>
      {fields.length > 1 && (
        <Chips
          items={[{ value: '', label: t('Tutti i campi') }, ...fields.map((f) => ({ value: f.id, label: f.name }))]}
          value={fieldFilter}
          onChange={setFieldFilter}
        />
      )}
      {trainers.length > 0 && unassigned > 0 && (
        <Muted>{unassigned === 1 ? t('1 lezione senza trainer.') : t('{n} lezioni senza trainer.', { n: unassigned })}</Muted>
      )}
      <ErrorText>{err}</ErrorText>
      {items.length === 0 && !loading && <Muted>{t('Nessuna lezione prenotata.')}</Muted>}
      {items.map(({ b, cl }) =>
        cl ? (
          <ClassCard
            key={cl.id}
            cls={cl}
            dogs={rows.filter((x) => x.class_id === cl.id)}
            onChange={load}
            onAdd={() => add.book({ day, start: cl.start_min, cls: cl })}
            showField={fields.length > 1}
          />
        ) : (
          <OwnerBookingCard key={b!.id} b={b!} onChange={load} showField={fields.length > 1} />
        ),
      )}
      {add.dialogs}
    </Screen>
  );
}
