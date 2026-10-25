import { useEffect, useState } from 'react';

import { SlotFields, type BookStart } from '@/components/owner-book';
import { Button, Dialog, ErrorText, Field, H1, Muted, Row } from '@/components/ui';
import { hm, isDayKey, parseHm, STEP } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';

/** Il proprietario mette in calendario una classe di gruppo, anche ripetuta ogni settimana. */
export function NewClass({ start, onClose, onDone }: { start: BookStart | null; onClose: () => void; onDone: () => void }) {
  const { fields, lessonTypes } = useSession();
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
    <Dialog open={!!start} onClose={onClose}>
      <H1>{t('Nuova classe di gruppo')}</H1>
      {groups.length === 0 ? (
        <Muted>{t('Prima, in Impostazioni, accendi "Lezione di gruppo" su una lezione.')}</Muted>
      ) : (
        <>
          <SlotFields
            lessons={groups}
            type={type}
            onType={(v) => {
              setType(v);
              setSeats(String(groups.find((lt) => lt.id === v)?.group_seats ?? ''));
            }}
            option={option}
            onOption={setOption}
            field={field}
            onField={setField}
            trainer={trainer}
            onTrainer={setTrainer}
            day={day}
            onDay={setDay}
            time={time}
            onTime={setTime}
          />
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
    </Dialog>
  );
}
