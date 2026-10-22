import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { SlotEditor, editableDays } from '@/components/slot-editor';
import { Body, H1, Muted, Screen } from '@/components/ui';
import { STEP } from '@/lib/format';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';

/** Il trainer segna le mezz'ore in cui è disponibile per le lezioni. */
export default function TrainerHours() {
  const c = useColors();
  const { settings, myTrainer } = useSession();
  const [open, setOpen] = useState<Record<string, number[]>>({});
  const [booked, setBooked] = useState<Record<string, number[]>>({});
  const [everSet, setEverSet] = useState(true);

  const days = editableDays();
  const from = days[0];
  const to = days[days.length - 1];

  const load = useCallback(async () => {
    if (!myTrainer) return;
    const [a, any, b] = await Promise.all([
      supabase.from('trainer_availability').select('day, slots').eq('trainer_id', myTrainer.id).gte('day', from).lte('day', to),
      supabase.from('trainer_availability').select('day').eq('trainer_id', myTrainer.id).limit(1),
      supabase.from('bookings').select('day, start_min, dur_min').eq('trainer_id', myTrainer.id).eq('status', 'active').gte('day', from).lte('day', to),
    ]);
    setOpen(Object.fromEntries(((a.data ?? []) as { day: string; slots: number[] }[]).map((r) => [r.day, r.slots])));
    setEverSet((any.data ?? []).length > 0);
    const taken: Record<string, number[]> = {};
    for (const r of (b.data ?? []) as { day: string; start_min: number; dur_min: number }[])
      for (let m = r.start_min; m < r.start_min + r.dur_min; m += STEP) (taken[r.day] ??= []).push(m);
    setBooked(taken);
  }, [from, to, myTrainer]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!settings || !myTrainer) return null;

  return (
    <Screen>
      <H1>La mia disponibilità</H1>
      <Muted>
        Scegli un giorno e tocca le mezz&apos;ore in cui puoi fare lezione. Il campo ti assegna lezioni solo lì. In oro le mezz&apos;ore in cui hai già
        una lezione.
      </Muted>
      {!everSet && (
        <Body style={{ color: c.brassText }}>
          Non hai ancora segnato orari, quindi per il campo sei disponibile sempre. Appena salvi un giorno, conteranno solo le mezz&apos;ore segnate.
        </Body>
      )}
      <SlotEditor
        openMin={settings.open_min}
        closeMin={settings.close_min}
        open={open}
        booked={booked}
        onSave={async (targets, slots) => {
          const { error } = await supabase.from('trainer_availability').upsert(targets.map((d) => ({ trainer_id: myTrainer.id, day: d, slots })));
          if (error) return errorText(error);
          load();
          return null;
        }}
      />
    </Screen>
  );
}
