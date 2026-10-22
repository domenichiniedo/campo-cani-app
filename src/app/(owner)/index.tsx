import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';

import { OwnerBookingCard } from '@/components/booking-card';
import { Button, Chips, ErrorText, H1, Muted, Row, Screen, Stat } from '@/components/ui';
import { addDays, cap, dayKey, euro, fromKey, isDayKey, longDay, today } from '@/lib/format';
import { ownerBookings, type OwnerBooking } from '@/lib/owner';
import { useSession } from '@/lib/session';
import { errorText } from '@/lib/supabase';

export default function OwnerDay() {
  const params = useLocalSearchParams<{ day?: string }>();
  // Il giorno sta nell'indirizzo, così la Settimana può aprire un giorno preciso.
  const day = params.day && isDayKey(params.day) ? params.day : dayKey(today());
  const setDay = (k: string) => router.setParams({ day: k });
  const { fields, trainers } = useSession();
  const [fieldFilter, setFieldFilter] = useState('');
  const [rows, setRows] = useState<OwnerBooking[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await ownerBookings(day, day));
      setErr('');
    } catch (e) {
      setErr(errorText(e));
    }
    setLoading(false);
  }, [day]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const move = (n: number) => setDay(dayKey(addDays(fromKey(day), n)));
  const shown = fieldFilter ? rows.filter((b) => b.field_id === fieldFilter) : rows;
  const unassigned = shown.filter((b) => !b.trainer_id).length;
  const arrived = rows.filter((b) => b.checked_in_at).length;
  const toCollect = rows.filter((b) => !b.paid).reduce((s, b) => s + b.price_cents, 0);

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <H1>{cap(longDay(day))}</H1>
      <Row>
        <Button small kind="ghost" title="‹ Prima" onPress={() => move(-1)} />
        <Button small kind="ghost" title="Oggi" onPress={() => setDay(dayKey(today()))} />
        <Button small kind="ghost" title="Dopo ›" onPress={() => move(1)} />
      </Row>
      <Row>
        <Stat label="Lezioni" value={rows.length} />
        <Stat label="Entrati" value={`${arrived}/${rows.length}`} />
        <Stat label="Da incassare" value={euro(toCollect)} />
      </Row>
      {fields.length > 1 && (
        <Chips
          items={[{ value: '', label: 'Tutti i campi' }, ...fields.map((f) => ({ value: f.id, label: f.name }))]}
          value={fieldFilter}
          onChange={setFieldFilter}
        />
      )}
      {trainers.length > 0 && unassigned > 0 && (
        <Muted>{unassigned === 1 ? '1 lezione senza trainer.' : `${unassigned} lezioni senza trainer.`}</Muted>
      )}
      <ErrorText>{err}</ErrorText>
      {shown.length === 0 && !loading && <Muted>Nessuna lezione prenotata.</Muted>}
      {shown.map((b) => (
        <OwnerBookingCard key={b.id} b={b} onChange={load} showField={fields.length > 1} />
      ))}
    </Screen>
  );
}
