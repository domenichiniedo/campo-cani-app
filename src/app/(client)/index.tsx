import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Badge, Body, Button, Card, Chips, ErrorText, H1, Muted, Row, Screen, Step } from '@/components/ui';
import { addDays, dayKey, euro, fromKey, hm, longDay, monthShort, today, weekdayShort } from '@/lib/format';
import { useSession } from '@/lib/session';
import { startsFor } from '@/lib/slots';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import type { BusySlot, Dog } from '@/lib/types';

const DAYS_AHEAD = 21;

export default function Book() {
  const c = useColors();
  const { profile, settings, lessonTypes } = useSession();
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [open, setOpen] = useState<Record<string, number[]>>({});
  const [busy, setBusy] = useState<BusySlot[]>([]);
  const [loading, setLoading] = useState(false);

  const [dogId, setDogId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [option, setOption] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [start, setStart] = useState<number | null>(null);
  const [pay, setPay] = useState<'onsite' | 'online'>('onsite');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<string | null>(null);

  const days = useMemo(() => Array.from({ length: DAYS_AHEAD }, (_, i) => dayKey(addDays(today(), i))), []);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const from = days[0], to = days[days.length - 1];
    const [d, a, b] = await Promise.all([
      supabase.from('dogs').select('*').eq('owner_id', profile.id).eq('archived', false).order('name'),
      supabase.from('availability').select('*').gte('day', from).lte('day', to),
      supabase.rpc('busy_slots', { from_day: from, to_day: to }),
    ]);
    const list = (d.data ?? []) as Dog[];
    setDogs(list);
    setDogId((cur) => cur ?? list.find((x) => !x.blocked)?.id ?? null);
    setOpen(Object.fromEntries(((a.data ?? []) as { day: string; slots: number[] }[]).map((r) => [r.day, r.slots])));
    setBusy((b.data ?? []) as BusySlot[]);
    setLoading(false);
  }, [profile, days]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const type = lessonTypes.find((t) => t.id === typeId) ?? null;
  const dog = dogs.find((d) => d.id === dogId) ?? null;
  const starts = day && type ? startsFor(day, open[day] ?? [], busy, type.duration_min) : [];
  const openDays = days.filter((k) => type && startsFor(k, open[k] ?? [], busy, type.duration_min).some((s) => s.state === 'free'));
  const ready = !!(dog && !dog.blocked && type && (!type.options.length || option) && day && start != null);

  async function confirm() {
    if (!ready || !type || !day || start == null || !dog) return;
    setErr('');
    setSaving(true);
    const { error } = await supabase.rpc('book_slot', {
      p_dog: dog.id,
      p_type: type.id,
      p_option: option ?? '',
      p_day: day,
      p_start: start,
      p_pay: pay,
    });
    setSaving(false);
    if (error) {
      setErr(errorText(error));
      load();
      return;
    }
    setDone(`${type.label}${option ? ` · ${option}` : ''} per ${dog.name}, ${longDay(day)} alle ${hm(start)}.`);
    setStart(null);
    load();
  }

  if (done) {
    return (
      <Screen>
        <H1>Prenotato</H1>
        <Card accent>
          <Body bold>{done}</Body>
          <Muted>
            {pay === 'onsite' ? 'Paghi al campo.' : 'Pagamento online registrato.'} Puoi disdire fino a {settings?.cancel_hours ?? 0} ore prima
            da &quot;Le mie lezioni&quot;.
          </Muted>
        </Card>
        <Button title="Vedi le mie lezioni" onPress={() => { setDone(null); router.push('/bookings'); }} />
        <Button title="Prenota un'altra lezione" kind="ghost" onPress={() => setDone(null)} />
      </Screen>
    );
  }

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <H1>Prenota il campo</H1>

      <Step n="1" title="Cane" />
      {dogs.length ? (
        <Chips
          items={dogs.map((d) => ({ value: d.id, label: d.blocked ? `${d.name} (sospeso)` : d.name, disabled: d.blocked }))}
          value={dogId}
          onChange={setDogId}
        />
      ) : (
        <Muted>Aggiungi un cane dal Profilo per poter prenotare.</Muted>
      )}
      {dogs.some((d) => d.blocked) && (
        <Muted>Un cane sospeso per penalità non può essere prenotato finché il campo non lo riattiva.</Muted>
      )}

      <Step n="2" title="Lezione" />
      <View style={{ gap: 10 }}>
        {lessonTypes.map((t) => {
          const on = t.id === typeId;
          return (
            <Pressable
              key={t.id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => {
                setTypeId(t.id);
                setOption(null);
                setStart(null);
              }}
              style={{
                borderWidth: on ? 2 : 1,
                borderColor: on ? c.accent : c.line,
                backgroundColor: on ? c.accentSoft : c.surface,
                borderRadius: 10,
                padding: 14,
                gap: 4,
              }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: c.text, fontSize: 17, fontWeight: '800' }}>{t.label}</Text>
                <Badge tone="warn">{`${t.duration_min} min · ${euro(t.price_cents)}`}</Badge>
              </Row>
              {!!t.description && <Muted>{t.description}</Muted>}
            </Pressable>
          );
        })}
      </View>
      {type && type.options.length > 0 && (
        <Chips items={type.options.map((o) => ({ value: o, label: o }))} value={option} onChange={setOption} />
      )}

      {type && (
        <>
          <Step n="3" title="Giorno e ora" />
          {openDays.length === 0 ? (
            <Muted>Nessun orario libero nelle prossime tre settimane. Riprova più avanti.</Muted>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {openDays.map((k) => {
                const d = fromKey(k);
                const on = k === day;
                return (
                  <Pressable
                    key={k}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      setDay(k);
                      setStart(null);
                    }}
                    style={{
                      width: 62,
                      paddingVertical: 8,
                      alignItems: 'center',
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: on ? c.pitch : c.line,
                      backgroundColor: on ? c.pitch : c.surface,
                    }}>
                    <Text style={{ color: on ? c.onPitchMuted : c.muted, fontSize: 12, fontWeight: '700' }}>{weekdayShort(d)}</Text>
                    <Text style={{ color: on ? c.onPitch : c.text, fontSize: 22, fontWeight: '800' }}>{d.getDate()}</Text>
                    <Text style={{ color: on ? c.onPitchMuted : c.muted, fontSize: 12 }}>{monthShort(d)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          {day && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {starts.map(({ start: s, state }) => {
                const on = s === start;
                const free = state === 'free';
                return (
                  <Pressable
                    key={s}
                    disabled={!free}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on, disabled: !free }}
                    onPress={() => setStart(s)}
                    style={{
                      width: 76,
                      paddingVertical: 10,
                      alignItems: 'center',
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: on ? c.accent : state === 'mine' ? c.brass : free ? c.lineStrong : c.taken,
                      backgroundColor: on ? c.accent : state === 'mine' ? c.brassSoft : free ? c.surface : c.taken,
                    }}>
                    <Text
                      style={{
                        color: on ? c.onAccent : state === 'mine' ? c.brassText : free ? c.text : c.takenText,
                        fontWeight: '700',
                        textDecorationLine: state === 'taken' ? 'line-through' : 'none',
                      }}>
                      {hm(s)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </>
      )}

      {ready && type && day && start != null && dog && (
        <>
          <Step n="4" title="Conferma" />
          <Card accent>
            <Body bold>
              {type.label}
              {option ? ` · ${option}` : ''} per {dog.name}
            </Body>
            <Muted>
              {longDay(day)}, dalle {hm(start)} alle {hm(start + type.duration_min)} · {euro(type.price_cents)}
            </Muted>
            <Chips
              items={[
                { value: 'onsite', label: 'Pago al campo' },
                { value: 'online', label: 'Pago online', disabled: !settings?.online_payments },
              ]}
              value={pay}
              onChange={(v) => setPay(v as 'onsite' | 'online')}
            />
            {!settings?.online_payments && <Muted style={{ fontSize: 12 }}>Il pagamento online non è ancora attivo.</Muted>}
            <ErrorText>{err}</ErrorText>
            <Button title="Conferma prenotazione" onPress={confirm} loading={saving} />
          </Card>
        </>
      )}
    </Screen>
  );
}
