import { Image } from 'expo-image';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button, ErrorText, Row } from '@/components/ui';
import { t } from '@/lib/i18n';
import { imageUrl, pickAndUpload, pickImage, removeImage, uploadImage, type Picked, type Source } from '@/lib/images';
import { errorText, supabase } from '@/lib/supabase';
import { fullName, type Profile, type Trainer } from '@/lib/types';
import { useColors } from '@/lib/theme';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** Foto tonda di un trainer o di un cliente; senza foto, le iniziali del nome. `uri` mostra una foto non ancora caricata. */
export function Avatar({ name, path, uri, size = 40 }: { name: string; path: string | null | undefined; uri?: string; size?: number }) {
  const c = useColors();
  const url = uri ?? imageUrl('foto', path);
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
        <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} contentFit="cover" accessibilityLabel={t('Foto di {nome}', { nome: name })} />
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
          <Button small title={t('Scatta foto')} onPress={() => change('camera')} loading={busy === 'camera'} disabled={!!busy} />
          <Button small kind="ghost" title={t('Dalla galleria')} onPress={() => change('library')} loading={busy === 'library'} disabled={!!busy} />
          {!!path && <Button small kind="ghost" title={t('Togli foto')} onPress={() => change(null)} loading={busy === 'remove'} disabled={!!busy} />}
        </View>
      </Row>
      <ErrorText>{err}</ErrorText>
    </View>
  );
}

/** Foto da scegliere in un modulo, prima che esista l'account: si carica dopo l'iscrizione. */
export function PhotoPicker({ name, value, onChange }: { name: string; value: Picked | null; onChange: (p: Picked) => void }) {
  const [err, setErr] = useState('');
  async function pick(source: Source) {
    setErr('');
    try {
      const p = await pickImage(source);
      if (p) onChange(p);
    } catch (e) {
      setErr(errorText(e));
    }
  }
  return (
    <View style={{ gap: 8 }}>
      <Row>
        <Avatar name={name || '?'} path={null} uri={value?.uri} size={72} />
        <View style={{ gap: 8, flex: 1, minWidth: 160 }}>
          <Button small title={value ? t('Scatta di nuovo') : t('Scatta foto')} onPress={() => pick('camera')} />
          <Button small kind="ghost" title={t('Dalla galleria')} onPress={() => pick('library')} />
        </View>
      </Row>
      <ErrorText>{err}</ErrorText>
    </View>
  );
}

/** Dove sta la foto di chi è connesso: il trainer nella sua scheda, il cliente nel profilo. */
export function myPhoto(profile: Profile, myTrainer: Pick<Trainer, 'id' | 'name' | 'photo_path'> | null) {
  return myTrainer
    ? {
        name: myTrainer.name,
        path: myTrainer.photo_path,
        prefix: `trainer-${myTrainer.id}-`,
        write: (path: string | null) => supabase.rpc('set_my_photo', { p_path: path }),
      }
    : {
        name: fullName(profile),
        path: profile.photo_path,
        prefix: `cliente-${profile.id}-`,
        write: (path: string | null) => supabase.from('profiles').update({ photo_path: path }).eq('id', profile.id),
      };
}

/** Carica la foto scelta nel modulo d'iscrizione, appena c'è l'account. Torna un errore o null. */
export async function saveSignupPhoto(userId: string, picked: Picked): Promise<string | null> {
  const p = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (p.error) return errorText(p.error);
  const profile = p.data as Profile;
  let trainer: Pick<Trainer, 'id' | 'name' | 'photo_path'> | null = null;
  if (profile.role === 'trainer') {
    const a = await supabase.from('trainer_accounts').select('trainer_id').eq('user_id', userId).maybeSingle();
    const id = (a.data as { trainer_id: string } | null)?.trainer_id;
    if (!id) return null;
    trainer = { id, name: fullName(profile), photo_path: null };
  }
  const me = myPhoto(profile, trainer);
  try {
    const path = await uploadImage('foto', me.prefix, picked);
    const { error } = await me.write(path);
    if (error) {
      await removeImage('foto', path);
      return errorText(error);
    }
    return null;
  } catch (e) {
    return errorText(e);
  }
}
