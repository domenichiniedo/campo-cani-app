import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { openSection, usePageSections } from '@/lib/sections';
import { useColors } from '@/lib/theme';

// Sulla fascia verde, come la barra in alto: scritte bianche, più tenui quando non sono scelte.
const WHITE = '#ffffff';
const SOFT = 'rgba(255,255,255,0.72)';
const LIT = 'rgba(255,255,255,0.14)';
const PRESSED = 'rgba(255,255,255,0.08)';

/**
 * Il menu a sinistra del programma per Windows, al posto della barra in basso del telefono: le pagine e, sotto
 * quella aperta, i suoi paragrafi. Toccando un paragrafo la pagina mostra solo quello.
 */
export function OwnerSidebar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const c = useColors();
  const current = state.routes[state.index];
  const sections = usePageSections(current.name);

  function go(key: string, focused: boolean) {
    const e = emitter.emit({ type: 'tabPress', target: key, canPreventDefault: true });
    if (!focused && !e.defaultPrevented) navigateToTab(key);
  }

  return (
    <View style={{ width: 232, backgroundColor: c.pitch }}>
      <ScrollView contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 10, gap: 2 }}>
        {state.routes.map((r, i) => {
          const { options } = descriptors[r.key];
          if (options.hidden) return null;
          const focused = i === state.index;
          const color = focused ? WHITE : SOFT;
          const title = typeof options.title === 'string' ? options.title : r.name;
          return (
            <View key={r.key}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: focused }}
                onPress={() => go(r.key, focused)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  backgroundColor: focused ? LIT : pressed ? PRESSED : 'transparent',
                })}>
                <View style={{ width: 22, alignItems: 'center' }}>{options.tabBarIcon?.({ focused, color, size: 18 })}</View>
                <Text style={{ color: focused ? WHITE : SOFT, fontSize: 15, fontWeight: focused ? '800' : '600', flex: 1 }} numberOfLines={1}>
                  {title}
                </Text>
              </Pressable>
              {focused && sections.items.length > 0 && (
                <View style={{ marginLeft: 22, marginTop: 4, marginBottom: 8, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.25)' }}>
                  {sections.items.map((s) => {
                    const open = s.id === sections.open;
                    return (
                      <Pressable
                        key={s.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: open }}
                        onPress={() => openSection(r.name, s.id)}
                        style={({ pressed }) => ({
                          marginLeft: -1,
                          paddingVertical: 7,
                          paddingHorizontal: 12,
                          borderLeftWidth: 3,
                          borderLeftColor: open ? WHITE : 'transparent',
                          backgroundColor: pressed && !open ? PRESSED : 'transparent',
                        })}>
                        <Text style={{ color: open ? WHITE : SOFT, fontSize: 14, fontWeight: open ? '800' : '400' }}>{s.title}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
