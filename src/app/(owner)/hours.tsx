import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { SlotEditor, editableDays } from '@/components/slot-editor';
import { Body, Button, Chips, H1, Muted, Screen } from '@/components/ui';
import { hm, STEP } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';

export default function OwnerHours() {
  const c = useColors();
  const { settings, fields, trainers } = useSession();
  // Orari dei campi o disponibilità dei trainer: stessa griglia, tabelle diverse.
  const [kind, setKind] = useState<'field' | 'trainer'>('field');
  const [fieldPick, setFieldPick] = useState<string | null>(null);
  const [trainerPick, setTrainerPick] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, number[]>>({});
  const [booked, setBooked] = useState<Record<string, number[]>>({});

  const days = editableDays();
  const from = days[0];
  const to = days[days.length - 1];

  const load = useCallback(async () => {
    const [a, t, b] = await Promise.all([
      supabase.from('availability').select('*').gte('day', from).lte('day', to),
      supabase.from('trainer_availability').select('*').gte('day', from).lte('day', to),
      supabase.from('bookings').select('field_id, trainer_id, day, start_min, dur_min').eq('status', 'active').gte('day', from).lte('day', to),
    ]);
    // Chiavi "id|giorno": ogni campo e ogni trainer ha i suoi orari e le sue lezioni.
    setOpen(
      Object.fromEntries([
        ...((a.data ?? []) as { field_id: string; day: string; slots: number[] }[]).map((r) => [`${r.field_id}|${r.day}`, r.slots]),
        ...((t.data ?? []) as { trainer_id: string; day: string; slots: number[] }[]).map((r) => [`${r.trainer_id}|${r.day}`, r.slots]),
      ]),
    );
    const taken: Record<string, number[]> = {};
    for (const r of (b.data ?? []) as { field_id: string; trainer_id: string | null; day: string; start_min: number; dur_min: number }[])
      for (let m = r.start_min; m < r.start_min + r.dur_min; m += STEP) {
        (taken[`${r.field_id}|${r.day}`] ??= []).push(m);
        if (r.trainer_id) (taken[`${r.trainer_id}|${r.day}`] ??= []).push(m);
      }
    setBooked(taken);
  }, [from, to]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const field = fields.find((f) => f.id === fieldPick) ?? fields[0] ?? null;
  const trainer = trainers.find((t) => t.id === trainerPick) ?? trainers[0] ?? null;
  const forTrainer = kind === 'trainer' && !!trainer;
  // Il campo o il trainer di cui si stanno guardando gli orari.
  const subject = forTrainer ? { id: trainer.id, name: trainer.name } : field;
  if (!settings || !subject) return null;
  const neverSet = forTrainer && !Object.keys(open).some((k) => k.startsWith(`${subject.id}|`));
  const only = (src: Record<string, number[]>) =>
    Object.fromEntries(Object.entries(src).filter(([k]) => k.startsWith(`${subject.id}|`)).map(([k, v]) => [k.split('|')[1], v]));

  async function upsert(targets: string[], slots: number[], ids = [subject!.id]) {
    const { error } = forTrainer
      ? await supabase.from('trainer_availability').upsert(ids.flatMap((id) => targets.map((d) => ({ trainer_id: id, day: d, slots }))))
      : await supabase.from('availability').upsert(ids.flatMap((id) => targets.map((d) => ({ field_id: id, day: d, slots }))));
    if (error) return errorText(error);
    load();
    return null;
  }

  return (
    <Screen>
      <H1>{forTrainer ? t('Orari dei trainer') : t('Orari di apertura')}</H1>
      {trainers.length > 0 && (
        <Chips
          items={[
            { value: 'field', label: t('Campi') },
            { value: 'trainer', label: t('Trainer') },
          ]}
          value={kind}
          onChange={setKind}
        />
      )}
      <Muted>
        {forTrainer
          ? t("Scegli un giorno e tocca le mezz'ore in cui il trainer è disponibile. Le mezz'ore in cui ha già una lezione sono segnate in oro. Il trainer può cambiarle anche dalla sua app.")
          : t("Scegli un giorno e tocca le mezz'ore per aprirle o chiuderle. I clienti vedono solo quelle aperte. Le mezz'ore già prenotate sono segnate in oro.")}
      </Muted>

      {!forTrainer && fields.length > 1 && (
        <Chips items={fields.map((f) => ({ value: f.id, label: f.name }))} value={subject.id} onChange={setFieldPick} />
      )}
      {forTrainer && <Chips items={trainers.map((t) => ({ value: t.id, label: t.name }))} value={subject.id} onChange={setTrainerPick} />}
      {neverSet && (
        <Body style={{ color: c.brassText }}>
          {t("Per {nome} non hai ancora impostato orari, quindi è disponibile sempre. Appena salvi un giorno, potrà avere lezioni solo nelle mezz'ore segnate.", { nome: subject.name })}
        </Body>
      )}

      <SlotEditor
        key={`${kind}-${subject.id}`}
        title={forTrainer || fields.length > 1 ? subject.name : undefined}
        openMin={settings.open_min}
        closeMin={settings.close_min}
        open={only(open)}
        booked={only(booked)}
        onSave={(targets, slots) => upsert(targets, slots)}
        extra={(day, slots, save) =>
          !forTrainer &&
          fields.length > 1 && (
            <Button
              kind="ghost"
              title={t('Usa questi orari su tutti i campi')}
              onPress={() => save(() => upsert([day], slots, fields.map((f) => f.id)), t('Orari copiati su tutti i {n} campi.', { n: fields.length }))}
            />
          )
        }
      />
      <Muted style={{ fontSize: 13 }}>
        {t("La griglia va dalle {da} alle {a}: puoi cambiarla in Impostazioni. Chiudere una mezz'ora non cancella le prenotazioni già fatte.", { da: hm(settings.open_min), a: hm(settings.close_min) })}
      </Muted>
    </Screen>
  );
}
