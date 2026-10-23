import { useCallback, useEffect, useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';

import { Avatar } from '@/components/photo';
import { Button, Chips, ErrorText, Field, H1, Muted, Row } from '@/components/ui';
import { cap, longDay } from '@/lib/format';
import { t } from '@/lib/i18n';
import { usePlan } from '@/lib/plans';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import type { DogNote, EvalForm, Evaluation } from '@/lib/types';

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
      {n.evaluation && <EvaluationView ev={n.evaluation} />}
    </View>
  );
}

/** La scheda di valutazione compilata: le voci lasciate vuote non si mostrano. */
function EvaluationView({ ev }: { ev: Evaluation }) {
  const c = useColors();
  const shown = ev.items.filter((it) => it.value !== null);
  return (
    <View style={{ gap: 3, backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 2 }}>
      <Text style={{ color: c.text, fontWeight: '800' }}>{ev.name}</Text>
      {shown.map((it, i) => (
        <Text key={i} style={{ color: c.text, lineHeight: 20 }}>
          <Text style={{ fontWeight: '700' }}>{`${it.label}: `}</Text>
          {it.kind === 'score' ? (
            <>
              <Text style={{ color: c.accent, letterSpacing: 1 }}>{'●'.repeat(Number(it.value)) + '○'.repeat(5 - Number(it.value))}</Text>
              {` ${it.value}/5`}
            </>
          ) : it.kind === 'yesno' ? (
            it.value ? t('Sì') : t('No')
          ) : (
            String(it.value)
          )}
        </Text>
      ))}
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
  const plan = usePlan();
  const [forms, setForms] = useState<EvalForm[]>([]);
  const [work, setWork] = useState('');
  const [comment, setComment] = useState('');
  // Scheda scelta ('' = nessuna) e un valore per voce: '1'-'5', 'si'/'no' o il testo della nota.
  const [formId, setFormId] = useState('');
  const [values, setValues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!target || !plan.evals) return;
    supabase
      .from('eval_forms')
      .select('*')
      .eq('active', true)
      .order('sort')
      .then(({ data }) => setForms((data ?? []) as EvalForm[]));
  }, [target, plan.evals]);

  // Se la lezione ha già una pagina, si parte da quella.
  useEffect(() => {
    Promise.resolve().then(() => {
      setWork(mine?.work ?? '');
      setComment(mine?.comment ?? '');
      const ev = mine?.evaluation;
      setFormId(ev?.form_id ?? '');
      setValues(
        (ev?.items ?? []).map((it) =>
          it.value === null ? '' : it.kind === 'yesno' ? (it.value ? 'si' : 'no') : String(it.value),
        ),
      );
      setMsg('');
      setErr('');
    });
  }, [mine, target]);

  const form = forms.find((f) => f.id === formId) ?? null;
  // Pagina già compilata con una scheda che non è più in uso: resta com'è, oppure si toglie.
  const oldEval = formId && !form && mine?.evaluation?.form_id === formId ? mine.evaluation : null;

  function pickForm(id: string) {
    setFormId(id);
    setValues([]);
  }
  const setValue = (i: number, v: string) => {
    const next = [...values];
    next[i] = values[i] === v && form?.items[i].kind !== 'text' ? '' : v;
    setValues(next);
  };
  const evalValue = (kind: string, v: string | undefined) =>
    !v ? null : kind === 'score' ? Number(v) : kind === 'yesno' ? v === 'si' : v;

  async function save() {
    if (!target) return;
    setErr('');
    setBusy(true);
    const p_eval = oldEval ? { keep: true } : form ? { form_id: form.id, values: form.items.map((it, i) => evalValue(it.kind, values[i])) } : null;
    const { error } = await supabase.rpc('save_dog_note', { p_booking: target.bookingId, p_work: work, p_comment: comment, p_eval });
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
            {(forms.length > 0 || !!oldEval) && (
              <View style={{ gap: 10 }}>
                <Muted style={{ fontSize: 13 }}>{t('Scheda di valutazione')}</Muted>
                <Chips
                  items={[
                    { value: '', label: t('Nessuna') },
                    ...(oldEval ? [{ value: oldEval.form_id, label: oldEval.name }] : []),
                    ...forms.map((f) => ({ value: f.id, label: f.name })),
                  ]}
                  value={formId}
                  onChange={pickForm}
                />
                {form?.items.map((it, i) =>
                  it.kind === 'text' ? (
                    <Field key={i} label={it.label} value={values[i] ?? ''} onChangeText={(v) => setValue(i, v)} multiline />
                  ) : (
                    <View key={i} style={{ gap: 6 }}>
                      <Text style={{ color: c.text, fontWeight: '700' }}>{it.label}</Text>
                      <Chips
                        items={
                          it.kind === 'score'
                            ? ['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: v }))
                            : [
                                { value: 'si', label: t('Sì') },
                                { value: 'no', label: t('No') },
                              ]
                        }
                        value={values[i] ?? null}
                        onChange={(v) => setValue(i, v)}
                      />
                    </View>
                  ),
                )}
                {oldEval && <EvaluationView ev={oldEval} />}
                {!!form && <Muted style={{ fontSize: 13 }}>{t('Le voci lasciate vuote non compaiono nel diario. Ripremi una scelta per toglierla.')}</Muted>}
              </View>
            )}
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
