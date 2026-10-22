import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Badge, Button, Card, ErrorText, H1, Muted, Row, Screen, Stat } from '@/components/ui';
import { addDays, cap, dayKey, euro, hm, longDay, monthShort, today } from '@/lib/format';
import { mondayOf, ownerBookings, type OwnerBooking } from '@/lib/owner';
import { useSession } from '@/lib/session';
import { errorText } from '@/lib/supabase';
import { useColors } from '@/lib/theme';

export default function OwnerWeek() {
  const c = useColors();
  const { fields } = useSession();
  const [monday, setMonday] = useState(mondayOf(today()));
  const [rows, setRows] = useState<OwnerBooking[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const from = dayKey(monday);
  const to = dayKey(addDays(monday, 6));
  const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(monday, i)));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await ownerBookings(from, to));
      setErr('');
    } catch (e) {
      setErr(errorText(e));
    }
    setLoading(false);
  }, [from, to]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const sunday = addDays(monday, 6);
  const revenue = rows.reduce((s, b) => s + b.price_cents, 0);
  const todayKey = dayKey(today());

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <H1>
        {`${monday.getDate()} ${monthShort(monday)} – ${sunday.getDate()} ${monthShort(sunday)}`}
      </H1>
      <Row>
        <Button small kind="ghost" title="‹ Settimana prima" onPress={() => setMonday(addDays(monday, -7))} />
        <Button small kind="ghost" title="Questa" onPress={() => setMonday(mondayOf(today()))} />
        <Button small kind="ghost" title="Dopo ›" onPress={() => setMonday(addDays(monday, 7))} />
      </Row>
      <Row>
        <Stat label="Lezioni" value={rows.length} />
        <Stat label="Valore" value={euro(revenue)} />
      </Row>
      <ErrorText>{err}</ErrorText>
      {days.map((k) => {
        const list = rows.filter((b) => b.day === k);
        return (
          <Pressable key={k} accessibilityRole="button" onPress={() => router.navigate({ pathname: '/', params: { day: k } })}>
            <Card accent={k === todayKey}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: c.text, fontSize: 16, fontWeight: '800' }}>{cap(longDay(k))}</Text>
                <Badge tone={list.length ? 'ok' : 'neutral'}>{list.length ? `${list.length} lezioni` : 'Libero'}</Badge>
              </Row>
              {list.map((b) => (
                <View key={b.id} style={{ flexDirection: 'row', gap: 10 }}>
                  <Text style={{ color: c.text, fontWeight: '700', width: 48 }}>{hm(b.start_min)}</Text>
                  <Text style={{ color: c.text, flex: 1 }} numberOfLines={1}>
                    {b.dogs?.name} · {b.lesson_types?.label ?? b.lesson_type}
                    {b.lesson_option ? ` ${b.lesson_option}` : ''}
                    {b.fields && fields.length > 1 ? ` · ${b.fields.name}` : ''}
                    {b.trainers ? ` · ${b.trainers.name}` : ''}
                  </Text>
                  {b.checked_in_at && <Text style={{ color: c.accent, fontWeight: '800' }}>✓</Text>}
                </View>
              ))}
              {list.length > 0 && <Muted style={{ fontSize: 12 }}>Tocca per aprire il giorno</Muted>}
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}
