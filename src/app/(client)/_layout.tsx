import { Tabs } from 'expo-router/js-tabs';

import { tabIcon } from '@/components/ui';
import { t } from '@/lib/i18n';
import { usePlan } from '@/lib/plans';
import { useColors } from '@/lib/theme';

export default function ClientLayout() {
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
      <Tabs.Screen name="index" options={{ title: t('Prenota'), tabBarIcon: tabIcon('＋') }} />
      <Tabs.Screen name="bookings" options={{ title: t('Le mie lezioni'), tabBarIcon: tabIcon('☰') }} />
      <Tabs.Screen name="diary" options={{ title: t('Diario'), tabBarIcon: tabIcon('✎'), href: plan.trainers ? undefined : null }} />
      <Tabs.Screen name="packages" options={{ title: t('Pacchetti'), tabBarIcon: tabIcon('▤'), href: plan.packages ? undefined : null }} />
      <Tabs.Screen name="profile" options={{ title: t('Profilo'), tabBarIcon: tabIcon('◉') }} />
    </Tabs>
  );
}
