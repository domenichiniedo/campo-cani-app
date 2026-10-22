import { useEffect, useState } from 'react';

import { Button, Card, Chips, ErrorText, Field, Muted, Row, Toggle } from '@/components/ui';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import type { Package } from '@/lib/types';

type Draft = { id?: string; name: string; lessonType: string; lessons: string; price: string; validDays: string; active: boolean };

const toDraft = (p: Package): Draft => ({
  id: p.id,
  name: p.name,
  lessonType: p.lesson_type ?? '',
  lessons: String(p.lessons),
  price: (p.price_cents / 100).toString().replace('.', ','),
  validDays: p.valid_days ? String(p.valid_days) : '',
  active: p.active,
});

/** Pacchetti di lezioni che i clienti possono richiedere. Si salvano a parte dalle altre impostazioni. */
export function PackagesEditor() {
  const { lessonTypes } = useSession();
  const [list, setList] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = () =>
    supabase
      .from('packages')
      .select('*')
      .order('sort')
      .then(({ data }) => setList(((data ?? []) as Package[]).map(toDraft)));

  useEffect(() => {
    load();
  }, []);

  const setAt = (i: number, patch: Partial<Draft>) => setList(list.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  async function save() {
    setErr('');
    setMsg('');
    const rows = [];
    for (const [i, d] of list.entries()) {
      const lessons = Number(d.lessons), price = Math.round(Number(d.price.replace(',', '.')) * 100);
      const days = d.validDays.trim() ? Number(d.validDays) : null;
      if (!d.name.trim()) return setErr('Ogni pacchetto deve avere un nome.');
      if (!Number.isInteger(lessons) || lessons <= 0) return setErr(`${d.name}: il numero di lezioni deve essere un intero.`);
      if (!Number.isFinite(price) || price < 0) return setErr(`${d.name}: prezzo non valido.`);
      if (days !== null && (!Number.isInteger(days) || days <= 0)) return setErr(`${d.name}: la validità va in giorni, oppure lasciala vuota.`);
      rows.push({ id: d.id, name: d.name.trim(), lesson_type: d.lessonType || null, lessons, price_cents: price, valid_days: days, sort: i + 1, active: d.active });
    }
    setSaving(true);
    const ops = rows.map(({ id, ...r }) =>
      id ? supabase.from('packages').update(r).eq('id', id) : supabase.from('packages').insert(r),
    );
    const res = await Promise.all(ops);
    setSaving(false);
    const e = res.find((r) => r.error)?.error;
    if (e) return setErr(errorText(e));
    await load();
    setMsg('Pacchetti salvati.');
  }

  return (
    <>
      <Muted>
        Il cliente richiede un pacchetto dall&apos;app e tu lo attivi da Clienti quando incassi. Da lì ogni prenotazione di quel
        tipo scala una lezione; se la lezione viene annullata, torna nel pacchetto.
      </Muted>
      {list.map((d, i) => (
        <Card key={d.id ?? `new-${i}`}>
          <Field label="Nome" value={d.name} onChangeText={(v) => setAt(i, { name: v })} placeholder="10 lezioni IGP" />
          <Muted style={{ fontSize: 13 }}>Vale per</Muted>
          <Chips
            items={[{ value: '', label: 'Tutte le lezioni' }, ...lessonTypes.map((t) => ({ value: t.id, label: t.label }))]}
            value={d.lessonType}
            onChange={(v) => setAt(i, { lessonType: v })}
          />
          <Row>
            <Field label="Lezioni" value={d.lessons} onChangeText={(v) => setAt(i, { lessons: v })} keyboardType="number-pad" style={{ flex: 1, minWidth: 90 }} />
            <Field label="Prezzo (€)" value={d.price} onChangeText={(v) => setAt(i, { price: v })} keyboardType="decimal-pad" style={{ flex: 1, minWidth: 90 }} />
            <Field label="Validità (giorni)" value={d.validDays} onChangeText={(v) => setAt(i, { validDays: v })} keyboardType="number-pad" placeholder="sempre" style={{ flex: 1, minWidth: 110 }} />
          </Row>
          <Toggle label="Richiedibile dai clienti" value={d.active} onChange={(v) => setAt(i, { active: v })} />
        </Card>
      ))}
      <Button
        title="+ Aggiungi pacchetto"
        kind="ghost"
        onPress={() => setList([...list, { name: '', lessonType: lessonTypes[0]?.id ?? '', lessons: '10', price: '0', validDays: '180', active: true }])}
      />
      <ErrorText>{err}</ErrorText>
      {!!msg && <Muted>{msg}</Muted>}
      {list.length > 0 && <Button title="Salva pacchetti" onPress={save} loading={saving} />}
    </>
  );
}
