import { Pressable, ScrollView, Text, View } from 'react-native';

import { openSection, useDrawer, usePageSections } from '@/lib/sections';
import { useColors } from '@/lib/theme';

/**
 * Le sottoschede della pagina in una fila in cima, sul telefono: sul computer stanno già nel menu a sinistra.
 * Una fila sola che scorre di lato, così la pagina resta corta.
 */
export function SubTabs({ page }: { page: string }) {
  const c = useColors();
  const { enabled } = useDrawer();
  const { items, open } = usePageSections(page);
  if (!enabled || items.length < 2) return null;
  return (
    <View style={{ marginHorizontal: -16, borderBottomWidth: 1, borderBottomColor: c.line }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12 }}>
        {items.map((s) => {
          const on = s.id === open;
          return (
            <Pressable
              key={s.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => openSection(page, s.id)}
              style={{ paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 3, borderBottomColor: on ? c.accent : 'transparent', marginBottom: -1 }}>
              <Text style={{ color: on ? c.text : c.muted, fontSize: 15, fontWeight: on ? '800' : '600' }}>{s.title}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
