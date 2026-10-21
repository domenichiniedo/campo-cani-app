import { Tabs } from 'expo-router/js-tabs';

import { tabIcon } from '@/components/ui';
import { useColors } from '@/lib/theme';

export default function ClientLayout() {
  const c = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Prenota', tabBarIcon: tabIcon('＋') }} />
      <Tabs.Screen name="bookings" options={{ title: 'Le mie lezioni', tabBarIcon: tabIcon('☰') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profilo', tabBarIcon: tabIcon('◉') }} />
    </Tabs>
  );
}
