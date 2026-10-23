import { router } from 'expo-router';
import { Pressable, Text, useColorScheme, View } from 'react-native';

import { cap, dayKey, fromKey, hm, STEP, today, weekdayShort } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useLessonColors } from '@/lib/lesson-colors';
import type { OwnerBooking, OwnerClass } from '@/lib/owner';
import { useSession } from '@/lib/session';
import { useColors } from '@/lib/theme';

/** Altezza in pixel di mezz'ora. */
const ROW = 40;
const HOURS_W = 52;

const openDay = (k: string) => router.navigate({ pathname: '/', params: { day: k } });

/** Un blocco nella griglia: una lezione singola o una classe di gruppo con i suoi cani. */
type Block = {
  id: string;
  day: string;
  field_id: string;
  start_min: number;
  dur_min: number;
  lesson_type: string;
  lesson_option: string;
  lesson: string;
  /** Cane della lezione, o "Gruppo 3/6" per una classe. */
  who: string;
  trainer: string | null;
  done: boolean;
};

function blocks(rows: OwnerBooking[], classes: OwnerClass[]): Block[] {
  const single = rows.filter((b) => !b.class_id || !classes.some((cl) => cl.id === b.class_id));
  return [
    ...single.map((b) => ({
      id: b.id,
      day: b.day,
      field_id: b.field_id,
      start_min: b.start_min,
      dur_min: b.dur_min,
      lesson_type: b.lesson_type,
      lesson_option: b.lesson_option,
      lesson: b.lesson_types?.label ?? b.lesson_type,
      who: b.dogs?.name ?? '',
      trainer: b.trainers?.name ?? null,
      done: !!b.checked_in_at,
    })),
    ...classes.map((cl) => {
      const dogs = rows.filter((b) => b.class_id === cl.id);
      return {
        id: cl.id,
        day: cl.day,
        field_id: cl.field_id,
        start_min: cl.start_min,
        dur_min: cl.dur_min,
        lesson_type: cl.lesson_type,
        lesson_option: cl.lesson_option,
        lesson: cl.lesson_types?.label ?? cl.lesson_type,
        who: t('Gruppo {n}/{posti}', { n: dogs.length, posti: cl.seats }),
        trainer: cl.trainers?.name ?? null,
        done: dogs.length > 0 && dogs.every((b) => b.checked_in_at),
      };
    }),
  ];
}

/**
 * Posizione di ogni lezione nella colonna del giorno: le lezioni che si sovrappongono (su campi
 * diversi) stanno affiancate, le altre usano tutta la larghezza.
 */
