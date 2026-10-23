import { Tabs } from 'expo-router/js-tabs';

import { tabIcon } from '@/components/ui';
import { t } from '@/lib/i18n';
import { usePlan } from '@/lib/plans';
import { useColors } from '@/lib/theme';

export default function OwnerLayout() {
  const c = useColors();
  const plan = usePlan();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line },
      }}>
      <Tabs.Screen name="index" options={{ title: t('Giorno'), tabBarIcon: tabIcon('◷') }} />
      <Tabs.Screen name="week" options={{ title: t('Settimana'), tabBarIcon: tabIcon('▦') }} />
      <Tabs.Screen name="hours" options={{ title: t('Orari'), tabBarIcon: tabIcon('◑') }} />
      <Tabs.Screen name="stats" options={{ title: t('Incassi'), tabBarIcon: tabIcon('€'), href: plan.payments ? undefined : null }} />
      <Tabs.Screen name="clients" options={{ title: t('Clienti'), tabBarIcon: tabIcon('☺') }} />
      <Tabs.Screen name="trainers" options={{ title: t('Trainer'), tabBarIcon: tabIcon('✪'), href: plan.trainers ? undefined : null }} />
      <Tabs.Screen name="settings" options={{ title: t('Impostazioni'), tabBarIcon: tabIcon('⚙') }} />
    </Tabs>
  );
}
