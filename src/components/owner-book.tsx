import { useEffect, useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';

import { Body, Button, Chips, ErrorText, Field, H1, Muted, Row } from '@/components/ui';
import { hm, isDayKey, parseHm, STEP } from '@/lib/format';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import { fullName, type Dog, type Profile } from '@/lib/types';

export type BookStart = { day: string; start: number; fieldId?: string };

type Client = Profile & { dogs: Dog[] };

/** Il proprietario prenota una lezione per un cliente già iscritto. */
export function OwnerBook({ start, onClose, onDone }: { start: BookStart | null; onClose: () => void; onDone: () => void }) {
  const c = useColors();
  const { fields, lessonTypes, trainers } = useSession();
  const [clients, setClients] = useState<Client[]>([]);
  const [q, setQ] = useState('');
  const [client, setClient] = useState<Client | null>(null);
  const [dog, setDog] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(lessonTypes[0]?.id ?? null);
  const [option, setOption] = useState<string | null>(null);
  const [field, setField] = useState<string | null>(null);
  const [trainer, setTrainer] = useState<string>('');
  const [day, setDay] = useState('');
  const [time, setTime] = useState('');
  const [open, setOpen] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Ogni volta che si apre riparte dal giorno, dall'ora e dal campo scelti nella griglia.
  useEffect(() => {
    if (!start) return;
    supabase
      .from('profiles')
      .select('*, dogs(*)')
      .eq('role', 'client')
      .order('last_name')
      .then(({ data }) => setClients((data ?? []) as Client[]));
    Promise.resolve().then(() => {
      setDay(start.day);
      setTime(hm(start.start));
      setField(start.fieldId ?? fields[0]?.id ?? null);
      setClient(null);
      setDog(null);
      setTrainer('');
      setQ('');
      setErr('');
    });
  }, [start, fields]);

  // Orari aperti di quel campo e giorno, solo per avvisare: il proprietario può prenotare lo stesso.
  useEffect(() => {
    if (!field || !isDayKey(day)) return;
    supabase
      .from('availability')
      .select('slots')
      .eq('field_id', field)
      .eq('day', day)
      .maybeSingle()
      .then(({ data }) => setOpen((data?.slots as number[] | undefined) ?? []));
  }, [field, day]);

  const lesson = lessonTypes.find((t) => t.id === type) ?? null;
  const needle = q.trim().toLowerCase();
  const matches = needle
    ? clients.filter(
        (p) => fullName(p).toLowerCase().includes(needle) || p.phone.includes(needle) || p.dogs.some((d) => d.name.toLowerCase().includes(needle)),
      )
    : clients;
  const dogs = (client?.dogs ?? []).filter((d) => !d.archived);
  const startMin = parseHm(time);
  const closed =
    open !== null && startMin !== null && lesson
      ? Array.from({ length: lesson.duration_min / STEP }, (_, i) => startMin + i * STEP).some((m) => !open.includes(m))
      : false;

  function pickClient(p: Client) {
    setClient(p);
    const ds = p.dogs.filter((d) => !d.archived);
    setDog(ds.length === 1 ? ds[0].id : null);
  }

  async function save() {
    setErr('');
    if (!client || !dog) return setErr('Scegli il cliente e il cane.');
    if (!lesson) return setErr('Scegli la lezione.');
    if (lesson.options.length && !option) return setErr('Scegli la specialità.');
    if (!field) return setErr('Scegli il campo.');
    if (!isDayKey(day)) return setErr('Scrivi il giorno come AAAA-MM-GG.');
    if (startMin === null || startMin % STEP) return setErr('Scrivi l’ora come 10:00 o 10:30.');
    setBusy(true);
    const { error } = await supabase.rpc('owner_book', {
      p_user: client.id,
      p_field: field,
      p_dog: dog,
      p_type: lesson.id,
      p_option: option ?? '',
      p_day: day,
      p_start: startMin,
      p_trainer: trainer || null,
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
            <H1>Prenota per un cliente</H1>

            {client ? (
              <Row style={{ justifyContent: 'space-between' }}>
                <Body bold>{fullName(client)}</Body>
                <Button small kind="ghost" title="Cambia cliente" onPress={() => setClient(null)} />
              </Row>
            ) : (
              <>
                <Field label="Cliente" value={q} onChangeText={setQ} placeholder="Nome, telefono o nome del cane" autoFocus />
                <View style={{ gap: 6 }}>
                  {matches.slice(0, 8).map((p) => (
                    <Button
                      key={p.id}
                      small
                      kind="ghost"
                      title={`${fullName(p)}${p.dogs.length ? ` · ${p.dogs.map((d) => d.name).join(', ')}` : ''}`}
                      onPress={() => pickClient(p)}
                    />
                  ))}
                  {matches.length === 0 && <Muted>Nessun cliente trovato. I clienti nuovi si iscrivono dall&apos;app.</Muted>}
                </View>
              </>
            )}

            {client && (
              <>
                <Muted style={{ fontSize: 13 }}>Cane</Muted>
                {dogs.length ? (
                  <Chips items={dogs.map((d) => ({ value: d.id, label: d.blocked ? `${d.name} (sospeso)` : d.name }))} value={dog} onChange={setDog} />
                ) : (
                  <Muted>Questo cliente non ha cani registrati.</Muted>
                )}
              </>
            )}

            <Muted style={{ fontSize: 13 }}>Lezione</Muted>
            <Chips
              items={lessonTypes.map((t) => ({ value: t.id, label: t.label }))}
              value={type}
              onChange={(v) => {
                setType(v);
                setOption(null);
                setTrainer('');
              }}
            />
            {!!lesson?.options.length && <Chips items={lesson.options.map((o) => ({ value: o, label: o }))} value={option} onChange={setOption} />}

            {fields.length > 1 && (
              <>
                <Muted style={{ fontSize: 13 }}>Campo</Muted>
                <Chips items={fields.map((f) => ({ value: f.id, label: f.name }))} value={field} onChange={setField} />
              </>
            )}

            {trainers.length > 0 && (
              <>
                <Muted style={{ fontSize: 13 }}>Trainer</Muted>
                <Chips
                  items={[
                    { value: '', label: 'Da assegnare' },
                    // Solo i trainer che seguono questa lezione (lista vuota = tutte).
                    ...trainers
                      .filter((t) => !t.lessons.length || (type && t.lessons.includes(type)))
                      .map((t) => ({ value: t.id, label: t.name })),
                  ]}
                  value={trainer}
                  onChange={setTrainer}
                />
              </>
            )}

            <Row>
              <Field label="Giorno" value={day} onChangeText={setDay} placeholder="2026-10-23" style={{ flex: 1, minWidth: 140 }} />
              <Field label="Ora" value={time} onChangeText={setTime} placeholder="10:00" style={{ flex: 1, minWidth: 100 }} />
            </Row>
            {closed && <Body style={{ color: c.brassText }}>A quell&apos;ora il campo risulta chiuso: puoi prenotare lo stesso.</Body>}
            {lesson && (
              <Muted style={{ fontSize: 13 }}>
                Dura {lesson.duration_min} minuti. Se il cliente ha un pacchetto valido si scala da lì, altrimenti paga al campo.
              </Muted>
            )}

            <ErrorText>{err}</ErrorText>
            <Row style={{ justifyContent: 'flex-end' }}>
              <Button small kind="ghost" title="Annulla" onPress={onClose} />
              <Button small title="Prenota" onPress={save} loading={busy} />
            </Row>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
