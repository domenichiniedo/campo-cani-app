import { Tabs } from 'expo-router/js-tabs';
import { useState } from 'react';

import { Body, Button, H1, Muted, Screen, tabIcon } from '@/components/ui';
import { t } from '@/lib/i18n';
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
        // Altezza secondo il contenuto: con le scritte ingrandite del telefono le etichette non si tagliano.
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line, height: 'auto', minHeight: 49 },
      }}>
      <Tabs.Screen name="index" options={{ title: t('Lezioni'), tabBarIcon: tabIcon('◷') }} />
      <Tabs.Screen name="hours" options={{ title: t('Disponibilità'), tabBarIcon: tabIcon('◑') }} />
      <Tabs.Screen name="dogs" options={{ title: t('Diari'), tabBarIcon: tabIcon('✎') }} />
      <Tabs.Screen name="profile" options={{ title: t('Profilo'), tabBarIcon: tabIcon('◉') }} />
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
      <H1>{t('Area trainer')}</H1>
      {plan.trainers ? (
        <Body>
          {t('Il tuo account ({email}) non è ancora collegato a un trainer, oppure il trainer non è più attivo. Chiedi al centro di scrivere questa email nella pagina Trainer.', { email: profile?.email ?? '' })}
        </Body>
      ) : (
        <Body>
          {t("Il piano {piano} del centro non comprende l'area trainer: serve il piano {altro} o superiore. Chiedi al centro di cambiare piano.", { piano: plan.label, altro: planWith('trainers') })}
        </Body>
      )}
      <Muted style={{ fontSize: 13 }}>{t('Appena il centro ha fatto, tocca Riprova.')}</Muted>
      <Button title={t('Riprova')} onPress={retry} loading={busy} />
      <Button title={t('Esci')} kind="ghost" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
