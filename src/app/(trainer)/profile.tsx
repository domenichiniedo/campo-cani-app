import { Body, Button, Card, H1, Muted, Screen } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { fullName } from '@/lib/types';

export default function TrainerProfile() {
  const { profile, myTrainer, lessonTypes } = useSession();
  const follows = myTrainer?.lessons.length
    ? myTrainer.lessons.map((id) => lessonTypes.find((t) => t.id === id)?.label ?? id).join(', ')
    : 'tutte le lezioni';
  return (
    <Screen>
      <H1>Profilo</H1>
      <Card>
        <Body bold>{fullName(profile) || myTrainer?.name}</Body>
        <Muted>{profile?.email}</Muted>
        {myTrainer && <Muted>{`Trainer ${myTrainer.name} · segui ${follows}`}</Muted>}
      </Card>
      <Muted style={{ fontSize: 13 }}>Nome, lezioni che segui e collegamento dell&apos;account li cambia il centro.</Muted>
      <Button title="Esci" kind="ghost" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
