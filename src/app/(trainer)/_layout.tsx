import { Tabs } from 'expo-router/js-tabs';
import { useState } from 'react';

import { Body, Button, H1, Muted, Screen, tabIcon } from '@/components/ui';
import { planWith, usePlan } from '@/lib/plans';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';

export default function TrainerLayout() {
  const c = useColors();
  const { myTrainer } = useSession();
  if (!myTrainer) return <NotLinked />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Lezioni', tabBarIcon: tabIcon('◷') }} />
      <Tabs.Screen name="hours" options={{ title: 'Disponibilità', tabBarIcon: tabIcon('◑') }} />
      <Tabs.Screen name="dogs" options={{ title: 'Diari', tabBarIcon: tabIcon('✎') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profilo', tabBarIcon: tabIcon('◉') }} />
    </Tabs>
  );
}

/** Account da trainer che non porta a nessun trainer: piano senza trainer, o non ancora collegato dal centro. */
function NotLinked() {
  const plan = usePlan();
  const { profile, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  async function retry() {
    setBusy(true);
    await refresh();
    setBusy(false);
  }
  return (
    <Screen>
      <H1>Area trainer</H1>
      {plan.trainers ? (
        <Body>
          {`Il tuo account (${profile?.email ?? ''}) non è ancora collegato a un trainer, oppure il trainer non è più attivo. Chiedi al centro di scrivere questa email nella pagina Trainer.`}
        </Body>
      ) : (
        <Body>
          {`Il piano ${plan.label} del centro non comprende l'area trainer: serve il piano ${planWith('trainers')} o superiore. Chiedi al centro di cambiare piano.`}
        </Body>
      )}
      <Muted style={{ fontSize: 13 }}>Appena il centro ha fatto, tocca Riprova.</Muted>
      <Button title="Riprova" onPress={retry} loading={busy} />
      <Button title="Esci" kind="ghost" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
