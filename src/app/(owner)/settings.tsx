import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { InvoicesPanel } from '@/components/invoices-panel';
import { LicensePanel } from '@/components/license-panel';
import { LimitNote } from '@/components/limit-note';
import { PackagesEditor } from '@/components/packages-editor';
import { Body, Button, Card, ErrorText, Field, H1, Muted, Row, Screen, Step, Toggle } from '@/components/ui';
import { hm, parseHm, STEP } from '@/lib/format';
import { t } from '@/lib/i18n';
import { pickAndUpload, removeImage, type Source } from '@/lib/images';
import { licensingEnabled } from '@/lib/license';
import { planWith, usePlan } from '@/lib/plans';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import type { Field as FieldRow, LessonType, Trainer } from '@/lib/types';

type TypeDraft = {
  id: string;
  label: string;
  description: string;
  duration: string;
  price: string;
  options: string;
  active: boolean;
  /** Lezione di gruppo, con i posti proposti per le classi. */
  group: boolean;
  seats: string;
};

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
  group: t.group_seats !== null,
  seats: String(t.group_seats ?? 6),
});

/** Sezione che il piano attuale non comprende. */
function PlanNote({ title, plan }: { title: string; plan: string }) {
  return (
    <>
      <Step title={title} />
      <Muted>{t('Compresi dal piano {piano} in su. Per passare a un piano superiore chiedi un nuovo codice di licenza.', { piano: plan })}</Muted>
    </>
  );
}

