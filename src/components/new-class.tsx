import { useEffect, useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';

import type { BookStart } from '@/components/owner-book';
import { Button, Chips, ErrorText, Field, H1, Muted, Row } from '@/components/ui';
import { hm, isDayKey, parseHm, STEP } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';

/** Il proprietario mette in calendario una classe di gruppo, anche ripetuta ogni settimana. */
export function NewClass({ start, onClose, onDone }: { start: BookStart | null; onClose: () => void; onDone: () => void }) {
  const c = useColors();
  const { fields, lessonTypes, trainers } = useSession();
  const groups = lessonTypes.filter((lt) => lt.group_seats !== null);
  const [type, setType] = useState<string | null>(null);
  const [option, setOption] = useState<string | null>(null);
  const [field, setField] = useState<string | null>(null);
  const [trainer, setTrainer] = useState('');
  const [day, setDay] = useState('');
  const [time, setTime] = useState('');
  const [seats, setSeats] = useState('');
  const [weeks, setWeeks] = useState('1');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Ogni volta che si apre riparte dal giorno, dall'ora e dal campo di partenza.
  useEffect(() => {
    if (!start) return;
    Promise.resolve().then(() => {
      const first = lessonTypes.find((lt) => lt.group_seats !== null);
      setType(first?.id ?? null);
      setSeats(String(first?.group_seats ?? ''));
      setOption(null);
      setDay(start.day);
      setTime(hm(start.start));
      setField(start.fieldId ?? fields[0]?.id ?? null);
      setTrainer('');
      setWeeks('1');
      setErr('');
    });
  }, [start, fields, lessonTypes]);

  const lesson = groups.find((lt) => lt.id === type) ?? null;
  const startMin = parseHm(time);

  async function save() {
    setErr('');
    if (!lesson) return setErr(t('Scegli la lezione.'));
    if (lesson.options.length && !option) return setErr(t('Scegli la specialità.'));
    if (!field) return setErr(t('Scegli il campo.'));
    if (!isDayKey(day)) return setErr(t('Scrivi il giorno come AAAA-MM-GG.'));
    if (startMin === null || startMin % STEP) return setErr(t('Scrivi l’ora come 10:00 o 10:30.'));
    const n = Number(seats), w = Number(weeks);
    if (!Number.isInteger(n) || n < 2 || n > 50) return setErr(t('I posti vanno da 2 a 50'));
    if (!Number.isInteger(w) || w < 1 || w > 26) return setErr(t('Le settimane vanno da 1 a 26'));
    setBusy(true);
    const { error } = await supabase.rpc('create_classes', {
      p_type: lesson.id,
      p_option: option ?? '',
      p_field: field,
      p_trainer: trainer || null,
      p_day: day,
      p_start: startMin,
      p_seats: n,
      p_weeks: w,
    });
    setBusy(false);
    if (error) return setErr(errorText(error));
    onDone();
  }

  return (
    <Modal visible={!!start} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <View style={{ backgroundColor: c.bg, borderRadius: 14, width: '100%', maxWidth: 620, maxHeight: '92%' }}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
            <H1>{t('Nuova classe di gruppo')}</H1>
            {groups.length === 0 ? (
              <Muted>{t('Prima, in Impostazioni, accendi "Lezione di gruppo" su una lezione.')}</Muted>
            ) : (
              <>
                <Muted style={{ fontSize: 13 }}>{t('Lezione')}</Muted>
                <Chips
                  items={groups.map((lt) => ({ value: lt.id, label: lt.label }))}
                  value={type}
                  onChange={(v) => {
                    setType(v);
                    setOption(null);
                    setTrainer('');
                    setSeats(String(groups.find((lt) => lt.id === v)?.group_seats ?? ''));
                  }}
                />
                {!!lesson?.options.length && <Chips items={lesson.options.map((o) => ({ value: o, label: o }))} value={option} onChange={setOption} />}

                {fields.length > 1 && (
                  <>
                    <Muted style={{ fontSize: 13 }}>{t('Campo')}</Muted>
                    <Chips items={fields.map((f) => ({ value: f.id, label: f.name }))} value={field} onChange={setField} />
                  </>
                )}

                {trainers.length > 0 && (
                  <>
                    <Muted style={{ fontSize: 13 }}>{t('Trainer')}</Muted>
                    <Chips
                      items={[
                        { value: '', label: t('Da assegnare') },
                        ...trainers
                          .filter((tr) => !tr.lessons.length || (type && tr.lessons.includes(type)))
                          .map((tr) => ({ value: tr.id, label: tr.name })),
                      ]}
                      value={trainer}
                      onChange={setTrainer}
                    />
                  </>
                )}

                <Row>
                  <Field label={t('Giorno')} value={day} onChangeText={setDay} placeholder="2026-10-23" style={{ flex: 1, minWidth: 140 }} />
                  <Field label={t('Ora')} value={time} onChangeText={setTime} placeholder="10:00" style={{ flex: 1, minWidth: 100 }} />
                </Row>
                <Row>
                  <Field label={t('Posti')} value={seats} onChangeText={setSeats} keyboardType="number-pad" style={{ flex: 1, minWidth: 100 }} />
                  <Field
                    label={t('Ripeti per settimane')}
                    value={weeks}
                    onChangeText={setWeeks}
                    keyboardType="number-pad"
                    style={{ flex: 1, minWidth: 140 }}
                  />
                </Row>
                {lesson && (
                  <Muted style={{ fontSize: 13 }}>
                    {t('Dura {min} minuti e occupa il campo anche se non si iscrive nessuno. Con più settimane si crea una classe uguale ogni settimana, stesso giorno e stessa ora.', { min: lesson.duration_min })}
                  </Muted>
                )}
              </>
            )}

            <ErrorText>{err}</ErrorText>
            <Row style={{ justifyContent: 'flex-end' }}>
              <Button small kind="ghost" title={t('Annulla')} onPress={onClose} />
              {groups.length > 0 && <Button small title={t('Crea classe')} onPress={save} loading={busy} />}
            </Row>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
