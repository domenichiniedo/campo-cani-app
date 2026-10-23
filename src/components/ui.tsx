import { Image } from 'expo-image';
import { useIsFocused } from 'expo-router';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type ColorValue,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { LANGS, setLang, t, useLang } from '@/lib/i18n';
import { useWhenActive } from '@/lib/refresh';
import { useSession } from '@/lib/session';
import { useColors } from '@/lib/theme';

const CONDENSED = { fontWeight: '800' as const, textTransform: 'uppercase' as const, letterSpacing: 0.3 };

export function Screen({
  children,
  onRefresh,
  refreshing = false,
  header = true,
}: {
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  header?: boolean;
}) {
  const c = useColors();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: header ? c.pitch : c.bg }}>
      {header && <BrandBar />}
      <ScrollView
        style={{ backgroundColor: c.bg }}
        contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 18 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}>
        {onRefresh && <AutoRefresh onRefresh={onRefresh} />}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/** La schermata che si vede si ricarica quando l'app torna in primo piano e ogni minuto. */
function AutoRefresh({ onRefresh }: { onRefresh: () => void }) {
  const focused = useIsFocused();
  useWhenActive(() => focused && onRefresh(), 60_000);
  return null;
}

export function BrandBar() {
  const c = useColors();
  const { settings, logoUrl } = useSession();
  return (
    <View style={[styles.brand, { backgroundColor: c.pitch }]}>
      <View style={[styles.logo, { backgroundColor: c.onPitch }]}>
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
        ) : (
          <Text style={{ fontSize: 18, color: c.pitch, fontWeight: '900' }}>{(settings?.field_name ?? 'C').charAt(0)}</Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[CONDENSED, { color: c.onPitch, fontSize: 17 }]} numberOfLines={1}>
          {settings?.field_name ?? t('Il tuo campo')}
        </Text>
        <Text style={{ color: c.onPitchMuted, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
          {settings?.field_address || t('Centro cinofilo · IGP ed educazione')}
        </Text>
      </View>
      <LangMenu />
    </View>
  );
}

export function H1({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={[CONDENSED, { color: c.text, fontSize: 28, lineHeight: 30 }]}>{children}</Text>;
}

export function Step({ n, title, right }: { n?: string; title: string; right?: ReactNode }) {
  const c = useColors();
  return (
    <View style={[styles.step, { borderBottomColor: c.text }]}>
      {n && <Text style={[CONDENSED, { color: c.accent, fontSize: 20 }]}>{n}</Text>}
      <Text style={[CONDENSED, { color: c.text, fontSize: 20, flex: 1 }]}>{title}</Text>
      {right}
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={{ color: c.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>{children}</Text>;
}

export function Muted({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const c = useColors();
  return <Text style={[{ color: c.muted, fontSize: 14, lineHeight: 20 }, style]}>{children}</Text>;
}

export function Body({ children, style, bold }: { children: ReactNode; style?: TextStyle; bold?: boolean }) {
  const c = useColors();
  return <Text style={[{ color: c.text, fontSize: 15, lineHeight: 21, fontWeight: bold ? '700' : '400' }, style]}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  const c = useColors();
  if (!children) return null;
  return <Text style={{ color: c.danger, fontSize: 14, fontWeight: '600' }}>{children}</Text>;
}

export function Card({ children, style, accent }: { children: ReactNode; style?: ViewStyle; accent?: boolean }) {
  const c = useColors();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: c.surface, borderColor: c.line },
        accent && { borderTopWidth: 4, borderTopColor: c.accent },
        style,
      ]}>
      {children}
    </View>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  small,
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost' | 'danger' | 'dark';
  small?: boolean;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const c = useColors();
  const bg = { primary: c.accent, ghost: c.surface, danger: c.surface, dark: c.pitch }[kind];
  const fg = { primary: c.onAccent, ghost: c.text, danger: c.danger, dark: c.onPitch }[kind];
  const border = { primary: c.accent, ghost: c.lineStrong, danger: c.lineStrong, dark: c.pitch }[kind];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 14 : 16, textAlign: 'center' }}>{title}</Text>
      )}
    </Pressable>
  );
}

/** Bottone che chiede una seconda pressione per confermare un'azione distruttiva. */
export function ConfirmButton({ title, onConfirm, small = true }: { title: string; onConfirm: () => Promise<void> | void; small?: boolean }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Button
      title={armed ? t('Confermi?') : title}
      kind="danger"
      small={small}
      loading={busy}
      onPress={async () => {
        if (!armed) {
          setArmed(true);
          setTimeout(() => setArmed(false), 3000);
          return;
        }
        setBusy(true);
        try {
          await onConfirm();
        } finally {
          setBusy(false);
          setArmed(false);
        }
      }}
    />
  );
}

export function Field({ label, style, ...props }: TextInputProps & { label: string; style?: ViewStyle }) {
  const c = useColors();
  return (
    <View style={[{ gap: 5 }, style]}>
      <Label>{label}</Label>
      <TextInput
        placeholderTextColor={c.offText}
        {...props}
        style={[
          styles.input,
          { color: c.text, backgroundColor: c.surface, borderColor: c.lineStrong },
          props.multiline && { minHeight: 110, textAlignVertical: 'top' },
        ]}
      />
    </View>
  );
}

