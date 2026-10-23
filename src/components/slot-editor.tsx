import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Button, Card, ErrorText, Muted, Row, Step } from '@/components/ui';
import { addDays, cap, dayKey, fromKey, hm, longDay, monthShort, STEP, today, weekdayShort } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useColors } from '@/lib/theme';

export const DAYS_AHEAD = 56;

/** Giorni da oggi in avanti che si possono aprire o chiudere. */
export const editableDays = () => Array.from({ length: DAYS_AHEAD }, (_, i) => dayKey(addDays(today(), i)));

/**
 * Griglia delle mezz'ore di un campo o di un trainer: giorno in alto, mezz'ore da toccare sotto.
 * `open` e `booked` sono per giorno; `onSave` riceve i giorni e le mezz'ore e torna un errore o null.
 */
export function SlotEditor({
  title,
  openMin,
  closeMin,
  open,
  booked,
  onSave,
  extra,
}: {
  title?: string;
  openMin: number;
  closeMin: number;
  open: Record<string, number[]>;
  booked: Record<string, number[]>;
  onSave: (days: string[], slots: number[]) => Promise<string | null>;
  /** Altri bottoni sotto la griglia (per esempio "usa su tutti i campi"). */
  extra?: (day: string, slots: number[], save: (run: () => Promise<string | null>, ok: string) => Promise<void>) => ReactNode;
}) {
  const c = useColors();
  const days = editableDays();
  const [day, setDay] = useState(days[0]);
  const [draft, setDraft] = useState<number[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const grid: number[] = [];
  for (let m = openMin; m < closeMin; m += STEP) grid.push(m);
  const current = draft ?? open[day] ?? [];
  const takenNow = booked[day] ?? [];
  const sameWeekdayNext = [1, 2, 3, 4].map((w) => dayKey(addDays(fromKey(day), 7 * w)));

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
  async function save(run: () => Promise<string | null>, ok: string) {
    setErr('');
    setSaving(true);
    const e = await run();
    setSaving(false);
    if (e) return setErr(e);
    setDraft(null);
    setMsg(ok);
  }

  return (
    <>
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

      <Step title={title ? `${title} · ${cap(longDay(day))}` : cap(longDay(day))} />
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
          <Button small kind="ghost" title={t('Apri tutto')} onPress={() => setDraft(grid)} />
          <Button small kind="ghost" title={t('Chiudi tutto')} onPress={() => setDraft([])} />
        </Row>
        <ErrorText>{err}</ErrorText>
        {!!msg && <Muted>{msg}</Muted>}
        <Button
          title={t('Salva questo giorno')}
          onPress={() => save(() => onSave([day], current), t('Orari salvati.'))}
          loading={saving}
          disabled={!draft}
        />
        <Button
          kind="ghost"
          title={t('Copia sullo stesso giorno delle prossime 4 settimane')}
          onPress={() => save(() => onSave([day, ...sameWeekdayNext], current), t('Orari copiati su 5 giorni.'))}
        />
        {extra?.(day, current, save)}
      </Card>
    </>
  );
}
