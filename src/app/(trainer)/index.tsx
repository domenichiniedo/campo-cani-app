import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { NoteEditor, type NoteTarget } from '@/components/dog-diary';
import { Avatar } from '@/components/photo';
import { Badge, Body, Button, Card, Chips, ConfirmButton, ErrorText, H1, Muted, Row, Screen, Stat } from '@/components/ui';
import { addDays, cap, dayKey, fromKey, hm, longDay, timeOf, today } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import { fullName, PENALTY_REASONS, type Booking, type GroupClass } from '@/lib/types';

type Lesson = Booking & {
  profiles: { first_name: string; last_name: string; phone: string; photo_path: string | null } | null;
  dogs: { name: string; breed: string; blocked: boolean } | null;
  lesson_types: { label: string } | null;
  fields: { name: string } | null;
  // Un solo diario per lezione: a seconda del server arriva come oggetto o come lista.
  dog_notes: { id: string } | { id: string }[] | null;
  penalties: { id: string; reason: string }[];
};

type TrainerClass = GroupClass & { lesson_types: { label: string } | null; fields: { name: string } | null };

/** Le lezioni del trainer, giorno per giorno: fa entrare il cane e scrive il diario. */
export default function TrainerLessons() {
  const c = useColors();
  const { myTrainer, fields } = useSession();
  const [day, setDay] = useState(dayKey(today()));
  const [rows, setRows] = useState<Lesson[]>([]);
  const [classes, setClasses] = useState<TrainerClass[]>([]);
  const [note, setNote] = useState<NoteTarget | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [penaltyFor, setPenaltyFor] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!myTrainer) return;
    setLoading(true);
    const [{ data, error }, cl] = await Promise.all([
      supabase
        .from('bookings')
        .select('*, profiles(first_name, last_name, phone, photo_path), dogs(name, breed, blocked), lesson_types(label), fields(name), dog_notes(id), penalties(id, reason)')
        .eq('trainer_id', myTrainer.id)
        .eq('status', 'active')
        .eq('day', day)
        .order('start_min'),
      supabase
        .from('classes')
        .select('*, lesson_types(label), fields(name)')
        .eq('trainer_id', myTrainer.id)
        .eq('status', 'active')
        .eq('day', day),
    ]);
    setErr(error ? errorText(error) : '');
    setRows((data ?? []) as Lesson[]);
    setClasses((cl.data ?? []) as TrainerClass[]);
    setLoading(false);
  }, [day, myTrainer]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Senza trainer collegato il layout mostra già la spiegazione.
  if (!myTrainer) return null;

  const isToday = day === dayKey(today());
  // Le penalità si danno il giorno della lezione o dopo, non in anticipo.
  const canPenalize = day <= dayKey(today());
  const move = (n: number) => setDay(dayKey(addDays(fromKey(day), n)));
  const arrived = rows.filter((b) => b.checked_in_at).length;
  // Lezioni singole e classi di gruppo in ordine di orario; i cani di una classe stanno nella sua scheda.
  const items = [
    ...rows.filter((b) => !b.class_id || !classes.some((cl) => cl.id === b.class_id)).map((b) => ({ start: b.start_min, b, cl: null })),
    ...classes.map((cl) => ({ start: cl.start_min, b: null, cl })),
  ].sort((x, y) => x.start - y.start);

  async function checkIn(b: Lesson) {
    setErr('');
    setBusy(b.id);
    const { error } = await supabase.rpc('trainer_check_in', { p_booking: b.id, p_in: !b.checked_in_at });
    setBusy(null);
    if (error) setErr(errorText(error));
    load();
  }

  async function penalize(b: Lesson) {
    setErr('');
    setBusy(b.id);
    const { error } = await supabase.rpc('trainer_penalty', { p_booking: b.id, p_reason: reason });
    setBusy(null);
    if (error) return setErr(errorText(error));
    setPenaltyFor(null);
    setReason(null);
    load();
  }

  async function removePenalty(id: string) {
    setErr('');
    const { error } = await supabase.rpc('trainer_remove_penalty', { p_id: id });
    if (error) setErr(errorText(error));
    load();
  }

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <H1>{cap(longDay(day))}</H1>
      <Row>
        <Button small kind="ghost" title={t('‹ Prima')} onPress={() => move(-1)} />
        <Button small kind="ghost" title={t('Oggi')} onPress={() => setDay(dayKey(today()))} />
        <Button small kind="ghost" title={t('Dopo ›')} onPress={() => move(1)} />
      </Row>
      <Row>
        <Stat label={t('Lezioni')} value={rows.length} />
        <Stat label={t('Entrati')} value={`${arrived}/${rows.length}`} />
      </Row>
      <ErrorText>{err}</ErrorText>
      {!loading && items.length === 0 && <Muted>{t('Nessuna lezione con te in questo giorno.')}</Muted>}
      {items.map(({ b, cl }) => {
        if (cl) {
          const dogs = rows.filter((x) => x.class_id === cl.id);
          return (
            <Card key={cl.id} style={{ borderLeftWidth: 4, borderLeftColor: c.brass }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: c.text, fontSize: 20, fontWeight: '800' }}>
                  {hm(cl.start_min)}
                  <Text style={{ color: c.muted, fontSize: 14, fontWeight: '600' }}> – {hm(cl.start_min + cl.dur_min)}</Text>
                </Text>
                <Row>
                  {fields.length > 1 && cl.fields && <Badge>{cl.fields.name}</Badge>}
                  <Badge tone="ok">{t('{n}/{posti} posti', { n: dogs.length, posti: cl.seats })}</Badge>
                </Row>
              </Row>
              <Text style={{ color: c.text, fontSize: 16, fontWeight: '800' }}>
                {t('Classe di gruppo: {lezione}', { lezione: cl.lesson_types?.label ?? cl.lesson_type })}
                {cl.lesson_option ? ` · ${cl.lesson_option}` : ''}
              </Text>
              {dogs.length === 0 && <Muted>{t('Nessun cane iscritto per ora.')}</Muted>}
              {dogs.map((x) => dogCard(x, true))}
            </Card>
          );
        }
        return dogCard(b!, false);
      })}
      {!isToday && rows.length > 0 && <Muted style={{ fontSize: 13 }}>{t('Il cane si fa entrare in campo il giorno della lezione.')}</Muted>}
      <NoteEditor
        target={note}
        onClose={() => {
          setNote(null);
          load();
        }}
      />
    </Screen>
  );

  function dogCard(b: Lesson, inClass: boolean) {
    const lesson = `${b.lesson_types?.label ?? b.lesson_type}${b.lesson_option ? ` · ${b.lesson_option}` : ''}`;
    return (
      <Card key={b.id} style={b.checked_in_at ? { borderLeftWidth: 4, borderLeftColor: c.accent } : undefined}>
        <Row style={{ justifyContent: 'space-between' }}>
          {inClass ? (
            <Body bold>
              {b.dogs?.name}
              {b.dogs?.breed ? ` (${b.dogs.breed})` : ''}
            </Body>
          ) : (
            <Text style={{ color: c.text, fontSize: 20, fontWeight: '800' }}>
              {hm(b.start_min)}
              <Text style={{ color: c.muted, fontSize: 14, fontWeight: '600' }}> – {hm(b.start_min + b.dur_min)}</Text>
            </Text>
          )}
          <Row>
            {fields.length > 1 && !inClass && b.fields && <Badge>{b.fields.name}</Badge>}
            {b.checked_in_at && <Badge tone="ok">{t('Entrato {ora}', { ora: timeOf(b.checked_in_at) })}</Badge>}
            {b.dogs?.blocked && <Badge tone="bad">{t('Sospeso')}</Badge>}
          </Row>
        </Row>
        <View style={{ gap: 2 }}>
          {!inClass && (
            <>
              <Body bold>
                {b.dogs?.name}
                {b.dogs?.breed ? ` (${b.dogs.breed})` : ''}
              </Body>
              <Muted>{lesson}</Muted>
            </>
          )}
          <Row>
            <Avatar name={fullName(b.profiles)} path={b.profiles?.photo_path} size={24} />
            <Muted>
              {fullName(b.profiles)} · {b.profiles?.phone}
            </Muted>
          </Row>
        </View>
        {(b.penalties ?? []).map((p) => (
          <Row key={p.id}>
            <Badge tone="bad">{t('Penalità: {motivo}', { motivo: t(p.reason) })}</Badge>
            <ConfirmButton title={t('Togli')} onConfirm={() => removePenalty(p.id)} />
          </Row>
        ))}
        <Row>
          {isToday && (
            <Button
              small
              kind={b.checked_in_at ? 'ghost' : 'primary'}
              title={b.checked_in_at ? t('Annulla ingresso') : t('Fai entrare in campo')}
              loading={busy === b.id}
              disabled={!b.checked_in_at && !!b.dogs?.blocked}
              onPress={() => checkIn(b)}
            />
          )}
          <Button
            small
            kind="ghost"
            title={(Array.isArray(b.dog_notes) ? b.dog_notes.length > 0 : !!b.dog_notes) ? t('Diario ✓') : t('Scrivi il diario')}
            onPress={() => setNote({ bookingId: b.id, dogId: b.dog_id, dogName: b.dogs?.name ?? '', day: b.day, lesson })}
          />
          {canPenalize && (
            <Button small kind="ghost" title={t('Penalità')} onPress={() => setPenaltyFor(penaltyFor === b.id ? null : b.id)} />
          )}
        </Row>
        {penaltyFor === b.id && (
          <View style={{ gap: 8 }}>
            <Chips items={PENALTY_REASONS.map((r) => ({ value: r, label: t(r) }))} value={reason} onChange={setReason} />
            <Button small kind="danger" title={t('Dai penalità')} disabled={!reason} loading={busy === b.id} onPress={() => penalize(b)} />
            <Muted style={{ fontSize: 13 }}>{t('La vedono il cliente e il centro. Alla soglia del regolamento il cane viene sospeso.')}</Muted>
          </View>
        )}
      </Card>
    );
  }
}
