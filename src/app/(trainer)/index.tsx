import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { NoteEditor, type NoteTarget } from '@/components/dog-diary';
import { Badge, Body, Button, Card, ErrorText, H1, Muted, Row, Screen, Stat } from '@/components/ui';
import { addDays, cap, dayKey, fromKey, hm, longDay, timeOf, today } from '@/lib/format';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import { fullName, type Booking } from '@/lib/types';

type Lesson = Booking & {
  profiles: { first_name: string; last_name: string; phone: string } | null;
  dogs: { name: string; breed: string; blocked: boolean } | null;
  lesson_types: { label: string } | null;
  fields: { name: string } | null;
  // Un solo diario per lezione: a seconda del server arriva come oggetto o come lista.
  dog_notes: { id: string } | { id: string }[] | null;
};

/** Le lezioni del trainer, giorno per giorno: fa entrare il cane e scrive il diario. */
export default function TrainerLessons() {
  const c = useColors();
  const { myTrainer, fields } = useSession();
  const [day, setDay] = useState(dayKey(today()));
  const [rows, setRows] = useState<Lesson[]>([]);
  const [note, setNote] = useState<NoteTarget | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!myTrainer) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('bookings')
      .select('*, profiles(first_name, last_name, phone), dogs(name, breed, blocked), lesson_types(label), fields(name), dog_notes(id)')
      .eq('trainer_id', myTrainer.id)
      .eq('status', 'active')
      .eq('day', day)
      .order('start_min');
    setErr(error ? errorText(error) : '');
    setRows((data ?? []) as Lesson[]);
    setLoading(false);
  }, [day, myTrainer]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!myTrainer) {
    return (
      <Screen>
        <H1>Le mie lezioni</H1>
        <Body>Il tuo account non è ancora collegato a un trainer. Chiedi al centro di collegarlo con la tua email.</Body>
      </Screen>
    );
  }

  const isToday = day === dayKey(today());
  const move = (n: number) => setDay(dayKey(addDays(fromKey(day), n)));
  const arrived = rows.filter((b) => b.checked_in_at).length;

  async function checkIn(b: Lesson) {
    setErr('');
    setBusy(b.id);
    const { error } = await supabase.rpc('trainer_check_in', { p_booking: b.id, p_in: !b.checked_in_at });
    setBusy(null);
    if (error) setErr(errorText(error));
    load();
  }

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
      </Row>
      <ErrorText>{err}</ErrorText>
      {!loading && rows.length === 0 && <Muted>Nessuna lezione con te in questo giorno.</Muted>}
      {rows.map((b) => {
        const lesson = `${b.lesson_types?.label ?? b.lesson_type}${b.lesson_option ? ` · ${b.lesson_option}` : ''}`;
        return (
          <Card key={b.id} style={b.checked_in_at ? { borderLeftWidth: 4, borderLeftColor: c.accent } : undefined}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ color: c.text, fontSize: 20, fontWeight: '800' }}>
                {hm(b.start_min)}
                <Text style={{ color: c.muted, fontSize: 14, fontWeight: '600' }}> – {hm(b.start_min + b.dur_min)}</Text>
              </Text>
              <Row>
                {fields.length > 1 && b.fields && <Badge>{b.fields.name}</Badge>}
                {b.checked_in_at && <Badge tone="ok">{`Entrato ${timeOf(b.checked_in_at)}`}</Badge>}
                {b.dogs?.blocked && <Badge tone="bad">Sospeso</Badge>}
              </Row>
            </Row>
            <View style={{ gap: 2 }}>
              <Body bold>
                {b.dogs?.name}
                {b.dogs?.breed ? ` (${b.dogs.breed})` : ''}
              </Body>
              <Muted>{lesson}</Muted>
              <Muted>
                {fullName(b.profiles)} · {b.profiles?.phone}
              </Muted>
            </View>
            <Row>
              {isToday && (
                <Button
                  small
                  kind={b.checked_in_at ? 'ghost' : 'primary'}
                  title={b.checked_in_at ? 'Annulla ingresso' : 'Fai entrare in campo'}
                  loading={busy === b.id}
                  disabled={!b.checked_in_at && !!b.dogs?.blocked}
                  onPress={() => checkIn(b)}
                />
              )}
              <Button
                small
                kind="ghost"
                title={(Array.isArray(b.dog_notes) ? b.dog_notes.length > 0 : !!b.dog_notes) ? 'Diario ✓' : 'Scrivi il diario'}
                onPress={() => setNote({ bookingId: b.id, dogId: b.dog_id, dogName: b.dogs?.name ?? '', day: b.day, lesson })}
              />
            </Row>
          </Card>
        );
      })}
      {!isToday && rows.length > 0 && <Muted style={{ fontSize: 13 }}>Il cane si fa entrare in campo il giorno della lezione.</Muted>}
      <NoteEditor
        target={note}
        onClose={() => {
          setNote(null);
          load();
        }}
      />
    </Screen>
  );
}
