import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Avatar } from '@/components/photo';
import { Button, Chips, Dialog, ErrorText, Field, H1, Muted, Row } from '@/components/ui';
import { cap, longDay } from '@/lib/format';
import { t } from '@/lib/i18n';
import { usePlan } from '@/lib/plans';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import type { DogNote, EvalForm, Evaluation } from '@/lib/types';

/** Pagine del diario di un cane, dalla più recente. */
function useDogNotes(dogId: string | null) {
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
function NoteItem({ n }: { n: DogNote }) {
  const c = useColors();
  const { trainers } = useSession();
  const trainer = trainers.find((t) => t.id === n.trainer_id);
  return (
    <View style={{ gap: 4, borderLeftWidth: 3, borderLeftColor: c.accent, paddingLeft: 10 }}>
      <Text style={{ color: c.text, fontWeight: '800' }}>{cap(longDay(n.day))}</Text>
      <Row>
        {trainer && <Avatar name={trainer.name} path={trainer.photo_path} size={24} />}
        <Muted style={{ fontSize: 13, flex: 1 }}>
          {n.booking_id || n.lesson ? n.lesson : t('Valutazione del cane')}
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

/** Schede di valutazione in uso, se il piano le comprende. */
function useEvalForms(on: boolean) {
  const plan = usePlan();
  const [forms, setForms] = useState<EvalForm[]>([]);
  useEffect(() => {
    if (!on || !plan.evals) return;
    supabase
      .from('eval_forms')
      .select('*')
      .eq('active', true)
      .order('sort')
      .then(({ data }) => setForms((data ?? []) as EvalForm[]));
  }, [on, plan.evals]);
  return forms;
}

/** Dai valori scritti ('1'-'5', 'si'/'no', la risposta scelta o il testo) ai valori della scheda per il database. */
const evalPayload = (form: EvalForm, values: string[]) => ({
  form_id: form.id,
  values: form.items.map((it, i) => {
    const v = values[i];
    return !v ? null : it.kind === 'score' ? Number(v) : it.kind === 'yesno' ? v === 'si' : v;
  }),
});

/** Scelta della scheda e una riga per voce: voto da 1 a 5, sì/no, scelta tra risposte o testo. */
function EvalFields({
  forms,
  formId,
  values,
  onForm,
  onValues,
  none,
  oldEval,
}: {
  forms: EvalForm[];
  formId: string;
  values: string[];
  onForm: (id: string) => void;
  onValues: (v: string[]) => void;
  /** C'è anche "Nessuna": la scheda si può non compilare. */
  none?: boolean;
  oldEval?: Evaluation | null;
}) {
  const c = useColors();
  const form = forms.find((f) => f.id === formId) ?? null;
  const setValue = (i: number, v: string) => {
    const next = [...values];
    next[i] = values[i] === v && form?.items[i].kind !== 'text' ? '' : v;
    onValues(next);
  };
  return (
    <View style={{ gap: 10 }}>
      <Muted style={{ fontSize: 13 }}>{t('Scheda di valutazione')}</Muted>
      <Chips
        items={[
          ...(none ? [{ value: '', label: t('Nessuna') }] : []),
          ...(oldEval ? [{ value: oldEval.form_id, label: oldEval.name }] : []),
          ...forms.map((f) => ({ value: f.id, label: f.name })),
        ]}
        value={formId}
        onChange={(id) => {
          onForm(id);
          onValues([]);
        }}
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
                  : it.kind === 'choice'
                    ? (it.options ?? []).map((o) => ({ value: o, label: o }))
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
  );
}

/** Finestra del diario: titolo, contenuto e, sotto, le pagine precedenti del cane. */
function DiaryModal({ open, onClose, children, older }: { open: boolean; onClose: () => void; children: ReactNode; older: DogNote[] }) {
  const c = useColors();
  return (
    <Dialog open={open} onClose={onClose}>
      {children}
      {older.length > 0 && (
        <View style={{ gap: 14, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 14 }}>
          <Text style={{ color: c.muted, fontWeight: '800', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>{t('Pagine precedenti')}</Text>
          {older.slice(0, 8).map((n) => (
            <NoteItem key={n.id} n={n} />
          ))}
        </View>
      )}
    </Dialog>
  );
}

export type NoteTarget = { bookingId: string; dogId: string; dogName: string; day: string; lesson: string };

/** Scrive o corregge la pagina del diario di una lezione; sotto, le pagine precedenti del cane. */
export function NoteEditor({ target, onClose }: { target: NoteTarget | null; onClose: () => void }) {
  const { notes, reload } = useDogNotes(target?.dogId ?? null);
  const mine = notes.find((n) => n.booking_id === target?.bookingId) ?? null;
  const forms = useEvalForms(!!target);
  const [work, setWork] = useState('');
  const [comment, setComment] = useState('');
  // Scheda scelta ('' = nessuna) e un valore per voce.
  const [formId, setFormId] = useState('');
  const [values, setValues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

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

  async function save() {
    if (!target) return;
    setErr('');
    setBusy(true);
    const p_eval = oldEval ? { keep: true } : form ? evalPayload(form, values) : null;
    const { error } = await supabase.rpc('save_dog_note', { p_booking: target.bookingId, p_work: work, p_comment: comment, p_eval });
    setBusy(false);
    if (error) return setErr(errorText(error));
    setMsg(t('Salvato nel diario: lo vedono il cliente e il campo.'));
    reload();
  }

  return (
    <DiaryModal open={!!target} onClose={onClose} older={notes.filter((n) => n.booking_id !== target?.bookingId)}>
      <H1>{t('Diario di {cane}', { cane: target?.dogName ?? '' })}</H1>
      {target && <Muted>{`${cap(longDay(target.day))} · ${target.lesson}`}</Muted>}
      <Field label={t('Cosa abbiamo fatto')} value={work} onChangeText={setWork} multiline placeholder={t('Esercizi, durata, progressi')} />
      <Field label={t('Commenti per il cliente')} value={comment} onChangeText={setComment} multiline placeholder={t('Come è andata, cosa provare a casa')} />
      {(forms.length > 0 || !!oldEval) && (
        <EvalFields forms={forms} formId={formId} values={values} onForm={setFormId} onValues={setValues} none oldEval={oldEval} />
      )}
      <ErrorText>{err}</ErrorText>
      {!!msg && <Muted>{msg}</Muted>}
      <Row style={{ justifyContent: 'flex-end' }}>
        <Button small kind="ghost" title={t('Chiudi')} onPress={onClose} />
        <Button small title={mine ? t('Aggiorna il diario') : t('Salva nel diario')} onPress={save} loading={busy} />
      </Row>
    </DiaryModal>
  );
}

export type EvalTarget = { dogId: string; dogName: string };

/** Valutazione del cane fuori dalle lezioni (piano Pro): una pagina di oggi con la scheda e un commento. */
export function DogEvalEditor({ target, onClose, onSaved }: { target: EvalTarget | null; onClose: () => void; onSaved: () => void }) {
  const { notes, reload } = useDogNotes(target?.dogId ?? null);
  const forms = useEvalForms(!!target);
  const [formId, setFormId] = useState('');
  const [values, setValues] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Ogni volta che si apre riparte dalla prima scheda, vuota.
  useEffect(() => {
    Promise.resolve().then(() => {
      setFormId(forms[0]?.id ?? '');
      setValues([]);
      setComment('');
      setErr('');
    });
  }, [target, forms]);

  const form = forms.find((f) => f.id === formId) ?? null;

  async function save() {
    if (!target) return;
    setErr('');
    if (!form) return setErr(t('Scegli una scheda di valutazione'));
    setBusy(true);
    const { error } = await supabase.rpc('add_dog_eval', { p_dog: target.dogId, p_eval: evalPayload(form, values), p_comment: comment });
    setBusy(false);
    if (error) return setErr(errorText(error));
    reload();
    onSaved();
  }

  return (
    <DiaryModal open={!!target} onClose={onClose} older={notes}>
      <H1>{t('Valuta {cane}', { cane: target?.dogName ?? '' })}</H1>
      <Muted>{t('La valutazione va nel diario del cane con la data di oggi: la vedono il cliente e il campo.')}</Muted>
      {forms.length === 0 ? (
        <Muted>{t('Nessuna scheda di valutazione in uso. Il proprietario le prepara in Impostazioni.')}</Muted>
      ) : (
        <EvalFields forms={forms} formId={formId} values={values} onForm={setFormId} onValues={setValues} />
      )}
      <Field label={t('Commento')} value={comment} onChangeText={setComment} multiline placeholder={t('Facoltativo')} />
      <ErrorText>{err}</ErrorText>
      <Row style={{ justifyContent: 'flex-end' }}>
        <Button small kind="ghost" title={t('Chiudi')} onPress={onClose} />
        {forms.length > 0 && <Button small title={t('Salva nel diario')} onPress={save} loading={busy} />}
      </Row>
    </DiaryModal>
  );
}
