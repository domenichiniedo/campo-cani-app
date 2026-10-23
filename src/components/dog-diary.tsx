import { useCallback, useEffect, useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';

import { Avatar } from '@/components/photo';
import { Button, ErrorText, Field, H1, Muted, Row } from '@/components/ui';
import { cap, longDay } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import type { DogNote } from '@/lib/types';

/** Pagine del diario di un cane, dalla più recente. */
export function useDogNotes(dogId: string | null) {
  const [notes, setNotes] = useState<DogNote[]>([]);
  const load = useCallback(async () => {
    if (!dogId) return setNotes([]);
    const { data } = await supabase.from('dog_notes').select('*').eq('dog_id', dogId).order('day', { ascending: false }).order('created_at', { ascending: false });
    setNotes((data ?? []) as DogNote[]);
  }, [dogId]);
  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);
  return { notes, reload: load };
}

/** Una pagina del diario: giorno, lezione, chi l'ha scritta, cosa si è fatto e il commento. */
export function NoteItem({ n }: { n: DogNote }) {
  const c = useColors();
  const { trainers } = useSession();
  const trainer = trainers.find((t) => t.id === n.trainer_id);
  return (
    <View style={{ gap: 4, borderLeftWidth: 3, borderLeftColor: c.accent, paddingLeft: 10 }}>
      <Text style={{ color: c.text, fontWeight: '800' }}>{cap(longDay(n.day))}</Text>
      <Row>
        {trainer && <Avatar name={trainer.name} path={trainer.photo_path} size={24} />}
        <Muted style={{ fontSize: 13, flex: 1 }}>
          {n.lesson}
          {n.author_name ? ` · ${n.author_name}` : ''}
        </Muted>
      </Row>
      {!!n.work && (
        <Text style={{ color: c.text, lineHeight: 20 }}>
          <Text style={{ fontWeight: '700' }}>{t('Cosa abbiamo fatto:')} </Text>
          {n.work}
        </Text>
      )}
      {!!n.comment && (
        <Text style={{ color: c.text, lineHeight: 20 }}>
          <Text style={{ fontWeight: '700' }}>{t('Commento:')} </Text>
          {n.comment}
        </Text>
      )}
    </View>
  );
}

/** Il diario di un cane, da leggere. */
export function DogDiary({ dogId, empty, limit }: { dogId: string; empty?: string; limit?: number }) {
  const { notes } = useDogNotes(dogId);
  const shown = limit ? notes.slice(0, limit) : notes;
  if (!notes.length) return <Muted style={{ fontSize: 13 }}>{empty ?? t('Ancora nessuna pagina nel diario.')}</Muted>;
  return (
    <View style={{ gap: 14 }}>
      {shown.map((n) => (
        <NoteItem key={n.id} n={n} />
      ))}
      {shown.length < notes.length && <Muted style={{ fontSize: 13 }}>{t('Altre {n} pagine più vecchie.', { n: notes.length - shown.length })}</Muted>}
    </View>
  );
}

export type NoteTarget = { bookingId: string; dogId: string; dogName: string; day: string; lesson: string };

/** Scrive o corregge la pagina del diario di una lezione; sotto, le pagine precedenti del cane. */
export function NoteEditor({ target, onClose }: { target: NoteTarget | null; onClose: () => void }) {
  const c = useColors();
  const { notes, reload } = useDogNotes(target?.dogId ?? null);
  const mine = notes.find((n) => n.booking_id === target?.bookingId) ?? null;
  const [work, setWork] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Se la lezione ha già una pagina, si parte da quella.
  useEffect(() => {
    Promise.resolve().then(() => {
      setWork(mine?.work ?? '');
      setComment(mine?.comment ?? '');
      setMsg('');
      setErr('');
    });
  }, [mine, target]);

  async function save() {
    if (!target) return;
    setErr('');
    setBusy(true);
    const { error } = await supabase.rpc('save_dog_note', { p_booking: target.bookingId, p_work: work, p_comment: comment });
    setBusy(false);
    if (error) return setErr(errorText(error));
    setMsg(t('Salvato nel diario: lo vedono il cliente e il campo.'));
    reload();
  }

  const older = notes.filter((n) => n.booking_id !== target?.bookingId);
  return (
    <Modal visible={!!target} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <View style={{ backgroundColor: c.bg, borderRadius: 14, width: '100%', maxWidth: 620, maxHeight: '92%' }}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
            <H1>{t('Diario di {cane}', { cane: target?.dogName ?? '' })}</H1>
            {target && <Muted>{`${cap(longDay(target.day))} · ${target.lesson}`}</Muted>}
            <Field label={t('Cosa abbiamo fatto')} value={work} onChangeText={setWork} multiline placeholder={t('Esercizi, durata, progressi')} />
            <Field label={t('Commenti per il cliente')} value={comment} onChangeText={setComment} multiline placeholder={t('Come è andata, cosa provare a casa')} />
            <ErrorText>{err}</ErrorText>
            {!!msg && <Muted>{msg}</Muted>}
            <Row style={{ justifyContent: 'flex-end' }}>
              <Button small kind="ghost" title={t('Chiudi')} onPress={onClose} />
              <Button small title={mine ? t('Aggiorna il diario') : t('Salva nel diario')} onPress={save} loading={busy} />
            </Row>
            {older.length > 0 && (
              <View style={{ gap: 14, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 14 }}>
                <Text style={{ color: c.muted, fontWeight: '800', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>{t('Pagine precedenti')}</Text>
                {older.slice(0, 8).map((n) => (
                  <NoteItem key={n.id} n={n} />
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
