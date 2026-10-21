import { Tabs } from 'expo-router/js-tabs';

import { tabIcon } from '@/components/ui';
import { useColors } from '@/lib/theme';

export default function OwnerLayout() {
  const c = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Giorno', tabBarIcon: tabIcon('◷') }} />
      <Tabs.Screen name="week" options={{ title: 'Settimana', tabBarIcon: tabIcon('▦') }} />
      <Tabs.Screen name="hours" options={{ title: 'Orari', tabBarIcon: tabIcon('◑') }} />
      <Tabs.Screen name="clients" options={{ title: 'Clienti', tabBarIcon: tabIcon('☺') }} />
      <Tabs.Screen name="settings" options={{ title: 'Impostazioni', tabBarIcon: tabIcon('⚙') }} />
    </Tabs>
  );
}
