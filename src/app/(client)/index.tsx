import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { TransferDetails } from '@/components/transfer';
import { Badge, Body, Button, Card, Chips, ErrorText, Field, H1, Muted, Row, Screen, Step } from '@/components/ui';
import { addDays, cap, dayKey, euro, fromKey, hm, longDay, monthShort, slotDate, today, weekdayShort } from '@/lib/format';
import { t } from '@/lib/i18n';
import { usePlan } from '@/lib/plans';
import { useSession } from '@/lib/session';
import { startsFor } from '@/lib/slots';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import { useTransfer } from '@/lib/transfer';
import { usable, type Booking, type BusySlot, type ClassSlot, type ClientPackage, type Dog } from '@/lib/types';

const DAYS_AHEAD = 21;

export default function Book() {
  const c = useColors();
  const { profile, settings, lessonTypes: allTypes, fields, trainers } = useSession();
  const plan = usePlan();
  // Le lezioni di gruppo ci sono solo col piano che le comprende.
  const lessonTypes = allTypes.filter((lt) => plan.groups || lt.group_seats === null);
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [open, setOpen] = useState<Record<string, number[]>>({});
  const [busy, setBusy] = useState<BusySlot[]>([]);
  const [packs, setPacks] = useState<ClientPackage[]>([]);
  const [classes, setClasses] = useState<ClassSlot[]>([]);
  const [classId, setClassId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [fieldPick, setFieldPick] = useState<string | null>(null);
  const [dogId, setDogId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [option, setOption] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [start, setStart] = useState<number | null>(null);
  const [pay, setPay] = useState<'onsite' | 'online' | 'transfer'>('onsite');
  const [note, setNote] = useState('');
  const transfer = useTransfer();
  const canTransfer = !!transfer?.enabled;
  const payNow = pay === 'transfer' && !canTransfer ? 'onsite' : pay;
  // La lezione appena prenotata con bonifico, per mostrare subito i dati da pagare.
  const [toPay, setToPay] = useState<{ booking: Booking; dog: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [paidWith, setPaidWith] = useState('');

  const days = useMemo(() => Array.from({ length: DAYS_AHEAD }, (_, i) => dayKey(addDays(today(), i))), []);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const from = days[0], to = days[days.length - 1];
    const [d, a, b, p, cl] = await Promise.all([
      supabase.from('dogs').select('*').eq('owner_id', profile.id).eq('archived', false).order('name'),
      supabase.from('availability').select('*').gte('day', from).lte('day', to),
      supabase.rpc('busy_slots', { from_day: from, to_day: to }),
      supabase.from('client_packages').select('*').eq('user_id', profile.id).eq('status', 'active'),
      plan.groups ? supabase.rpc('class_list', { from_day: from, to_day: to }) : Promise.resolve({ data: [] }),
    ]);
    // Solo le classi non ancora iniziate.
    const now = Date.now();
    setClasses(((cl.data ?? []) as ClassSlot[]).filter((x) => slotDate(x.day, x.start_min).getTime() > now));
    setPacks((p.data ?? []) as ClientPackage[]);
    const list = (d.data ?? []) as Dog[];
    setDogs(list);
    setDogId((cur) => cur ?? list.find((x) => !x.blocked)?.id ?? null);
    setOpen(
      Object.fromEntries(((a.data ?? []) as { field_id: string; day: string; slots: number[] }[]).map((r) => [`${r.field_id}|${r.day}`, r.slots])),
    );
    setBusy((b.data ?? []) as BusySlot[]);
    setLoading(false);
  }, [profile, days, plan.groups]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const type = lessonTypes.find((t) => t.id === typeId) ?? null;
  const dog = dogs.find((d) => d.id === dogId) ?? null;
  const field = fields.find((f) => f.id === fieldPick) ?? fields[0] ?? null;
  const fieldBusy = busy.filter((b) => b.field_id === field?.id);
  const openOn = (k: string) => open[`${field?.id}|${k}`] ?? [];
  const starts = day && type ? startsFor(day, openOn(day), fieldBusy, type.duration_min) : [];
  const openDays = days.filter((k) => type && startsFor(k, openOn(k), fieldBusy, type.duration_min).some((s) => s.state === 'free'));
  // Lo stesso criterio di book_slot: il pacchetto che scade prima tra quelli validi per la lezione.
  const pack = type
    ? packs
        .filter((cp) => usable(cp) && (!cp.lesson_type || cp.lesson_type === type.id))
        .sort((x, y) => (x.expires_at ?? '9999').localeCompare(y.expires_at ?? '9999'))[0]
    : undefined;
  const group = type?.group_seats != null;
  const typeClasses = group ? classes.filter((cl) => cl.lesson_type === type?.id) : [];
  const cls = typeClasses.find((cl) => cl.id === classId) ?? null;
  const ready = group
    ? !!(dog && !dog.blocked && cls)
    : !!(field && dog && !dog.blocked && type && (!type.options.length || option) && day && start != null);
  // Il passo "Campo" compare solo se i campi sono più di uno.
  const manyFields = fields.length > 1;
  const nWhen = manyFields ? '4' : '3';
  const nConfirm = manyFields ? '5' : '4';

  // Testo e dati di pagamento dopo una prenotazione andata a buon fine.
  function after(b: Booking, dogName: string) {
    setPaidWith(
      b.pay === 'package'
        ? t('Lezione scalata dal pacchetto "{nome}".', { nome: pack?.name ?? '' })
        : b.pay === 'transfer'
          ? t('Paga con il bonifico qui sotto: trovi i dati anche in "Le mie lezioni".')
          : b.pay === 'onsite'
            ? t('Paghi al campo.')
            : t('Pagamento online registrato.'),
    );
    setToPay(b.pay === 'transfer' && b.price_cents > 0 ? { booking: b, dog: dogName } : null);
    setNote('');
  }

  // La nota parte solo col piano che la comprende.
  const noteArg = plan.notes && note.trim() ? { p_note: note.trim() } : {};

  async function join() {
    if (!ready || !type || !cls || !dog) return;
    setErr('');
    setSaving(true);
    const { data, error } = await supabase.rpc('join_class', { p_class: cls.id, p_dog: dog.id, p_pay: payNow, ...noteArg });
    setSaving(false);
    if (error) {
      setErr(errorText(error));
      load();
      return;
    }
    const f = fields.find((x) => x.id === cls.field_id);
    after(data as Booking, dog.name);
    setDone(
      t('{lezione} per {cane}, {giorno} alle {ora}', {
        lezione: `${type.label}${cls.lesson_option ? ` · ${cls.lesson_option}` : ''}`,
        cane: dog.name,
        giorno: longDay(cls.day),
        ora: hm(cls.start_min),
      }) + (manyFields && f ? `, ${f.name}${f.address ? ` (${f.address})` : ''}.` : '.'),
    );
    setClassId(null);
    load();
  }

  async function confirm() {
    if (group) return join();
    if (!ready || !field || !type || !day || start == null || !dog) return;
    setErr('');
    setSaving(true);
    const { data, error } = await supabase.rpc('book_slot', {
      p_field: field.id,
      p_dog: dog.id,
      p_type: type.id,
      p_option: option ?? '',
      p_day: day,
      p_start: start,
      p_pay: payNow,
      ...noteArg,
    });
    setSaving(false);
    if (error) {
      setErr(errorText(error));
      load();
      return;
    }
    after(data as Booking, dog.name);
    setDone(
      t('{lezione} per {cane}, {giorno} alle {ora}', {
        lezione: `${type.label}${option ? ` · ${option}` : ''}`,
        cane: dog.name,
        giorno: longDay(day),
        ora: hm(start),
      }) + (manyFields ? `, ${field.name}${field.address ? ` (${field.address})` : ''}.` : '.'),
    );
    setStart(null);
    load();
  }

  if (done) {
    return (
      <Screen>
        <H1>{t('Prenotato')}</H1>
        <Card accent>
          <Body bold>{done}</Body>
          <Muted>
            {paidWith} {t('Puoi disdire fino a {ore} ore prima da "Le mie lezioni".', { ore: settings?.cancel_hours ?? 0 })}
          </Muted>
        </Card>
        {toPay && transfer && <TransferDetails booking={toPay.booking} dog={toPay.dog} cfg={transfer} />}
        <Button title={t('Vedi le mie lezioni')} onPress={() => { setDone(null); router.push('/bookings'); }} />
        <Button title={t("Prenota un'altra lezione")} kind="ghost" onPress={() => setDone(null)} />
      </Screen>
    );
  }

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <H1>{t('Prenota il campo')}</H1>

      <Step n="1" title={t('Cane')} />
      {dogs.length ? (
        <Chips
          items={dogs.map((d) => ({ value: d.id, label: d.blocked ? `${d.name} (${t('sospeso')})` : d.name, disabled: d.blocked }))}
          value={dogId}
          onChange={setDogId}
        />
      ) : (
        <Muted>{t('Aggiungi un cane dal Profilo per poter prenotare.')}</Muted>
      )}
      {dogs.some((d) => d.blocked) && (
        <Muted>{t('Un cane sospeso per penalità non può essere prenotato finché il campo non lo riattiva.')}</Muted>
      )}

      <Step n="2" title={t('Lezione')} />
      <View style={{ gap: 10 }}>
        {lessonTypes.map((lt) => {
          const on = lt.id === typeId;
          return (
            <Pressable
              key={lt.id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => {
                setTypeId(lt.id);
                setOption(null);
                setStart(null);
                setClassId(null);
              }}
              style={{
                borderWidth: on ? 2 : 1,
                borderColor: on ? c.accent : c.line,
                backgroundColor: on ? c.accentSoft : c.surface,
                borderRadius: 10,
                padding: 14,
                gap: 4,
              }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: c.text, fontSize: 17, fontWeight: '800' }}>{lt.label}</Text>
                <Badge tone="warn">{`${lt.duration_min} min · ${euro(lt.price_cents)}`}</Badge>
              </Row>
              {lt.group_seats !== null && <Muted style={{ fontSize: 13 }}>{t('Lezione di gruppo: scegli una delle classi in calendario.')}</Muted>}
              {!!lt.description && <Muted>{lt.description}</Muted>}
            </Pressable>
          );
        })}
      </View>
      {type && !group && type.options.length > 0 && (
        <Chips items={type.options.map((o) => ({ value: o, label: o }))} value={option} onChange={setOption} />
      )}

      {type && group && (
        <>
          <Step n="3" title={t('Classe')} />
          {typeClasses.length === 0 ? (
            <Muted>{t('Nessuna classe in calendario nelle prossime tre settimane. Riprova più avanti.')}</Muted>
          ) : (
            <View style={{ gap: 8 }}>
              {typeClasses.map((cl) => {
                const on = cl.id === classId;
                const left = cl.seats - cl.taken;
                const inside = !!dogId && cl.my_dogs.includes(dogId);
                const off = left <= 0 || inside;
                const f = fields.find((x) => x.id === cl.field_id);
                const tr = trainers.find((x) => x.id === cl.trainer_id);
                return (
                  <Pressable
                    key={cl.id}
                    disabled={off}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on, disabled: off }}
                    onPress={() => setClassId(cl.id)}
                    style={{
                      borderWidth: on ? 2 : 1,
                      borderColor: on ? c.accent : c.line,
                      backgroundColor: on ? c.accentSoft : off ? c.taken : c.surface,
                      borderRadius: 10,
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      gap: 2,
                    }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text style={{ color: off ? c.takenText : c.text, fontSize: 16, fontWeight: '800' }}>
                        {`${cap(longDay(cl.day))} · ${hm(cl.start_min)}`}
                      </Text>
                      <Badge tone={inside ? 'ok' : left > 0 ? 'warn' : 'bad'}>
                        {inside ? t('Già iscritto') : left <= 0 ? t('Al completo') : left === 1 ? t('1 posto libero') : t('{n} posti liberi', { n: left })}
                      </Badge>
                    </Row>
                    {(!!cl.lesson_option || (manyFields && f) || tr) && (
                      <Muted style={{ fontSize: 13 }}>
                        {[cl.lesson_option, manyFields ? f?.name : '', tr ? t('Trainer: {nome}', { nome: tr.name }) : ''].filter(Boolean).join(' · ')}
                      </Muted>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </>
      )}

      {type && !group && manyFields && (
        <>
          <Step n="3" title={t('Campo')} />
          <View style={{ gap: 8 }}>
            {fields.map((f) => {
              const on = f.id === field?.id;
              return (
                <Pressable
                  key={f.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    setFieldPick(f.id);
                    setDay(null);
                    setStart(null);
                  }}
                  style={{
                    borderWidth: on ? 2 : 1,
                    borderColor: on ? c.accent : c.line,
                    backgroundColor: on ? c.accentSoft : c.surface,
                    borderRadius: 10,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                  }}>
                  <Text style={{ color: c.text, fontSize: 16, fontWeight: '800' }}>{f.name}</Text>
                  {!!f.address && <Muted style={{ fontSize: 13 }}>{f.address}</Muted>}
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {type && !group && (
        <>
          <Step n={nWhen} title={t('Giorno e ora')} />
          {openDays.length === 0 ? (
            <Muted>{t('Nessun orario libero nelle prossime tre settimane. Riprova più avanti.')}</Muted>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {openDays.map((k) => {
                const d = fromKey(k);
                const on = k === day;
                return (
                  <Pressable
                    key={k}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      setDay(k);
                      setStart(null);
                    }}
                    style={{
                      width: 62,
                      paddingVertical: 8,
                      alignItems: 'center',
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: on ? c.pitch : c.line,
                      backgroundColor: on ? c.pitch : c.surface,
                    }}>
                    <Text style={{ color: on ? c.onPitchMuted : c.muted, fontSize: 12, fontWeight: '700' }}>{weekdayShort(d)}</Text>
                    <Text style={{ color: on ? c.onPitch : c.text, fontSize: 22, fontWeight: '800' }}>{d.getDate()}</Text>
                    <Text style={{ color: on ? c.onPitchMuted : c.muted, fontSize: 12 }}>{monthShort(d)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          {day && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {starts.map(({ start: s, state }) => {
                const on = s === start;
                const free = state === 'free';
                return (
                  <Pressable
                    key={s}
                    disabled={!free}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on, disabled: !free }}
                    onPress={() => setStart(s)}
                    style={{
                      width: 76,
                      paddingVertical: 10,
                      alignItems: 'center',
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: on ? c.accent : state === 'mine' ? c.brass : free ? c.lineStrong : c.taken,
                      backgroundColor: on ? c.accent : state === 'mine' ? c.brassSoft : free ? c.surface : c.taken,
                    }}>
                    <Text
                      style={{
                        color: on ? c.onAccent : state === 'mine' ? c.brassText : free ? c.text : c.takenText,
                        fontWeight: '700',
                        textDecorationLine: state === 'taken' ? 'line-through' : 'none',
                      }}>
                      {hm(s)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </>
      )}

      {ready && type && dog && (group ? cls : day && start != null) && (
        <>
          <Step n={group ? '4' : nConfirm} title={t('Conferma')} />
          <Card accent>
            <Body bold>
              {t('{lezione} per {cane}', { lezione: `${type.label}${(cls?.lesson_option ?? option) ? ` · ${cls?.lesson_option ?? option}` : ''}`, cane: dog.name })}
            </Body>
            <Muted>
              {cls
                ? t('{giorno}, dalle {da} alle {a}', { giorno: longDay(cls.day), da: hm(cls.start_min), a: hm(cls.start_min + cls.dur_min) })
                : t('{giorno}, dalle {da} alle {a}', { giorno: longDay(day!), da: hm(start!), a: hm(start! + type.duration_min) })}
              {pack ? '' : ` · ${euro(type.price_cents)}`}
            </Muted>
            {group && <Muted>{t('Lezione di gruppo: in campo con altri cani.')}</Muted>}
            {manyFields && field && !group && (
              <Muted>
                {field.name}
                {field.address ? ` · ${field.address}` : ''}
              </Muted>
            )}
            {pack ? (
              <Body>
                {t('Si scala dal pacchetto "{nome}": {n} lezioni rimaste dopo questa.', { nome: pack.name, n: pack.lessons_total - pack.lessons_used - 1 })}
              </Body>
            ) : (
              <Chips
                items={[
                  { value: 'onsite', label: t('Pago al campo') },
                  ...(canTransfer ? [{ value: 'transfer', label: t('Bonifico istantaneo') }] : []),
                  { value: 'online', label: t('Pago online'), disabled: !settings?.online_payments },
                ]}
                value={payNow}
                onChange={(v) => setPay(v as 'onsite' | 'online' | 'transfer')}
              />
            )}
            {!pack && payNow === 'transfer' && (
              <Muted style={{ fontSize: 13 }}>{t('Dopo la conferma ti mostriamo IBAN, importo e causale, con il QR per la tua banca.')}</Muted>
            )}
            {!pack && !settings?.online_payments && <Muted style={{ fontSize: 12 }}>{t('Il pagamento online non è ancora attivo.')}</Muted>}
            {plan.notes && (
              <Field
                label={t('Nota per il centro (se vuoi)')}
                value={note}
                onChangeText={setNote}
                placeholder={t('Per esempio: il cane ha paura dei rumori, arrivo 5 minuti prima')}
                multiline
                maxLength={500}
              />
            )}
            <ErrorText>{err}</ErrorText>
            <Button title={t('Conferma prenotazione')} onPress={confirm} loading={saving} />
          </Card>
        </>
      )}
    </Screen>
  );
}
