import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { PackagesEditor } from '@/components/packages-editor';
import { Body, Button, Card, ErrorText, Field, H1, Muted, Row, Screen, Step, Toggle } from '@/components/ui';
import { hm, parseHm, STEP } from '@/lib/format';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import type { Field as FieldRow, LessonType, Trainer } from '@/lib/types';

type TypeDraft = { id: string; label: string; description: string; duration: string; price: string; options: string; active: boolean };

type FieldDraft = { id?: string; name: string; address: string };
type TrainerDraft = { id?: string; name: string; lessons: string[] };

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
  const [fieldList, setFieldList] = useState<FieldDraft[]>([]);
  // Campi disattivati in passato: se il numero risale li riusiamo, con il loro storico.
  const [spareFields, setSpareFields] = useState<FieldDraft[]>([]);
  const [activeFieldIds, setActiveFieldIds] = useState<string[]>([]);
  const [trainerList, setTrainerList] = useState<TrainerDraft[]>([]);
  const [activeTrainerIds, setActiveTrainerIds] = useState<string[]>([]);
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
    supabase
      .from('fields')
      .select('*')
      .order('sort')
      .then(({ data }) => {
        const all = (data ?? []) as FieldRow[];
        const pick = (f: FieldRow): FieldDraft => ({ id: f.id, name: f.name, address: f.address });
        setFieldList(all.filter((f) => f.active).map(pick));
        setSpareFields(all.filter((f) => !f.active).map(pick));
        setActiveFieldIds(all.filter((f) => f.active).map((f) => f.id));
      });
    supabase
      .from('trainers')
      .select('*')
      .eq('active', true)
      .order('sort')
      .then(({ data }) => {
        const all = (data ?? []) as Trainer[];
        setTrainerList(all.map((t) => ({ id: t.id, name: t.name, lessons: t.lessons })));
        setActiveTrainerIds(all.map((t) => t.id));
      });
  }, []);

  const setFieldAt = (i: number, patch: Partial<FieldDraft>) => setFieldList(fieldList.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const setTrainerAt = (i: number, patch: Partial<TrainerDraft>) =>
    setTrainerList(trainerList.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  function setFieldCount(n: number) {
    if (n < 1) return;
    if (n < fieldList.length) {
      const removed = fieldList.slice(n).filter((f) => f.id);
      setSpareFields([...removed, ...spareFields]);
      setFieldList(fieldList.slice(0, n));
      return;
    }
    const added: FieldDraft[] = [];
    const spare = [...spareFields];
    for (let i = fieldList.length; i < n; i++) {
      added.push(spare.shift() ?? { name: `Campo ${i + 1}`, address: fieldList[0]?.address ?? address });
    }
    setSpareFields(spare);
    setFieldList([...fieldList, ...added]);
  }

  /** Salva campi e trainer: chi viene tolto è disattivato, non cancellato. */
  async function saveFieldsAndTrainers() {
    const keptFields = fieldList.filter((f) => f.id).map((f) => f.id!);
    const fieldOps = [
      ...fieldList.map((f, i) =>
        f.id
          ? supabase.from('fields').update({ name: f.name.trim(), address: f.address.trim(), sort: i + 1, active: true }).eq('id', f.id)
          : supabase.from('fields').insert({ name: f.name.trim(), address: f.address.trim(), sort: i + 1, active: true }),
      ),
      ...activeFieldIds.filter((id) => !keptFields.includes(id)).map((id) => supabase.from('fields').update({ active: false }).eq('id', id)),
    ];
    const keptTrainers = trainerList.filter((t) => t.id).map((t) => t.id!);
    const trainerOps = [
      ...trainerList.map((t, i) =>
        t.id
          ? supabase.from('trainers').update({ name: t.name.trim(), lessons: t.lessons, sort: i + 1, active: true }).eq('id', t.id)
          : supabase.from('trainers').insert({ name: t.name.trim(), lessons: t.lessons, sort: i + 1, active: true }),
      ),
      ...activeTrainerIds
        .filter((id) => !keptTrainers.includes(id))
        .map((id) => supabase.from('trainers').update({ active: false }).eq('id', id)),
    ];
    const results = await Promise.all([...fieldOps, ...trainerOps]);
    return results.find((r) => r.error)?.error ?? null;
  }

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

    if (fieldList.some((f) => !f.name.trim())) return setErr('Ogni campo deve avere un nome.');
    if (trainerList.some((t) => !t.name.trim())) return setErr('Ogni trainer deve avere un nome.');

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
    const ft = t.error ? t.error : await saveFieldsAndTrainers();
    setSaving(false);
    if (ft) return setErr(errorText(ft));
    await refresh();
    // Ricarica gli id dei campi e trainer appena creati.
    const [f2, t2] = await Promise.all([
      supabase.from('fields').select('*').order('sort'),
      supabase.from('trainers').select('*').eq('active', true).order('sort'),
    ]);
    const allF = (f2.data ?? []) as FieldRow[];
    setFieldList(allF.filter((f) => f.active).map((f) => ({ id: f.id, name: f.name, address: f.address })));
    setSpareFields(allF.filter((f) => !f.active).map((f) => ({ id: f.id, name: f.name, address: f.address })));
    setActiveFieldIds(allF.filter((f) => f.active).map((f) => f.id));
    const allT = (t2.data ?? []) as Trainer[];
    setTrainerList(allT.map((x) => ({ id: x.id, name: x.name, lessons: x.lessons })));
    setActiveTrainerIds(allT.map((x) => x.id));
    setMsg('Impostazioni salvate.');
  }

  if (!settings) return null;
  const consentsChanged = rules !== settings.rules || privacy !== settings.privacy;

  return (
    <Screen>
      <H1>Impostazioni</H1>

      <Step title="Centro e logo" />
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
        <Field label="Nome del centro" value={name} onChangeText={setName} />
        <Field label="Indirizzo della sede" value={address} onChangeText={setAddress} />
      </Card>

      <Step title="Campi" />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Body bold>Numero di campi</Body>
          <Row>
            <Button small kind="ghost" title="−" onPress={() => setFieldCount(fieldList.length - 1)} disabled={fieldList.length <= 1} />
            <Text style={{ color: c.text, fontSize: 22, fontWeight: '800', minWidth: 28, textAlign: 'center' }}>{fieldList.length}</Text>
            <Button small kind="ghost" title="+" onPress={() => setFieldCount(fieldList.length + 1)} />
          </Row>
        </Row>
        <Muted style={{ fontSize: 13 }}>
          Ogni campo ha orari e prenotazioni suoi. Più campi possono stare allo stesso indirizzo. Se togli un campo, le
          prenotazioni già fatte restano nel piano.
        </Muted>
      </Card>
      {fieldList.map((f, i) => (
        <Card key={f.id ?? `new-${i}`}>
          <Field label={`Campo ${i + 1}: nome`} value={f.name} onChangeText={(v) => setFieldAt(i, { name: v })} />
          <Field label="Indirizzo" value={f.address} onChangeText={(v) => setFieldAt(i, { address: v })} />
        </Card>
      ))}

      <Step title="Trainer" />
      <Muted>Assegni il trainer a ogni lezione dal piano del giorno. Un trainer non può avere due lezioni alla stessa ora.</Muted>
      {trainerList.map((t, i) => (
        <Card key={t.id ?? `new-${i}`}>
          <Field label="Nome" value={t.name} onChangeText={(v) => setTrainerAt(i, { name: v })} />
          <Muted style={{ fontSize: 13 }}>Lezioni che segue (nessuna scelta = tutte)</Muted>
          <Row>
            {types.map((lt) => {
              const on = t.lessons.includes(lt.id);
              return (
                <Button
                  key={lt.id}
                  small
                  kind={on ? 'primary' : 'ghost'}
                  title={lt.label}
                  onPress={() => setTrainerAt(i, { lessons: on ? t.lessons.filter((x) => x !== lt.id) : [...t.lessons, lt.id] })}
                />
              );
            })}
          </Row>
          <Button small kind="danger" title="Togli trainer" onPress={() => setTrainerList(trainerList.filter((_, j) => j !== i))} />
        </Card>
      ))}
      <Button title="+ Aggiungi trainer" kind="ghost" onPress={() => setTrainerList([...trainerList, { name: '', lessons: [] }])} />

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
      <Button
        title="+ Aggiungi lezione"
        kind="ghost"
        onPress={() =>
          setTypes([
            ...types,
            // L'id resta fisso anche se poi cambi il nome; serve ai trainer per riconoscere la lezione.
            { id: `lez-${Date.now().toString(36)}`, label: '', description: '', duration: '60', price: '0', options: '', active: true },
          ])
        }
      />
      <Muted style={{ fontSize: 13 }}>
        Per togliere una lezione spegni &quot;Prenotabile&quot;: i clienti non la vedono più, ma restano le prenotazioni già fatte.
      </Muted>

      <Step title="Pacchetti" />
      <PackagesEditor />

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
