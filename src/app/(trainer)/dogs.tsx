import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { DogDiary } from '@/components/dog-diary';
import { Card, Chips, H1, Muted, Screen } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type DogRow = { id: string; name: string; breed: string; profiles: { first_name: string; last_name: string } | null };

/** I diari dei cani che il trainer segue (quelli con almeno una lezione con lui). */
export default function TrainerDogs() {
  const { myTrainer } = useSession();
  const [dogs, setDogs] = useState<DogRow[]>([]);
  const [pick, setPick] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!myTrainer) return;
    // Il database fa vedere al trainer solo i cani delle sue lezioni.
    const { data } = await supabase.from('dogs').select('id, name, breed, profiles(first_name, last_name)').order('name');
    setDogs((data ?? []) as unknown as DogRow[]);
  }, [myTrainer]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const dog = dogs.find((d) => d.id === pick) ?? dogs[0] ?? null;
  return (
    <Screen onRefresh={load}>
      <H1>{t('Diari dei cani')}</H1>
      {dogs.length === 0 && <Muted>{t('Qui trovi i diari dei cani che hanno fatto lezione con te.')}</Muted>}
      {dogs.length > 0 && (
        <Chips items={dogs.map((d) => ({ value: d.id, label: d.name }))} value={dog?.id ?? null} onChange={setPick} />
      )}
      {dog && (
        <Card>
          <Muted>
            {dog.breed ? `${dog.breed} · ` : ''}
            {dog.profiles ? `${dog.profiles.first_name} ${dog.profiles.last_name}` : ''}
          </Muted>
          <DogDiary key={dog.id} dogId={dog.id} />
        </Card>
      )}
    </Screen>
  );
}
