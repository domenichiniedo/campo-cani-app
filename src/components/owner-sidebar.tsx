import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t, tKey } from '@/lib/i18n';
import { closeDrawer, enableDrawer, openSection, useDrawer, usePageSections } from '@/lib/sections';
import { useColors } from '@/lib/theme';

// Sulla fascia verde, come la barra in alto: scritte bianche, più tenui quando non sono scelte.
const WHITE = '#ffffff';
const SOFT = 'rgba(255,255,255,0.72)';
const FAINT = 'rgba(255,255,255,0.5)';
const LIT = 'rgba(255,255,255,0.14)';
const PRESSED = 'rgba(255,255,255,0.08)';

/** I gruppi del menu: le pagine stanno sotto il loro titolo, nell'ordine delle schede. */
const GROUP: Record<string, string> = {
  index: tKey('Agenda'),
  week: tKey('Agenda'),
  hours: tKey('Agenda'),
  clients: tKey('Clienti'),
  board: tKey('Clienti'),
  stats: tKey('Conti'),
  expenses: tKey('Conti'),
  trainers: tKey('Centro'),
  settings: tKey('Centro'),
};

/**
 * Il menu a sinistra del proprietario, al posto della barra in basso: le pagine divise in gruppi e, sotto quella
 * aperta, le sue sottoschede. Sul computer resta aperto; sul telefono (`wide` falso) si apre con ☰ e copre la pagina.
 */
export function OwnerSidebar({ wide, ...props }: BottomTabBarProps & { wide: boolean }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { open } = useDrawer();

  useEffect(() => {
    enableDrawer(!wide);
    return () => enableDrawer(false);
  }, [wide]);

  if (wide) {
    return (
      <View style={{ width: 232, backgroundColor: c.pitch }}>
        <Menu {...props} />
      </View>
    );
  }
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={closeDrawer}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ width: 272, maxWidth: '85%', backgroundColor: c.pitch, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Chiudi il menu')}
            onPress={closeDrawer}
            hitSlop={8}
            style={{ alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 12 }}>
            <Text style={{ color: WHITE, fontSize: 20, fontWeight: '800' }}>✕</Text>
          </Pressable>
          <Menu {...props} onPicked={closeDrawer} />
        </View>
        <Pressable accessibilityLabel={t('Chiudi il menu')} onPress={closeDrawer} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} />
      </View>
    </Modal>
  );
}

function Menu({ state, descriptors, emitter, navigateToTab, onPicked }: BottomTabBarProps & { onPicked?: () => void }) {
  const current = state.routes[state.index];
  const sections = usePageSections(current.name);

  function go(key: string, focused: boolean) {
    const e = emitter.emit({ type: 'tabPress', target: key, canPreventDefault: true });
    if (!focused && !e.defaultPrevented) navigateToTab(key);
    onPicked?.();
  }

  // Il titolo del gruppo va sopra la prima pagina visibile del gruppo.
  const visible = state.routes.filter((r) => !descriptors[r.key].options.hidden);
  const firstOfGroup = new Set(visible.filter((r, k) => GROUP[r.name] && GROUP[r.name] !== GROUP[visible[k - 1]?.name]).map((r) => r.key));
  return (
    <ScrollView contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 10, gap: 2 }}>
      {state.routes.map((r, i) => {
        const { options } = descriptors[r.key];
        if (options.hidden) return null;
        const focused = i === state.index;
        const color = focused ? WHITE : SOFT;
        const title = typeof options.title === 'string' ? options.title : r.name;
        const header = firstOfGroup.has(r.key) ? GROUP[r.name] : '';
        return (
          <View key={r.key}>
            {!!header && (
              <Text
                style={{ color: FAINT, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', paddingHorizontal: 12, paddingTop: i ? 14 : 2, paddingBottom: 4 }}>
                {t(header)}
              </Text>
            )}
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
              <Text style={{ color, fontSize: 15, fontWeight: focused ? '800' : '600', flex: 1 }} numberOfLines={1}>
                {title}
              </Text>
            </Pressable>
            {focused && sections.items.length > 1 && (
              <View style={{ marginLeft: 22, marginTop: 4, marginBottom: 8, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.25)' }}>
                {sections.items.map((s) => {
                  const open = s.id === sections.open;
                  return (
                    <Pressable
                      key={s.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: open }}
                      onPress={() => {
                        openSection(r.name, s.id);
                        onPicked?.();
                      }}
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
  );
}
