import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Body, Button, Card, ErrorText, Field, H1, Muted, Row, Screen, Step, Toggle } from '@/components/ui';
import { hm, parseHm, STEP } from '@/lib/format';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import type { LessonType } from '@/lib/types';

type TypeDraft = { id: string; label: string; description: string; duration: string; price: string; options: string; active: boolean };

const toDraft = (t: LessonType): TypeDraft => ({
  id: t.id,
  label: t.label,
  description: t.description,
  duration: String(t.duration_min),
  price: (t.price_cents / 100).toString().replace('.', ','),
  options: t.options.join(', '),
  active: t.active,
});

export default function OwnerSettings() {
  const c = useColors();
  const { settings, logoUrl, profile, refresh } = useSession();
  const [name, setName] = useState(settings?.field_name ?? '');
  const [address, setAddress] = useState(settings?.field_address ?? '');
  const [openAt, setOpenAt] = useState(hm(settings?.open_min ?? 480));
  const [closeAt, setCloseAt] = useState(hm(settings?.close_min ?? 1200));
  const [cancelHours, setCancelHours] = useState(String(settings?.cancel_hours ?? 2));
  const [penaltyLimit, setPenaltyLimit] = useState(String(settings?.penalty_limit ?? 3));
  const [rules, setRules] = useState(settings?.rules ?? '');
  const [privacy, setPrivacy] = useState(settings?.privacy ?? '');
  const [types, setTypes] = useState<TypeDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    // Anche le lezioni disattivate, che la sessione non carica.
    supabase
      .from('lesson_types')
      .select('*')
      .order('sort')
      .then(({ data }) => setTypes(((data ?? []) as LessonType[]).map(toDraft)));
  }, []);

  const setType = (i: number, patch: Partial<TypeDraft>) => setTypes(types.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  async function pickLogo() {
    setErr('');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (res.canceled) return;
    const asset = res.assets[0];
    setUploading(true);
    try {
      const body = await (await fetch(asset.uri)).arrayBuffer();
      const ext = (asset.mimeType ?? 'image/jpeg').split('/')[1] ?? 'jpg';
      const path = `logo-${Date.now()}.${ext}`;
      const up = await supabase.storage.from('branding').upload(path, body, { contentType: asset.mimeType ?? 'image/jpeg' });
      if (up.error) throw up.error;
      const old = settings?.logo_path;
      const { error } = await supabase.from('settings').update({ logo_path: path }).eq('id', 1);
      if (error) throw error;
      if (old) await supabase.storage.from('branding').remove([old]);
      await refresh();
      setMsg('Logo aggiornato.');
    } catch (e) {
      setErr(errorText(e));
    }
    setUploading(false);
  }

  async function removeLogo() {
    if (!settings?.logo_path) return;
    await supabase.from('settings').update({ logo_path: null }).eq('id', 1);
    await supabase.storage.from('branding').remove([settings.logo_path]);
    refresh();
  }

  async function save() {
    setErr('');
    setMsg('');
    const o = parseHm(openAt), cl = parseHm(closeAt);
    if (o == null || cl == null || o % STEP || cl % STEP || o >= cl)
      return setErr('Apertura e chiusura vanno scritte come 08:00 o 08:30, con la chiusura dopo l’apertura.');
    const ch = Number(cancelHours), pl = Number(penaltyLimit);
    if (!Number.isInteger(ch) || ch < 0) return setErr('Le ore per la disdetta devono essere un numero intero.');
    if (!Number.isInteger(pl) || pl < 0) return setErr('Il limite di penalità deve essere un numero intero (0 = spento).');

    const typeRows = [];
    for (const [i, t] of types.entries()) {
      const dur = Number(t.duration), price = Math.round(Number(t.price.replace(',', '.')) * 100);
      if (!t.label.trim()) return setErr('Ogni lezione deve avere un nome.');
      if (!Number.isInteger(dur) || dur <= 0 || dur % STEP) return setErr(`${t.label}: la durata deve essere un multiplo di 30 minuti.`);
      if (!Number.isFinite(price) || price < 0) return setErr(`${t.label}: prezzo non valido.`);
      typeRows.push({
        id: t.id,
        label: t.label.trim(),
        description: t.description.trim(),
        duration_min: dur,
        price_cents: price,
        options: t.options.split(',').map((x) => x.trim()).filter(Boolean),
        sort: i,
        active: t.active,
      });
    }

    setSaving(true);
    const s = await supabase
      .from('settings')
      .update({
        field_name: name.trim(),
        field_address: address.trim(),
        open_min: o,
        close_min: cl,
        cancel_hours: ch,
        penalty_limit: pl,
        rules,
        privacy,
      })
      .eq('id', 1);
    const t = s.error ? s : await supabase.from('lesson_types').upsert(typeRows);
    setSaving(false);
    if (t.error) return setErr(errorText(t.error));
    await refresh();
    setMsg('Impostazioni salvate.');
  }

  if (!settings) return null;
  const consentsChanged = rules !== settings.rules || privacy !== settings.privacy;

  return (
    <Screen>
      <H1>Impostazioni</H1>

      <Step title="Campo e logo" />
      <Card>
        <Row>
          <View style={{ width: 72, height: 72, borderRadius: 36, overflow: 'hidden', backgroundColor: c.pitch }}>
            {logoUrl && <Image source={{ uri: logoUrl }} style={{ width: '100%', height: '100%' }} contentFit="contain" />}
          </View>
          <View style={{ gap: 8, flex: 1 }}>
            <Button small title={logoUrl ? 'Cambia logo' : 'Carica logo'} onPress={pickLogo} loading={uploading} />
            {logoUrl && <Button small kind="ghost" title="Togli logo" onPress={removeLogo} />}
          </View>
        </Row>
        <Field label="Nome del campo" value={name} onChangeText={setName} />
        <Field label="Indirizzo" value={address} onChangeText={setAddress} />
      </Card>

      <Step title="Orari e regole" />
      <Card>
        <Row>
          <Field label="Apre alle" value={openAt} onChangeText={setOpenAt} style={{ flex: 1, minWidth: 120 }} />
          <Field label="Chiude alle" value={closeAt} onChangeText={setCloseAt} style={{ flex: 1, minWidth: 120 }} />
        </Row>
        <Row>
          <Field label="Disdetta fino a (ore prima)" value={cancelHours} onChangeText={setCancelHours} keyboardType="number-pad" style={{ flex: 1, minWidth: 140 }} />
          <Field label="Sospendi alla penalità n° (0 = mai)" value={penaltyLimit} onChangeText={setPenaltyLimit} keyboardType="number-pad" style={{ flex: 1, minWidth: 140 }} />
        </Row>
        <Toggle label="Pagamento online" value={settings.online_payments} onChange={() => {}} disabled />
        <Muted style={{ fontSize: 13 }}>
          Il pagamento online si attiva dopo aver collegato un conto Stripe. Per ora i clienti pagano al campo.
        </Muted>
      </Card>

      <Step title="Lezioni" />
      {types.map((t, i) => (
        <Card key={t.id}>
          <Field label="Nome" value={t.label} onChangeText={(v) => setType(i, { label: v })} />
          <Field label="Descrizione" value={t.description} onChangeText={(v) => setType(i, { description: v })} />
          <Row>
            <Field label="Durata (min)" value={t.duration} onChangeText={(v) => setType(i, { duration: v })} keyboardType="number-pad" style={{ flex: 1, minWidth: 120 }} />
            <Field label="Prezzo (€)" value={t.price} onChangeText={(v) => setType(i, { price: v })} keyboardType="decimal-pad" style={{ flex: 1, minWidth: 120 }} />
          </Row>
          <Field label="Opzioni, separate da virgola" value={t.options} onChangeText={(v) => setType(i, { options: v })} />
          <Toggle label="Prenotabile" value={t.active} onChange={(v) => setType(i, { active: v })} />
        </Card>
      ))}

      <Step title="Regolamento e privacy" />
      <Card>
        <Muted>
          Le regole su orari, disdetta e penalità sono già scritte dall&apos;app. Qui aggiungi le tue, una per riga.
        </Muted>
        <Field label="Regolamento" value={rules} onChangeText={setRules} multiline />
        <Field label="Informativa privacy" value={privacy} onChangeText={setPrivacy} multiline />
        {consentsChanged && (
          <Body style={{ color: c.brassText }}>
            Salvando, i clienti dovranno accettare di nuovo il testo modificato prima di prenotare.
          </Body>
        )}
      </Card>

      <ErrorText>{err}</ErrorText>
      {!!msg && <Muted>{msg}</Muted>}
      <Button title="Salva impostazioni" onPress={save} loading={saving} />

      <Muted style={{ textAlign: 'center' }}>Accesso come proprietario: {profile?.email}</Muted>
      <Button title="Esci" kind="ghost" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