export function Chips<T extends string>({
  items,
  value,
  onChange,
  disabled,
}: {
  items: { value: T; label: string; disabled?: boolean }[];
  value: T | null;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const c = useColors();
  return (
    <View style={styles.chips}>
      {items.map((it) => {
        const on = it.value === value;
        return (
          <Pressable
            key={it.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on, disabled: disabled || it.disabled }}
            disabled={disabled || it.disabled}
            onPress={() => onChange(it.value)}
            style={[
              styles.chip,
              { borderColor: on ? c.accent : c.lineStrong, backgroundColor: on ? c.accent : c.surface, opacity: it.disabled ? 0.45 : 1 },
            ]}>
            <Text style={{ color: on ? c.onAccent : c.text, fontWeight: '600', fontSize: 14 }}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Check({ value, onChange, children }: { value: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <View
        style={[
          styles.box,
          { borderColor: value ? c.accent : c.lineStrong, backgroundColor: value ? c.accent : c.surface },
        ]}>
        {value && <Text style={{ color: c.onAccent, fontWeight: '900', fontSize: 14, lineHeight: 16 }}>✓</Text>}
      </View>
      <Text style={{ color: c.text, fontSize: 15, lineHeight: 21, flex: 1 }}>{children}</Text>
    </Pressable>
  );
}

export function Toggle({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text style={{ color: c.text, fontSize: 15, flex: 1 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: c.accent }} />
    </View>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'ok' | 'warn' | 'bad' }) {
  const c = useColors();
  const [bg, fg] = {
    neutral: [c.taken, c.muted],
    ok: [c.accentSoft, c.accent],
    warn: [c.brassSoft, c.brassText],
    bad: [c.dangerSoft, c.danger],
  }[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '700' }}>{children}</Text>
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }, style]}>{children}</View>;
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  const c = useColors();
  return (
    <View style={[styles.stat, { borderColor: c.line, backgroundColor: c.surface }]}>
      <Text style={[CONDENSED, { color: c.text, fontSize: 24 }]}>{value}</Text>
      <Text style={{ color: c.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</Text>
    </View>
  );
}

/** Testo lungo (regolamento, privacy) che si apre e si chiude. */
export function Expandable({ title, lines }: { title: string; lines: string[] }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Pressable accessibilityRole="button" onPress={() => setOpen(!open)}>
        <Text style={{ color: c.accent, fontWeight: '700', textDecorationLine: 'underline', fontSize: 14 }}>
          {open ? t('Chiudi {cosa}', { cosa: title }) : t('Leggi {cosa}', { cosa: title })}
        </Text>
      </Pressable>
      {open && (
        <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: 6, padding: 10, backgroundColor: c.surface, gap: 6 }}>
          {lines.map((l, i) => (
            <Text key={i} style={{ color: c.text, fontSize: 14, lineHeight: 20 }}>
              {l}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

export function Loading() {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
      <ActivityIndicator color={c.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  langBtn: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  langMenu: {
    position: 'absolute',
    right: 12,
    minWidth: 180,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  langItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 12 },
  logo: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  step: { flexDirection: 'row', alignItems: 'baseline', gap: 8, borderBottomWidth: 2, paddingBottom: 4 },
  card: { borderWidth: 1, borderRadius: 10, padding: 16, gap: 12 },
  btn: { borderWidth: 1, borderRadius: 8, paddingVertical: 13, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { paddingVertical: 7, paddingHorizontal: 12 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  box: { width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 0 },
  stat: { flexGrow: 1, flexBasis: '45%', borderWidth: 1, borderRadius: 8, padding: 12, gap: 2 },
});

/** Icona testuale per la barra delle schede. */
export const tabIcon = (glyph: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ color, fontSize: 18, fontWeight: '800' }}>{glyph}</Text>;
  };

/**
 * Menu a tendina della lingua, in alto a destra: cambia subito tutti i testi dell'app e resta salvata
 * sul telefono. Sta sulla fascia verde; dove la fascia non c'è (attivazione) si usa sullo sfondo chiaro.
 */
export function LangMenu({ onLight = false }: { onLight?: boolean }) {
  const c = useColors();
  const l = useLang();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const fg = onLight ? c.text : c.onPitch;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Lingua')}
        onPress={() => setOpen(true)}
        style={[styles.langBtn, { borderColor: onLight ? c.lineStrong : c.onPitchMuted }]}>
        <Text style={{ color: fg, fontWeight: '800', fontSize: 13 }}>{`${l.toUpperCase()} ▾`}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)}>
          <View style={[styles.langMenu, { top: insets.top + 56, backgroundColor: c.surface, borderColor: c.line }]}>
            {LANGS.map((x) => (
              <Pressable
                key={x.id}
                accessibilityRole="button"
                accessibilityState={{ selected: x.id === l }}
                onPress={() => {
                  setOpen(false);
                  setLang(x.id);
                }}
                style={[styles.langItem, x.id === l && { backgroundColor: c.accentSoft }]}>
                <Text style={{ color: c.text, fontSize: 16, fontWeight: x.id === l ? '800' : '500' }}>{x.label}</Text>
                {x.id === l && <Text style={{ color: c.accent, fontWeight: '800' }}>✓</Text>}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