export default function OwnerSettings() {
  const c = useColors();
  const { settings, logoUrl, profile, refresh } = useSession();
  const plan = usePlan();
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
    if (n < 1 || (plan.maxFields !== null && n > Math.max(plan.maxFields, fieldList.length))) return;
    if (n < fieldList.length) {
      const removed = fieldList.slice(n).filter((f) => f.id);
      setSpareFields([...removed, ...spareFields]);
      setFieldList(fieldList.slice(0, n));
      return;
    }
    const added: FieldDraft[] = [];
    const spare = [...spareFields];
    for (let i = fieldList.length; i < n; i++) {
      added.push(spare.shift() ?? { name: t('Campo {n}', { n: i + 1 }), address: fieldList[0]?.address ?? address });
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

  // Il piano conta le lezioni prenotabili: quelle spente non pesano.
  const activeTypes = types.filter((t) => t.active).length;
  const typesFull = plan.maxLessonTypes !== null && activeTypes >= plan.maxLessonTypes;
  const fieldsText = plan.maxFields === 1 ? t('1 campo') : t('{n} campi', { n: plan.maxFields ?? 0 });
  const setType = (i: number, patch: Partial<TypeDraft>) => setTypes(types.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  async function pickLogo(source: Source) {
    setErr('');
    setUploading(true);
    try {
      const path = await pickAndUpload('branding', 'logo-', source);
      if (!path) return setUploading(false);
      const old = settings?.logo_path;
      const { error } = await supabase.from('settings').update({ logo_path: path }).eq('id', 1);
      if (error) throw error;
      await removeImage('branding', old);
      await refresh();
      setMsg(t('Logo aggiornato.'));
    } catch (e) {
      setErr(errorText(e));
    }
    setUploading(false);
  }

  async function removeLogo() {
    if (!settings?.logo_path) return;
    await supabase.from('settings').update({ logo_path: null }).eq('id', 1);
    await removeImage('branding', settings.logo_path);
    refresh();
  }

  async function save() {
    setErr('');
    setMsg('');
    const o = parseHm(openAt), cl = parseHm(closeAt);
    if (o == null || cl == null || o % STEP || cl % STEP || o >= cl)
      return setErr(t('Apertura e chiusura vanno scritte come 08:00 o 08:30, con la chiusura dopo l’apertura.'));
    const ch = Number(cancelHours), pl = Number(penaltyLimit);
    if (!Number.isInteger(ch) || ch < 0) return setErr(t('Le ore per la disdetta devono essere un numero intero.'));
    if (!Number.isInteger(pl) || pl < 0) return setErr(t('Il limite di penalità deve essere un numero intero (0 = spento).'));

    if (fieldList.some((f) => !f.name.trim())) return setErr(t('Ogni campo deve avere un nome.'));
    if (trainerList.some((t) => !t.name.trim())) return setErr(t('Ogni trainer deve avere un nome.'));

    const typeRows = [];
    for (const [i, ty] of types.entries()) {
      const dur = Number(ty.duration), price = Math.round(Number(ty.price.replace(',', '.')) * 100);
      if (!ty.label.trim()) return setErr(t('Ogni lezione deve avere un nome.'));
      if (!Number.isInteger(dur) || dur <= 0 || dur % STEP) return setErr(t('{lezione}: la durata deve essere un multiplo di 30 minuti.', { lezione: ty.label }));
      if (!Number.isFinite(price) || price < 0) return setErr(t('{lezione}: prezzo non valido.', { lezione: ty.label }));
      const seats = ty.group ? Number(ty.seats) : null;
      if (seats !== null && (!Number.isInteger(seats) || seats < 2 || seats > 50))
        return setErr(t('{lezione}: i posti della classe vanno da 2 a 50.', { lezione: ty.label }));
      typeRows.push({
        id: ty.id,
        label: ty.label.trim(),
        description: ty.description.trim(),
        duration_min: dur,
        price_cents: price,
        options: ty.options.split(',').map((x) => x.trim()).filter(Boolean),
        sort: i,
        active: ty.active,
        group_seats: seats,
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
    const lt = s.error ? s : await supabase.from('lesson_types').upsert(typeRows);
    const ft = lt.error ? lt.error : await saveFieldsAndTrainers();
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
    setMsg(t('Impostazioni salvate.'));
  }

  if (!settings) return null;
  const consentsChanged = rules !== settings.rules || privacy !== settings.privacy;

  return (
    <Screen>
      <H1>{t('Impostazioni')}</H1>

      {licensingEnabled && (
        <>
          <Step title={t('Licenza')} />
          <LicensePanel />
        </>
      )}

      <Step title={t('Centro e logo')} />
      <Card>
        <Row>
          <View style={{ width: 72, height: 72, borderRadius: 36, overflow: 'hidden', backgroundColor: c.pitch }}>
            {logoUrl && <Image source={{ uri: logoUrl }} style={{ width: '100%', height: '100%' }} contentFit="contain" />}
          </View>
          <View style={{ gap: 8, flex: 1 }}>
            <Button small title={logoUrl ? t('Cambia logo') : t('Carica logo')} onPress={() => pickLogo('library')} loading={uploading} />
            <Button small kind="ghost" title={t('Scatta foto del logo')} onPress={() => pickLogo('camera')} disabled={uploading} />
            {logoUrl && <Button small kind="ghost" title={t('Togli logo')} onPress={removeLogo} />}
          </View>
        </Row>
        <Field label={t('Nome del centro')} value={name} onChangeText={setName} />
        <Field label={t('Indirizzo della sede')} value={address} onChangeText={setAddress} />
      </Card>

      <Step title={t('Campi')} />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Body bold>{t('Numero di campi')}</Body>
          <Row>
            <Button small kind="ghost" title="−" onPress={() => setFieldCount(fieldList.length - 1)} disabled={fieldList.length <= 1} />
            <Text style={{ color: c.text, fontSize: 22, fontWeight: '800', minWidth: 28, textAlign: 'center' }}>{fieldList.length}</Text>
            <Button
              small
              kind="ghost"
              title="+"
              onPress={() => setFieldCount(fieldList.length + 1)}
              disabled={plan.maxFields !== null && fieldList.length >= plan.maxFields}
            />
          </Row>
        </Row>
        <Muted style={{ fontSize: 13 }}>
          {t('Ogni campo ha orari e prenotazioni suoi. Più campi possono stare allo stesso indirizzo. Se togli un campo, le prenotazioni già fatte restano nel piano.')}
        </Muted>
        {plan.maxFields !== null && (
          <Muted style={{ fontSize: 13, color: fieldList.length > plan.maxFields ? c.brassText : c.muted }}>
            {fieldList.length > plan.maxFields
              ? t('Il piano {piano} prevede {campi}: si prenotano solo i primi.', { piano: plan.label, campi: fieldsText })
              : t('Il piano {piano} prevede fino a {campi}. Per averne di più serve un piano superiore.', { piano: plan.label, campi: fieldsText })}
          </Muted>
        )}
      </Card>
      {fieldList.map((f, i) => (
        <Card key={f.id ?? `new-${i}`}>
          <Field label={t('Campo {n}: nome', { n: i + 1 })} value={f.name} onChangeText={(v) => setFieldAt(i, { name: v })} />
          <Field label={t('Indirizzo')} value={f.address} onChangeText={(v) => setFieldAt(i, { address: v })} />
        </Card>
      ))}

      {plan.trainers ? (
        <>
          <Step title={t('Trainer')} />
          <Muted>{t('Assegni il trainer a ogni lezione dal piano del giorno. Un trainer non può avere due lezioni alla stessa ora.')}</Muted>
          {trainerList.map((tr, i) => (
            <Card key={tr.id ?? `new-${i}`}>
              <Field label={t('Nome')} value={tr.name} onChangeText={(v) => setTrainerAt(i, { name: v })} />
              <Muted style={{ fontSize: 13 }}>{t('Lezioni che segue (nessuna scelta = tutte)')}</Muted>
              <Row>
                {types.map((lt) => {
                  const on = tr.lessons.includes(lt.id);
                  return (
                    <Button
                      key={lt.id}
                      small
                      kind={on ? 'primary' : 'ghost'}
                      title={lt.label}
                      onPress={() => setTrainerAt(i, { lessons: on ? tr.lessons.filter((x) => x !== lt.id) : [...tr.lessons, lt.id] })}
                    />
                  );
                })}
              </Row>
              <Button small kind="danger" title={t('Togli trainer')} onPress={() => setTrainerList(trainerList.filter((_, j) => j !== i))} />
            </Card>
          ))}
          <Button
            title={t('+ Aggiungi trainer')}
            kind="ghost"
            disabled={plan.maxTrainers !== null && trainerList.length >= plan.maxTrainers}
            onPress={() => setTrainerList([...trainerList, { name: '', lessons: [] }])}
          />
          <LimitNote kind="maxTrainers" count={trainerList.length} what={t('trainer')} />
        </>
      ) : (
        <PlanNote title={t('Trainer')} plan={planWith('trainers')} />
      )}

      <Step title={t('Orari e regole')} />
      <Card>
        <Row>
          <Field label={t('Apre alle')} value={openAt} onChangeText={setOpenAt} style={{ flex: 1, minWidth: 120 }} />
          <Field label={t('Chiude alle')} value={closeAt} onChangeText={setCloseAt} style={{ flex: 1, minWidth: 120 }} />
        </Row>
        <Row>
          <Field label={t('Disdetta fino a (ore prima)')} value={cancelHours} onChangeText={setCancelHours} keyboardType="number-pad" style={{ flex: 1, minWidth: 140 }} />
          <Field label={t('Sospendi alla penalità n° (0 = mai)')} value={penaltyLimit} onChangeText={setPenaltyLimit} keyboardType="number-pad" style={{ flex: 1, minWidth: 140 }} />
        </Row>
        <Toggle label={t('Pagamento online')} value={settings.online_payments} onChange={() => {}} disabled />
        <Muted style={{ fontSize: 13 }}>
          {t('Il pagamento online si attiva dopo aver collegato un conto Stripe. Per ora i clienti pagano al campo.')}
        </Muted>
      </Card>

      <Step title={t('Lezioni')} />
      {types.map((ty, i) => (
        <Card key={ty.id}>
          <Field label={t('Nome')} value={ty.label} onChangeText={(v) => setType(i, { label: v })} />
          <Field label={t('Descrizione')} value={ty.description} onChangeText={(v) => setType(i, { description: v })} />
          <Row>
            <Field label={t('Durata (min)')} value={ty.duration} onChangeText={(v) => setType(i, { duration: v })} keyboardType="number-pad" style={{ flex: 1, minWidth: 120 }} />
            <Field label={t('Prezzo (€)')} value={ty.price} onChangeText={(v) => setType(i, { price: v })} keyboardType="decimal-pad" style={{ flex: 1, minWidth: 120 }} />
          </Row>
          <Field label={t('Opzioni, separate da virgola')} value={ty.options} onChangeText={(v) => setType(i, { options: v })} />
          <Toggle label={t('Prenotabile')} value={ty.active} onChange={(v) => setType(i, { active: v })} disabled={!ty.active && typesFull} />
          {(plan.groups || ty.group) && (
            <>
              <Toggle label={t('Lezione di gruppo')} value={ty.group} onChange={(v) => setType(i, { group: v })} />
              {ty.group && (
                <>
                  <Field
                    label={t('Posti per classe')}
                    value={ty.seats}
                    onChangeText={(v) => setType(i, { seats: v })}
                    keyboardType="number-pad"
                  />
                  <Muted style={{ fontSize: 13 }}>
                    {t('Le classi si mettono in calendario dal Giorno; i clienti si iscrivono ai posti liberi e ogni cane paga la sua lezione.')}
                  </Muted>
                </>
              )}
            </>
          )}
        </Card>
      ))}
      <Button
        title={t('+ Aggiungi lezione')}
        kind="ghost"
        disabled={typesFull}
        onPress={() =>
          setTypes([
            ...types,
            // L'id resta fisso anche se poi cambi il nome; serve ai trainer per riconoscere la lezione.
            { id: `lez-${Date.now().toString(36)}`, label: '', description: '', duration: '60', price: '0', options: '', active: true, group: false, seats: '6' },
          ])
        }
      />
      <Muted style={{ fontSize: 13 }}>
        {t('Per togliere una lezione spegni "Prenotabile": i clienti non la vedono più, ma restano le prenotazioni già fatte.')}
      </Muted>
      <LimitNote kind="maxLessonTypes" count={activeTypes} what={t('lezioni prenotabili')} />
      {!plan.groups && (
        <Muted style={{ fontSize: 13 }}>
          {t('Le lezioni di gruppo, con più cani nella stessa classe, sono nel piano {piano}. Per passare a un piano superiore chiedi un nuovo codice di licenza.', { piano: planWith('groups') })}
        </Muted>
      )}

      {plan.packages ? (
        <>
          <Step title={t('Pacchetti')} />
          <PackagesEditor />
        </>
      ) : (
        <PlanNote title={t('Pacchetti')} plan={planWith('packages')} />
      )}

      {plan.invoices ? (
        <>
          <Step title={t('Fatture')} />
          <InvoicesPanel />
        </>
      ) : (
        <PlanNote title={t('Fatture e scontrini')} plan={planWith('invoices')} />
      )}

      <Step title={t('Regolamento e privacy')} />
      <Card>
        <Muted>
          {t("Le regole su orari, disdetta e penalità sono già scritte dall'app. Qui aggiungi le tue, una per riga.")}
        </Muted>
        <Field label={t('Regolamento')} value={rules} onChangeText={setRules} multiline />
        <Field label={t('Informativa privacy')} value={privacy} onChangeText={setPrivacy} multiline />
        {consentsChanged && (
          <Body style={{ color: c.brassText }}>
            {t('Salvando, i clienti dovranno accettare di nuovo il testo modificato prima di prenotare.')}
          </Body>
        )}
      </Card>

      <ErrorText>{err}</ErrorText>
      {!!msg && <Muted>{msg}</Muted>}
      <Button title={t('Salva impostazioni')} onPress={save} loading={saving} />

      <Muted style={{ textAlign: 'center' }}>{t('Accesso come proprietario: {email}', { email: profile?.email ?? '' })}</Muted>
      <Button title={t('Esci')} kind="ghost" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
