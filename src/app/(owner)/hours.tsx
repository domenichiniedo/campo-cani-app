import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Button, Card, ErrorText, H1, Muted, Row, Screen, Step } from '@/components/ui';
import { addDays, cap, dayKey, fromKey, hm, longDay, monthShort, STEP, today, weekdayShort } from '@/lib/format';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';

const DAYS_AHEAD = 56;

export default function OwnerHours() {
  const c = useColors();
  const { settings } = useSession();
  const [open, setOpen] = useState<Record<string, number[]>>({});
  const [booked, setBooked] = useState<Record<string, number[]>>({});
  const [day, setDay] = useState(dayKey(today()));
  const [draft, setDraft] = useState<number[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const from = dayKey(today());
  const to = dayKey(addDays(today(), DAYS_AHEAD - 1));
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => dayKey(addDays(today(), i)));

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('availability').select('*').gte('day', from).lte('day', to),
      supabase.from('bookings').select('day, start_min, dur_min').eq('status', 'active').gte('day', from).lte('day', to),
    ]);
    setOpen(Object.fromEntries(((a.data ?? []) as { day: string; slots: number[] }[]).map((r) => [r.day, r.slots])));
    const taken: Record<string, number[]> = {};
    for (const r of (b.data ?? []) as { day: string; start_min: number; dur_min: number }[])
      for (let m = r.start_min; m < r.start_min + r.dur_min; m += STEP) (taken[r.day] ??= []).push(m);
    setBooked(taken);
  }, [from, to]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!settings) return null;
  const grid: number[] = [];
  for (let m = settings.open_min; m < settings.close_min; m += STEP) grid.push(m);

  const current = draft ?? open[day] ?? [];
  const takenNow = booked[day] ?? [];
  const pick = (k: string) => {
    setDay(k);
    setDraft(null);
    setMsg('');
  };
  const toggle = (m: number) => {
    const set = new Set(current);
    if (set.has(m)) set.delete(m);
    else set.add(m);
    setDraft([...set].sort((a, b) => a - b));
    setMsg('');
  };

  async function save(targets: string[], slots: number[]) {
    setErr('');
    setSaving(true);
    const { error } = await supabase.from('availability').upsert(targets.map((d) => ({ day: d, slots })));
    setSaving(false);
    if (error) return setErr(errorText(error));
    setDraft(null);
    setMsg(targets.length > 1 ? `Orari copiati su ${targets.length} giorni.` : 'Orari salvati.');
    load();
  }

  const sameWeekdayNext = [1, 2, 3, 4].map((w) => dayKey(addDays(fromKey(day), 7 * w)));

  return (
    <Screen>
      <H1>Orari di apertura</H1>
      <Muted>
        Scegli un giorno e tocca le mezz&apos;ore per aprirle o chiuderle. I clienti vedono solo quelle aperte. Le mezz&apos;ore già prenotate
        sono segnate in oro.
      </Muted>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {days.map((k) => {
          const d = fromKey(k);
          const on = k === day;
          const n = (open[k] ?? []).length;
          return (
            <Pressable
              key={k}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => pick(k)}
              style={{
                width: 58,
                paddingVertical: 8,
                alignItems: 'center',
                borderRadius: 8,
                borderWidth: 1,
                borderColor: on ? c.pitch : c.line,
                backgroundColor: on ? c.pitch : c.surface,
              }}>
              <Text style={{ color: on ? c.onPitchMuted : c.muted, fontSize: 12, fontWeight: '700' }}>{weekdayShort(d)}</Text>
              <Text style={{ color: on ? c.onPitch : c.text, fontSize: 20, fontWeight: '800' }}>{d.getDate()}</Text>
              <Text style={{ color: on ? c.onPitchMuted : c.muted, fontSize: 11 }}>{monthShort(d)}</Text>
              <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 3, backgroundColor: n ? c.accent : 'transparent' }} />
            </Pressable>
          );
        })}
      </ScrollView>

      <Step title={cap(longDay(day))} />
      <Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {grid.map((m) => {
            const on = current.includes(m);
            const taken = takenNow.includes(m);
            return (
              <Pressable
                key={m}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => toggle(m)}
                style={{
                  width: 66,
                  paddingVertical: 9,
                  alignItems: 'center',
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: taken ? c.brass : on ? c.accent : c.line,
                  backgroundColor: taken ? c.brassSoft : on ? c.accentSoft : c.off,
                }}>
                <Text style={{ color: taken ? c.brassText : on ? c.accent : c.offText, fontWeight: '700' }}>{hm(m)}</Text>
              </Pressable>
            );
          })}
        </View>
        <Row>
          <Button small kind="ghost" title="Apri tutto" onPress={() => setDraft(grid)} />
          <Button small kind="ghost" title="Chiudi tutto" onPress={() => setDraft([])} />
        </Row>
        <ErrorText>{err}</ErrorText>
        {!!msg && <Muted>{msg}</Muted>}
        <Button title="Salva questo giorno" onPress={() => save([day], current)} loading={saving} disabled={!draft} />
        <Button
          kind="ghost"
          title={`Copia sui prossimi 4 ${longDay(day).split(' ')[0]}`}
          onPress={() => save([day, ...sameWeekdayNext], current)}
        />
      </Card>
      <Muted style={{ fontSize: 13 }}>
        La griglia va dalle {hm(settings.open_min)} alle {hm(settings.close_min)}: puoi cambiarla in Impostazioni. Chiudere una mezz&apos;ora non
        cancella le prenotazioni già fatte.
      </Muted>
    </Screen>
  );
}
