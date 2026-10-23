import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Badge, Body, Button, Card, Chips, ErrorText, H1, Muted, Row, Screen, Step } from '@/components/ui';
import { addDays, dayKey, euro, fromKey, hm, longDay, monthShort, today, weekdayShort } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { startsFor } from '@/lib/slots';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import { usable, type BusySlot, type ClientPackage, type Dog } from '@/lib/types';

const DAYS_AHEAD = 21;

export default function Book() {
  const c = useColors();
  const { profile, settings, lessonTypes, fields } = useSession();
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [open, setOpen] = useState<Record<string, number[]>>({});
  const [busy, setBusy] = useState<BusySlot[]>([]);
  const [packs, setPacks] = useState<ClientPackage[]>([]);
  const [loading, setLoading] = useState(false);

  const [fieldPick, setFieldPick] = useState<string | null>(null);
  const [dogId, setDogId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [option, setOption] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [start, setStart] = useState<number | null>(null);
  const [pay, setPay] = useState<'onsite' | 'online'>('onsite');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [paidWith, setPaidWith] = useState('');

  const days = useMemo(() => Array.from({ length: DAYS_AHEAD }, (_, i) => dayKey(addDays(today(), i))), []);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const from = days[0], to = days[days.length - 1];
    const [d, a, b, p] = await Promise.all([
      supabase.from('dogs').select('*').eq('owner_id', profile.id).eq('archived', false).order('name'),
      supabase.from('availability').select('*').gte('day', from).lte('day', to),
      supabase.rpc('busy_slots', { from_day: from, to_day: to }),
      supabase.from('client_packages').select('*').eq('user_id', profile.id).eq('status', 'active'),
    ]);
    setPacks((p.data ?? []) as ClientPackage[]);
    const list = (d.data ?? []) as Dog[];
    setDogs(list);
    setDogId((cur) => cur ?? list.find((x) => !x.blocked)?.id ?? null);
    setOpen(
      Object.fromEntries(((a.data ?? []) as { field_id: string; day: string; slots: number[] }[]).map((r) => [`${r.field_id}|${r.day}`, r.slots])),
    );
    setBusy((b.data ?? []) as BusySlot[]);
    setLoading(false);
  }, [profile, days]);

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
  const ready = !!(field && dog && !dog.blocked && type && (!type.options.length || option) && day && start != null);
  // Il passo "Campo" compare solo se i campi sono più di uno.
  const manyFields = fields.length > 1;
  const nWhen = manyFields ? '4' : '3';
  const nConfirm = manyFields ? '5' : '4';

  async function confirm() {
    if (!ready || !field || !type || !day || start == null || !dog) return;
    setErr('');
    setSaving(true);
    const { error } = await supabase.rpc('book_slot', {
      p_field: field.id,
      p_dog: dog.id,
      p_type: type.id,
      p_option: option ?? '',
      p_day: day,
      p_start: start,
      p_pay: pay,
    });
    setSaving(false);
    if (error) {
      setErr(errorText(error));
      load();
      return;
    }
    setPaidWith(pack ? t('Lezione scalata dal pacchetto "{nome}".', { nome: pack.name }) : pay === 'onsite' ? t('Paghi al campo.') : t('Pagamento online registrato.'));
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
              {!!lt.description && <Muted>{lt.description}</Muted>}
            </Pressable>
          );
        })}
      </View>
      {type && type.options.length > 0 && (
        <Chips items={type.options.map((o) => ({ value: o, label: o }))} value={option} onChange={setOption} />
      )}

      {type && manyFields && (
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

      {type && (
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

      {ready && type && day && start != null && dog && (
        <>
          <Step n={nConfirm} title={t('Conferma')} />
          <Card accent>
            <Body bold>
              {t('{lezione} per {cane}', { lezione: `${type.label}${option ? ` · ${option}` : ''}`, cane: dog.name })}
            </Body>
            <Muted>
              {t('{giorno}, dalle {da} alle {a}', { giorno: longDay(day), da: hm(start), a: hm(start + type.duration_min) })}
              {pack ? '' : ` · ${euro(type.price_cents)}`}
            </Muted>
            {manyFields && field && (
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
                  { value: 'online', label: t('Pago online'), disabled: !settings?.online_payments },
                ]}
                value={pay}
                onChange={(v) => setPay(v as 'onsite' | 'online')}
              />
            )}
            {!pack && !settings?.online_payments && <Muted style={{ fontSize: 12 }}>{t('Il pagamento online non è ancora attivo.')}</Muted>}
            <ErrorText>{err}</ErrorText>
            <Button title={t('Conferma prenotazione')} onPress={confirm} loading={saving} />
          </Card>
        </>
      )}
    </Screen>
  );
}
