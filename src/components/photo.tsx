import { Image } from 'expo-image';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button, ErrorText, Row } from '@/components/ui';
import { imageUrl, pickAndUpload, removeImage, type Source } from '@/lib/images';
import { errorText } from '@/lib/supabase';
import { useColors } from '@/lib/theme';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** Foto tonda di un trainer o di un cliente; senza foto, le iniziali del nome. */
export function Avatar({ name, path, size = 40 }: { name: string; path: string | null | undefined; size?: number }) {
  const c = useColors();
  const url = imageUrl('foto', path);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        backgroundColor: c.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {url ? (
        <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} contentFit="cover" accessibilityLabel={`Foto di ${name}`} />
      ) : (
        <Text style={{ color: c.accent, fontWeight: '800', fontSize: size * 0.38 }}>{initials(name)}</Text>
      )}
    </View>
  );
}

/**
 * Foto grande con i bottoni per scattarla, sceglierla dalla galleria o toglierla.
 * `prefix` è l'inizio del nome del file ("trainer-<id>-" o "cliente-<id>-").
 * `save` scrive il nuovo percorso (o null) e torna un errore o null; la foto vecchia viene tolta dopo.
 */
export function PhotoEditor({
  name,
  path,
  prefix,
  save,
}: {
  name: string;
  path: string | null | undefined;
  prefix: string;
  save: (path: string | null) => Promise<string | null>;
}) {
  const [busy, setBusy] = useState<Source | 'remove' | null>(null);
  const [err, setErr] = useState('');

  async function change(source: Source | null) {
    setErr('');
    setBusy(source ?? 'remove');
    try {
      const next = source ? await pickAndUpload('foto', prefix, source) : null;
      if (source && !next) return setBusy(null);
      const e = await save(next);
      if (e) {
        await removeImage('foto', next);
        setErr(e);
      } else {
        await removeImage('foto', path);
      }
    } catch (e) {
      setErr(errorText(e));
    }
    setBusy(null);
  }

  return (
    <View style={{ gap: 8 }}>
      <Row>
        <Avatar name={name} path={path} size={72} />
        <View style={{ gap: 8, flex: 1, minWidth: 160 }}>
          <Button small title="Scatta foto" onPress={() => change('camera')} loading={busy === 'camera'} disabled={!!busy} />
          <Button small kind="ghost" title="Dalla galleria" onPress={() => change('library')} loading={busy === 'library'} disabled={!!busy} />
          {!!path && <Button small kind="ghost" title="Togli foto" onPress={() => change(null)} loading={busy === 'remove'} disabled={!!busy} />}
        </View>
      </Row>
      <ErrorText>{err}</ErrorText>
    </View>
  );
}
