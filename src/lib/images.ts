import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';

// Il logo del centro sta in "branding"; le foto di trainer e clienti in "foto".
export type Bucket = 'branding' | 'foto';
export type Source = 'camera' | 'library';

export const imageUrl = (bucket: Bucket, path: string | null | undefined) =>
  path ? supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl : null;

/**
 * Fa scattare o scegliere un'immagine quadrata e la carica con un nome che inizia con `prefix`.
 * Null se l'utente rinuncia.
 */
export async function pickAndUpload(bucket: Bucket, prefix: string, source: Source = 'library'): Promise<string | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 };
  let res: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error("Per scattare la foto consenti all'app di usare la fotocamera, dalle impostazioni del telefono.");
    res = await ImagePicker.launchCameraAsync(options);
  } else {
    res = await ImagePicker.launchImageLibraryAsync(options);
  }
  if (res.canceled) return null;
  const asset = res.assets[0];
  const body = await (await fetch(asset.uri)).arrayBuffer();
  const ext = (asset.mimeType ?? 'image/jpeg').split('/')[1] ?? 'jpg';
  const path = `${prefix}${Date.now()}.${ext}`;
  const up = await supabase.storage.from(bucket).upload(path, body, { contentType: asset.mimeType ?? 'image/jpeg' });
  if (up.error) throw up.error;
  return path;
}

export const removeImage = (bucket: Bucket, path: string | null | undefined) =>
  path ? supabase.storage.from(bucket).remove([path]) : Promise.resolve();
