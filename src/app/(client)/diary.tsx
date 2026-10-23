import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { DogDiary } from '@/components/dog-diary';
import { Card, Chips, H1, Muted, Screen } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { Dog } from '@/lib/types';

/** Il diario di allenamento dei cani del cliente, scritto dai trainer dopo ogni lezione. */
export default function ClientDiary() {
  const { profile } = useSession();
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!profile) return;
      supabase
        .from('dogs')
        .select('*')
        .eq('owner_id', profile.id)
        .eq('archived', false)
        .order('name')
        .then(({ data }) => {
          setDogs((data ?? []) as Dog[]);
          // Ogni volta che si torna qui il diario si ricarica: il trainer può aver scritto nel frattempo.
          setRound((r) => r + 1);
        });
    }, [profile]),
  );

  const dog = dogs.find((d) => d.id === pick) ?? dogs[0] ?? null;
  return (
    <Screen>
      <H1>{t('Diario di allenamento')}</H1>
      <Muted>{t('Dopo ogni lezione il trainer scrive cosa avete fatto e i suoi commenti.')}</Muted>
      {dogs.length > 1 && <Chips items={dogs.map((d) => ({ value: d.id, label: d.name }))} value={dog?.id ?? null} onChange={setPick} />}
      {dog && (
        <Card>
          <DogDiary key={`${dog.id}-${round}`} dogId={dog.id} empty={t('Il diario di {cane} è ancora vuoto: si riempie dopo le lezioni.', { cane: dog.name })} />
        </Card>
      )}
    </Screen>
  );
}
