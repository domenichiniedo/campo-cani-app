import { useEffect, useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';

import { Body, Button, Chips, ErrorText, Field, H1, Muted, Row } from '@/components/ui';
import { hm, isDayKey, longDay, parseHm, STEP } from '@/lib/format';
import { t } from '@/lib/i18n';
import type { OwnerClass } from '@/lib/owner';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import { fullName, type Dog, type Profile } from '@/lib/types';

/** Da dove parte la prenotazione; con `cls` il cane si iscrive a quella classe di gruppo. */
export type BookStart = { day: string; start: number; fieldId?: string; cls?: OwnerClass };

type Client = Profile & { dogs: Dog[] };

/** Il proprietario prenota una lezione per un cliente già iscritto, o lo iscrive a una classe. */
export function OwnerBook({ start, onClose, onDone }: { start: BookStart | null; onClose: () => void; onDone: () => void }) {
  const c = useColors();
  const { fields, lessonTypes, trainers } = useSession();
  const [clients, setClients] = useState<Client[]>([]);
  const [q, setQ] = useState('');
  const [client, setClient] = useState<Client | null>(null);
  const [dog, setDog] = useState<string | null>(null);
  // Le lezioni di gruppo si prenotano solo iscrivendosi a una classe.
  const single = lessonTypes.filter((lt) => lt.group_seats === null);
  const [type, setType] = useState<string | null>(single[0]?.id ?? null);
  const cls = start?.cls ?? null;
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
    if (!client || !dog) return setErr(t('Scegli il cliente e il cane.'));
    if (cls) {
      setBusy(true);
      const { error } = await supabase.rpc('join_class', { p_class: cls.id, p_dog: dog, p_pay: 'onsite', p_user: client.id });
      setBusy(false);
      if (error) return setErr(errorText(error));
      return onDone();
    }
    if (!lesson) return setErr(t('Scegli la lezione.'));
    if (lesson.options.length && !option) return setErr(t('Scegli la specialità.'));
    if (!field) return setErr(t('Scegli il campo.'));
    if (!isDayKey(day)) return setErr(t('Scrivi il giorno come AAAA-MM-GG.'));
    if (startMin === null || startMin % STEP) return setErr(t('Scrivi l’ora come 10:00 o 10:30.'));
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
            <H1>{cls ? t('Iscrivi alla classe') : t('Prenota per un cliente')}</H1>
            {cls && (
              <Muted>
                {`${cls.lesson_types?.label ?? cls.lesson_type}${cls.lesson_option ? ` · ${cls.lesson_option}` : ''} · ${longDay(cls.day)} · ${hm(cls.start_min)}`}
              </Muted>
            )}

            {client ? (
              <Row style={{ justifyContent: 'space-between' }}>
                <Body bold>{fullName(client)}</Body>
                <Button small kind="ghost" title={t('Cambia cliente')} onPress={() => setClient(null)} />
              </Row>
            ) : (
              <>
                <Field label={t('Cliente')} value={q} onChangeText={setQ} placeholder={t('Nome, telefono o nome del cane')} autoFocus />
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
                  {matches.length === 0 && <Muted>{t("Nessun cliente trovato. I clienti nuovi si iscrivono dall'app.")}</Muted>}
                </View>
              </>
            )}

            {client && (
              <>
                <Muted style={{ fontSize: 13 }}>{t('Cane')}</Muted>
                {dogs.length ? (
                  <Chips items={dogs.map((d) => ({ value: d.id, label: d.blocked ? `${d.name} (${t('sospeso')})` : d.name }))} value={dog} onChange={setDog} />
                ) : (
                  <Muted>{t('Questo cliente non ha cani registrati.')}</Muted>
                )}
              </>
            )}

            {!cls && (
              <>
                <Muted style={{ fontSize: 13 }}>{t('Lezione')}</Muted>
                <Chips
                  items={single.map((lt) => ({ value: lt.id, label: lt.label }))}
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
                        // Solo i trainer che seguono questa lezione (lista vuota = tutte).
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
                {closed && <Body style={{ color: c.brassText }}>{t("A quell'ora il campo risulta chiuso: puoi prenotare lo stesso.")}</Body>}
                {lesson && (
                  <Muted style={{ fontSize: 13 }}>
                    {t('Dura {min} minuti. Se il cliente ha un pacchetto valido si scala da lì, altrimenti paga al campo.', { min: lesson.duration_min })}
                  </Muted>
                )}
              </>
            )}
            {cls && (
              <Muted style={{ fontSize: 13 }}>
                {t('Se il cliente ha un pacchetto valido si scala da lì, altrimenti paga al campo.')}
              </Muted>
            )}

            <ErrorText>{err}</ErrorText>
            <Row style={{ justifyContent: 'flex-end' }}>
              <Button small kind="ghost" title={t('Annulla')} onPress={onClose} />
              <Button small title={cls ? t('Iscrivi') : t('Prenota')} onPress={save} loading={busy} />
            </Row>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
