import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { cap, dayKey, fromKey, hm, STEP, today, weekdayShort } from '@/lib/format';
import { useLessonColors } from '@/lib/lesson-colors';
import type { OwnerBooking } from '@/lib/owner';
import { useSession } from '@/lib/session';
import { useColors } from '@/lib/theme';

/** Altezza in pixel di mezz'ora. */
const ROW = 40;
const HOURS_W = 52;

const openDay = (k: string) => router.navigate({ pathname: '/', params: { day: k } });

/**
 * Posizione di ogni lezione nella colonna del giorno: le lezioni che si sovrappongono (su campi
 * diversi) stanno affiancate, le altre usano tutta la larghezza.
 */
function layout(list: OwnerBooking[]) {
  const out = new Map<string, { lane: number; of: number }>();
  let group: OwnerBooking[] = [];
  let ends: number[] = [];
  let groupEnd = -1;
  const close = () => group.forEach((b) => (out.get(b.id)!.of = ends.length));
  for (const b of [...list].sort((x, y) => x.start_min - y.start_min)) {
    if (b.start_min >= groupEnd) {
      close();
      group = [];
      ends = [];
      groupEnd = 0;
    }
    let lane = ends.findIndex((e) => e <= b.start_min);
    if (lane < 0) lane = ends.push(0) - 1;
    ends[lane] = b.start_min + b.dur_min;
    groupEnd = Math.max(groupEnd, ends[lane]);
    group.push(b);
    out.set(b.id, { lane, of: 1 });
  }
  close();
  return out;
}

/** Settimana a colonne, per gli schermi larghi (PC): un giorno per colonna, le ore in verticale. */
export function WeekGrid({ days, rows }: { days: string[]; rows: OwnerBooking[] }) {
  const c = useColors();
  const color = useLessonColors();
  const { settings, fields, lessonTypes } = useSession();
  const todayKey = dayKey(today());

  // Dall'apertura alla chiusura, allargato se c'è una lezione fuori orario.
  const first = Math.min(settings?.open_min ?? 480, ...rows.map((b) => b.start_min));
  const last = Math.max(settings?.close_min ?? 1200, ...rows.map((b) => b.start_min + b.dur_min));
  const start = Math.floor(first / 60) * 60;
  const end = Math.ceil(last / 60) * 60;
  const slots = (end - start) / STEP;
  const top = (min: number) => ((min - start) / STEP) * ROW;

  return (
    <View style={{ gap: 10 }}>
      {lessonTypes.length > 1 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          {lessonTypes.map((t) => (
            <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: color(t.id).bar }} />
              <Text style={{ color: c.text, fontSize: 13 }}>{t.label}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: 10, overflow: 'hidden', backgroundColor: c.surface }}>
        {/* Intestazione: giorno e numero di lezioni */}
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: c.line }}>
          <View style={{ width: HOURS_W }} />
          {days.map((k) => {
            const n = rows.filter((b) => b.day === k).length;
            const isToday = k === todayKey;
            return (
              <Pressable
                key={k}
                accessibilityRole="button"
                onPress={() => openDay(k)}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  alignItems: 'center',
                  borderLeftWidth: 1,
                  borderColor: c.line,
                  backgroundColor: isToday ? c.accentSoft : undefined,
                }}>
                <Text style={{ color: isToday ? c.accent : c.text, fontWeight: '800' }}>
                  {`${cap(weekdayShort(fromKey(k)))} ${fromKey(k).getDate()}`}
                </Text>
                <Text style={{ color: c.muted, fontSize: 12 }}>{n ? (n === 1 ? '1 lezione' : `${n} lezioni`) : 'Libero'}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Ore e lezioni */}
        <View style={{ flexDirection: 'row', height: slots * ROW }}>
          <View style={{ width: HOURS_W }}>
            {Array.from({ length: slots / 2 }, (_, i) => (
              <Text key={i} style={{ position: 'absolute', top: i * 2 * ROW + 2, right: 8, color: c.muted, fontSize: 12 }}>
                {hm(start + i * 60)}
              </Text>
            ))}
          </View>
          {days.map((k) => {
            const list = rows.filter((b) => b.day === k);
            const pos = layout(list);
            return (
              <View key={k} style={{ flex: 1, borderLeftWidth: 1, borderColor: c.line, backgroundColor: k === todayKey ? c.surface2 : undefined }}>
                {Array.from({ length: slots }, (_, i) => (
                  <View
                    key={i}
                    style={{ position: 'absolute', top: i * ROW, left: 0, right: 0, borderTopWidth: i ? 1 : 0, borderColor: i % 2 ? c.off : c.line }}
                  />
                ))}
                {list.map((b) => {
                  const col = color(b.lesson_type);
                  const h = Math.max(top(b.start_min + b.dur_min) - top(b.start_min) - 2, ROW - 2);
                  const { lane, of } = pos.get(b.id)!;
                  return (
                    <Pressable
                      key={b.id}
                      accessibilityRole="button"
                      onPress={() => openDay(k)}
                      style={{
                        position: 'absolute',
                        top: top(b.start_min) + 1,
                        height: h,
                        left: `${(lane / of) * 100}%`,
                        width: `${100 / of}%`,
                        padding: 2,
                      }}>
                      <View
                        style={{
                          flex: 1,
                          backgroundColor: col.bg,
                          borderLeftWidth: 4,
                          borderColor: col.bar,
                          borderRadius: 6,
                          paddingHorizontal: 6,
                          paddingVertical: 3,
                          overflow: 'hidden',
                        }}>
                        <Text style={{ color: col.text, fontSize: 12, fontWeight: '800' }} numberOfLines={1}>
                          {`${hm(b.start_min)} ${b.dogs?.name ?? ''}`}
                          {b.checked_in_at ? ' ✓' : ''}
                        </Text>
                        <Text style={{ color: col.text, fontSize: 12 }} numberOfLines={h > 2 * ROW ? 2 : 1}>
                          {b.lesson_types?.label ?? b.lesson_type}
                          {b.lesson_option ? ` · ${b.lesson_option}` : ''}
                        </Text>
                        {h > 2 * ROW && (
                          <Text style={{ color: col.text, fontSize: 11, opacity: 0.85 }} numberOfLines={1}>
                            {[fields.length > 1 ? b.fields?.name : null, b.trainers?.name].filter(Boolean).join(' · ')}
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </View>
      </View>
      <Text style={{ color: c.muted, fontSize: 12 }}>Clicca su un giorno o su una lezione per aprire il giorno.</Text>
    </View>
  );
}
