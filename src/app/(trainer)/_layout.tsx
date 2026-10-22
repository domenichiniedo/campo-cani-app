import { Tabs } from 'expo-router/js-tabs';

import { tabIcon } from '@/components/ui';
import { useColors } from '@/lib/theme';

export default function TrainerLayout() {
  const c = useColors();
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