function layout(list: Block[]) {
  const out = new Map<string, { lane: number; of: number }>();
  let group: Block[] = [];
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

/** Pastello per le mezz'ore in cui il campo è chiuso. */
const CLOSED = { light: '#f4e4e8', dark: '#2b2026' };

/**
 * Settimana a colonne, per gli schermi larghi (PC): un giorno per colonna, divisa per campo, con le
 * ore in verticale. Le mezz'ore chiuse sono in pastello; cliccando una mezz'ora libera si prenota.
 */
export function WeekGrid({
  days,
  rows: bookings,
  classes,
  open,
  onSlot,
}: {
  days: string[];
  rows: OwnerBooking[];
  classes: OwnerClass[];
  /** Mezz'ore aperte per campo e giorno: chiave "campo|giorno". */
  open: Record<string, number[]>;
  onSlot: (day: string, fieldId: string, start: number) => void;
}) {
  const c = useColors();
  const dark = useColorScheme() === 'dark';
  const closedBg = dark ? CLOSED.dark : CLOSED.light;
  const color = useLessonColors();
  const { settings, fields, lessonTypes } = useSession();
  const todayKey = dayKey(today());
  const many = fields.length > 1;
  const rows = blocks(bookings, classes);

  // Dall'apertura alla chiusura, allargato se c'è una lezione fuori orario.
  const first = Math.min(settings?.open_min ?? 480, ...rows.map((b) => b.start_min));
  const last = Math.max(settings?.close_min ?? 1200, ...rows.map((b) => b.start_min + b.dur_min));
  const start = Math.floor(first / 60) * 60;
  const end = Math.ceil(last / 60) * 60;
  const slots = (end - start) / STEP;
  const top = (min: number) => ((min - start) / STEP) * ROW;

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        {lessonTypes.map((lt) => (
          <View key={lt.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: color(lt.id).bar }} />
            <Text style={{ color: c.text, fontSize: 13 }}>{lt.label}</Text>
          </View>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: closedBg, borderWidth: 1, borderColor: c.line }} />
          <Text style={{ color: c.text, fontSize: 13 }}>{t('Chiuso')}</Text>
        </View>
      </View>

      <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: 10, overflow: 'hidden', backgroundColor: c.surface }}>
        {/* Intestazione: giorno, numero di lezioni e, con più campi, il nome di ogni campo */}
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: c.line }}>
          <View style={{ width: HOURS_W }} />
          {days.map((k) => {
            const n = bookings.filter((b) => b.day === k).length;
            const isToday = k === todayKey;
            return (
              <View key={k} style={{ flex: 1, borderLeftWidth: 1, borderColor: c.lineStrong, backgroundColor: isToday ? c.accentSoft : undefined }}>
                <Pressable accessibilityRole="button" onPress={() => openDay(k)} style={{ paddingVertical: 8, alignItems: 'center' }}>
                  <Text style={{ color: isToday ? c.accent : c.text, fontWeight: '800' }}>
                    {`${cap(weekdayShort(fromKey(k)))} ${fromKey(k).getDate()}`}
                  </Text>
                  <Text style={{ color: c.muted, fontSize: 12 }}>{n ? (n === 1 ? t('1 lezione') : t('{n} lezioni', { n })) : t('Libero')}</Text>
                </Pressable>
                {many && (
                  <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: c.line }}>
                    {fields.map((f, i) => (
                      <Text
                        key={f.id}
                        numberOfLines={1}
                        style={{
                          flex: 1,
                          textAlign: 'center',
                          color: c.muted,
                          fontSize: 11,
                          fontWeight: '700',
                          paddingVertical: 3,
                          borderLeftWidth: i ? 1 : 0,
                          borderColor: c.line,
                        }}>
                        {f.name}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
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
          {days.map((k) => (
            <View key={k} style={{ flex: 1, flexDirection: 'row', borderLeftWidth: 1, borderColor: c.lineStrong }}>
              {fields.map((f, fi) => {
                const list = rows.filter((b) => b.day === k && b.field_id === f.id);
                const pos = layout(list);
                const openSlots = open[`${f.id}|${k}`] ?? [];
                return (
                  <View key={f.id} style={{ flex: 1, borderLeftWidth: fi ? 1 : 0, borderColor: c.line }}>
                    {Array.from({ length: slots }, (_, i) => {
                      const m = start + i * STEP;
                      const closed = !openSlots.includes(m);
                      return (
                        <Pressable
                          key={i}
                          accessibilityLabel={`${t('Prenota')} ${f.name} ${hm(m)}`}
                          onPress={() => onSlot(k, f.id, m)}
                          style={{
                            position: 'absolute',
                            top: i * ROW,
                            height: ROW,
                            left: 0,
                            right: 0,
                            borderTopWidth: i ? 1 : 0,
                            borderColor: i % 2 ? c.off : c.line,
                            backgroundColor: closed ? closedBg : k === todayKey ? c.surface2 : undefined,
                          }}
                        />
                      );
                    })}
                    {list.map((b) => {
                      const col = color(b.lesson_type);
                      const h = Math.max(top(b.start_min + b.dur_min) - top(b.start_min) - 2, ROW - 2);
                      const { lane, of } = pos.get(b.id)!;
                      const tall = h > 2 * ROW;
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
                              paddingHorizontal: 5,
                              paddingVertical: 2,
                              overflow: 'hidden',
                            }}>
                            <Text style={{ color: col.text, fontSize: 12, fontWeight: '800' }} numberOfLines={1}>
                              {`${hm(b.start_min)} ${b.who}`}
                              {b.done ? ' ✓' : ''}
                            </Text>
                            <Text style={{ color: col.text, fontSize: 11 }} numberOfLines={tall ? 2 : 1}>
                              {tall
                                ? `${b.lesson}${b.lesson_option ? ` · ${b.lesson_option}` : ''}`
                                : `${b.trainer ?? t('Trainer da assegnare')} · ${b.lesson_option || b.lesson}`}
                            </Text>
                            {tall && (
                              <Text style={{ color: col.text, fontSize: 11, fontWeight: '700' }} numberOfLines={1}>
                                {b.trainer ? t('Trainer: {nome}', { nome: b.trainer }) : t('Trainer da assegnare')}
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
          ))}
        </View>
      </View>
      <Text style={{ color: c.muted, fontSize: 12 }}>
        {t("Clicca su una lezione per aprire il giorno, o su una mezz'ora libera per prenotare per un cliente.")}
      </Text>
    </View>
  );
}
