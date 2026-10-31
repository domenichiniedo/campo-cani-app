import { Tabs } from 'expo-router/js-tabs';
import { useWindowDimensions } from 'react-native';

import { OwnerSidebar } from '@/components/owner-sidebar';
import { PaymentRequest } from '@/components/pay-now';
import { tabIcon } from '@/components/ui';
import { t } from '@/lib/i18n';
import { usePlan } from '@/lib/plans';
import { useColors } from '@/lib/theme';

export default function OwnerLayout() {
  const c = useColors();
  const plan = usePlan();
  // Sul computer il menu a sinistra resta aperto; sul telefono si apre con ☰ nella fascia in alto.
  const wide = useWindowDimensions().width >= 900;
  return (
    <>
      <PaymentRequest />
      <Tabs
        // Le pagine stanno nel menu a sinistra, raggruppate, con le sottoschede di quella aperta.
        tabBar={(props) => <OwnerSidebar {...props} wide={wide} />}
        screenOptions={{
          tabBarPosition: 'left',
          headerShown: false,
          tabBarActiveTintColor: c.accent,
          tabBarInactiveTintColor: c.muted,
          // Altezza secondo il contenuto: con le scritte ingrandite del telefono le etichette non si tagliano.
          tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line, height: 'auto', minHeight: 49 },
        }}>
        <Tabs.Screen name="index" options={{ title: t('Giorno'), tabBarIcon: tabIcon('◷') }} />
        <Tabs.Screen name="week" options={{ title: t('Settimana'), tabBarIcon: tabIcon('▦') }} />
        <Tabs.Screen name="hours" options={{ title: t('Orari'), tabBarIcon: tabIcon('◑') }} />
        <Tabs.Screen name="clients" options={{ title: t('Clienti'), tabBarIcon: tabIcon('☺') }} />
        <Tabs.Screen name="board" options={{ title: t('Bacheca'), tabBarIcon: tabIcon('✉') }} />
        <Tabs.Screen name="stats" options={{ title: t('Incassi'), tabBarIcon: tabIcon('€'), href: plan.payments ? undefined : null }} />
        <Tabs.Screen name="expenses" options={{ title: t('Spese'), tabBarIcon: tabIcon('↧') }} />
        <Tabs.Screen name="trainers" options={{ title: t('Trainer'), tabBarIcon: tabIcon('✪'), href: plan.trainers ? undefined : null }} />
        <Tabs.Screen name="settings" options={{ title: t('Impostazioni'), tabBarIcon: tabIcon('⚙') }} />
      </Tabs>
    </>
  );
}
