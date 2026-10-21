import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { Badge, Body, Card, ConfirmButton, ErrorText, H1, Muted, Row, Screen, Step } from '@/components/ui';
import { dayKey, euro, hm, longDay, slotDate, today } from '@/lib/format';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import type { Booking } from '@/lib/types';

type BookingRow = Booking & { dogs: { name: string } | null; lesson_types: { label: string } | null };

export default function MyBookings() {
  const { profile, settings } = useSession();
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase
      .from('bookings')
      .select('*, dogs(name), lesson_types(label)')
      .eq('user_id', profile.id)
      .eq('status', 'active')
      .gte('day', dayKey(today()))
      .order('day')
      .order('start_min');
    setRows((data ?? []) as BookingRow[]);
    setNow(Date.now());
    setLoading(false);
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const limitMs = (settings?.cancel_hours ?? 0) * 3600_000;

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <H1>Le mie lezioni</H1>
      <ErrorText>{err}</ErrorText>
      {rows.length === 0 && !loading && <Muted>Non hai lezioni in programma.</Muted>}
      {rows.map((b) => {
        const startsAt = slotDate(b.day, b.start_min);
        const canCancel = startsAt.getTime() - now >= limitMs;
        return (
          <Card key={b.id}>
            <Step title={`${longDay(b.day)} · ${hm(b.start_min)}`} />
            <Body bold>
              {b.lesson_types?.label ?? b.lesson_type}
              {b.lesson_option ? ` · ${b.lesson_option}` : ''} per {b.dogs?.name}
            </Body>
            <Row>
              <Badge>{`${b.dur_min} min`}</Badge>
              <Badge tone={b.paid ? 'ok' : 'warn'}>{b.paid ? 'Pagato' : b.pay === 'online' ? 'Online' : `Al campo ${euro(b.price_cents)}`}</Badge>
              {b.checked_in_at && <Badge tone="ok">Entrato</Badge>}
            </Row>
            {canCancel ? (
              <ConfirmButton
                title="Disdici"
                onConfirm={async () => {
                  setErr('');
                  const { error } = await supabase.rpc('cancel_booking', { p_id: b.id });
                  if (error) setErr(errorText(error));
                  load();
                }}
              />
            ) : (
              <Muted style={{ fontSize: 13 }}>Non si può più disdire online: chiama il campo.</Muted>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}
