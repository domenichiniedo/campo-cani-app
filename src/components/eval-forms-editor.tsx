import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { LimitNote } from '@/components/limit-note';
import { Button, Card, Chips, ErrorText, Field, Muted, Row, Toggle } from '@/components/ui';
import { t, tKey } from '@/lib/i18n';
import { usePlan } from '@/lib/plans';
import { errorText, supabase } from '@/lib/supabase';
import type { EvalForm, EvalItem } from '@/lib/types';

// Le risposte delle voci a scelta si scrivono separate da virgola.
type DraftItem = EvalItem & { optionsText: string };
type Draft = { id?: string; name: string; items: DraftItem[]; active: boolean };

const EVAL_KINDS: { value: EvalItem['kind']; label: string }[] = [
  { value: 'score', label: tKey('Voto da 1 a 5') },
  { value: 'yesno', label: tKey('Sì o no') },
  { value: 'choice', label: tKey('Scelta tra risposte') },
  { value: 'text', label: tKey('Testo') },
];

/** Schede di valutazione che i trainer compilano nel diario. Si salvano a parte dalle altre impostazioni. */
export function EvalFormsEditor() {
  const plan = usePlan();
  const [list, setList] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = () =>
    supabase
      .from('eval_forms')
      .select('*')
      .order('sort')
      .then(({ data }) =>
        setList(
          ((data ?? []) as EvalForm[]).map(({ id, name, items, active }) => ({
            id,
            name,
            items: items.map((it) => ({ ...it, optionsText: (it.options ?? []).join(', ') })),
            active,
          })),
        ),
      );

  useEffect(() => {
    load();
  }, []);

  // Il piano conta le schede in uso: quelle spente non pesano.
  const inUse = list.filter((d) => d.active).length;
  const full = plan.maxEvalForms !== null && inUse >= plan.maxEvalForms;
  const setAt = (i: number, patch: Partial<Draft>) => setList(list.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const setItem = (i: number, k: number, patch: Partial<DraftItem>) =>
    setAt(i, { items: list[i].items.map((it, j) => (j === k ? { ...it, ...patch } : it)) });

  async function save() {
    setErr('');
    setMsg('');
    if (plan.maxEvalForms !== null && inUse > plan.maxEvalForms)
      return setErr(t('Il piano {piano} comprende fino a {max} {cosa}.', { piano: plan.label, max: plan.maxEvalForms, cosa: t('schede in uso') }));
    const rows = [];
    for (const [i, d] of list.entries()) {
      const items: EvalItem[] = d.items.map((it) =>
        it.kind === 'choice'
          ? { label: it.label.trim(), kind: it.kind, options: it.optionsText.split(',').map((o) => o.trim()).filter(Boolean) }
          : { label: it.label.trim(), kind: it.kind },
      );
      if (!d.name.trim()) return setErr(t('Ogni scheda deve avere un nome.'));
      if (!items.length) return setErr(t('{nome}: aggiungi almeno una voce.', { nome: d.name }));
      if (items.some((it) => !it.label)) return setErr(t('{nome}: ogni voce deve avere un nome.', { nome: d.name }));
      const few = items.find((it) => it.kind === 'choice' && (it.options ?? []).length < 2);
      if (few) return setErr(t('{nome}: scrivi almeno due risposte, separate da virgola.', { nome: few.label }));
      rows.push({ id: d.id, name: d.name.trim(), items, sort: i + 1, active: d.active });
    }
    setSaving(true);
    const res = await Promise.all(
      rows.map(({ id, ...r }) => (id ? supabase.from('eval_forms').update(r).eq('id', id) : supabase.from('eval_forms').insert(r))),
    );
    setSaving(false);
    const e = res.find((r) => r.error)?.error;
    if (e) return setErr(errorText(e));
    await load();
    setMsg(t('Schede salvate.'));
  }

  return (
    <>
      <Muted>
        {t('Prepara le schede con le voci che vuoi valutare del cane. Tu e i trainer le compilate con "+ Valuta il cane" quando volete, oppure nella pagina del diario di una lezione; finiscono nel diario del cane e le vede anche il cliente. Cambiare una scheda non cambia quelle già compilate.')}
      </Muted>
      {list.map((d, i) => (
        <Card key={d.id ?? `new-${i}`}>
          <Field label={t('Nome della scheda')} value={d.name} onChangeText={(v) => setAt(i, { name: v })} placeholder={t('Primo incontro')} />
          {d.items.map((it, k) => (
            <View key={k} style={{ gap: 8 }}>
              <Row style={{ alignItems: 'flex-end' }}>
                <Field label={t('Voce {n}', { n: k + 1 })} value={it.label} onChangeText={(v) => setItem(i, k, { label: v })} placeholder={t('Approccio alle persone')} style={{ flex: 1, minWidth: 160 }} />
                <Button small kind="ghost" title={t('Togli')} onPress={() => setAt(i, { items: d.items.filter((_, j) => j !== k) })} />
              </Row>
              <Chips items={EVAL_KINDS.map((x) => ({ value: x.value, label: t(x.label) }))} value={it.kind} onChange={(v) => setItem(i, k, { kind: v })} />
              {it.kind === 'choice' && (
                <Field
                  label={t('Risposte, separate da virgola')}
                  value={it.optionsText}
                  onChangeText={(v) => setItem(i, k, { optionsText: v })}
                  placeholder={t('Accetta, Tollera, Evita, Reagisce')}
                  multiline
                />
              )}
            </View>
          ))}
          <Button small kind="ghost" title={t('+ Aggiungi voce')} disabled={d.items.length >= 40} onPress={() => setAt(i, { items: [...d.items, { label: '', kind: 'score', optionsText: '' }] })} />
          <Toggle label={t('In uso')} value={d.active} onChange={(v) => setAt(i, { active: v })} disabled={!d.active && full} />
        </Card>
      ))}
      <Button title={t('+ Aggiungi scheda')} kind="ghost" disabled={full} onPress={() => setList([...list, { name: '', items: [{ label: '', kind: 'score', optionsText: '' }], active: true }])} />
      <LimitNote kind="maxEvalForms" count={inUse} what={t('schede in uso')} />
      <ErrorText>{err}</ErrorText>
      {!!msg && <Muted>{msg}</Muted>}
      {list.length > 0 && <Button title={t('Salva schede')} onPress={save} loading={saving} />}
    </>
  );
}
