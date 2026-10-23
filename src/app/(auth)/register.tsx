import { router } from 'expo-router';
import { useState } from 'react';

import { BillingFields } from '@/components/billing-fields';
import { PhotoPicker, saveSignupPhoto } from '@/components/photo';
import { Body, Button, Card, Check, Chips, ErrorText, Expandable, Field, H1, Muted, Row, Screen, Step } from '@/components/ui';
import { billingColumns, billingError, emptyBilling, type BillingDraft } from '@/lib/billing';
import { isDayKey } from '@/lib/format';
import { t } from '@/lib/i18n';
import type { Picked } from '@/lib/images';
import { usePlan } from '@/lib/plans';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { rulesLines } from '@/lib/types';

type DogDraft = { name: string; breed: string; birth: string };

export default function Register() {
  const { settings, lessonTypes, refresh } = useSession();
  const plan = usePlan();
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [photo, setPhoto] = useState<Picked | null>(null);
  const [billing, setBilling] = useState<BillingDraft>(emptyBilling);
  const [dogs, setDogs] = useState<DogDraft[]>([{ name: '', breed: '', birth: '' }]);
  const [rulesOk, setRulesOk] = useState(false);
  const [privacyOk, setPrivacyOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  // Il trainer non porta cani e non paga: servono solo i suoi dati e i consensi.
  const [asTrainer, setAsTrainer] = useState(false);

  const setDog = (i: number, patch: Partial<DogDraft>) => setDogs(dogs.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  async function submit() {
    setErr('');
    const cleanDogs = dogs.filter((d) => d.name.trim());
    if (!first.trim() || !last.trim() || !phone.trim()) return setErr(t('Inserisci nome, cognome e telefono.'));
    const bErr = asTrainer ? null : billingError(billing);
    if (bErr) return setErr(bErr);
    if (!asTrainer && !cleanDogs.length) return setErr(t('Inserisci almeno un cane.'));
    if (cleanDogs.some((d) => d.birth && !isDayKey(d.birth))) return setErr(t('Scrivi la data di nascita come AAAA-MM-GG, per esempio 2024-03-15.'));
    if (password.length < 8) return setErr(t('La password deve avere almeno 8 caratteri.'));
    if (!rulesOk || !privacyOk) return setErr(t('Per iscriverti devi accettare il regolamento e l’informativa privacy.'));
    if (!settings) return setErr(t('Impossibile leggere il regolamento. Controlla la connessione.'));

    setBusy(true);
    if (!asTrainer && plan.maxClients !== null) {
      const { data: count } = await supabase.rpc('client_count');
      if (typeof count === 'number' && count >= plan.maxClients) {
        setBusy(false);
        return setErr(t('Il centro ha raggiunto il numero massimo di iscritti previsto dal suo abbonamento. Contatta il centro.'));
      }
    }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          first_name: first.trim(),
          last_name: last.trim(),
          phone: phone.trim(),
          ...(asTrainer ? {} : billingColumns(billing)),
          rules_ver: settings.rules_ver,
          privacy_ver: settings.privacy_ver,
          dogs: asTrainer ? [] : cleanDogs.map((d) => ({ name: d.name.trim(), breed: d.breed.trim(), birth: d.birth || null })),
        },
      },
    });
    if (error) {
      setBusy(false);
      return setErr(errorText(error));
    }
    // La foto si carica appena c'è l'account; se serve confermare l'email, si mette poi dal profilo.
    if (photo && data.session) {
      await saveSignupPhoto(data.session.user.id, photo);
      await refresh();
    }
    setBusy(false);
    // Se il progetto chiede la conferma dell'email non arriva una sessione: lo diciamo al cliente.
    if (!data.session) setSent(true);
  }

  if (sent) {
    return (
      <Screen>
        <H1>{t("Controlla l'email")}</H1>
        <Body>{t("Ti abbiamo mandato un link a {email}. Aprilo per confermare l'iscrizione, poi accedi.", { email: email.trim() })}</Body>
        {photo && <Muted>{t('La foto che hai scelto mettila dal tuo profilo, dopo il primo accesso.')}</Muted>}
        <Button title={t("Vai all'accesso")} onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <H1>{t('Iscriviti')}</H1>
      <Muted>
        {asTrainer
          ? t("Usa l'email che hai dato al centro: entrerai nell'area trainer con le tue lezioni.")
          : t('Servono i tuoi dati, quelli del cane e il consenso al regolamento e alla privacy.')}
      </Muted>
      <Chips
        items={[
          { value: 'client', label: t('Sono un cliente') },
          { value: 'trainer', label: t('Sono un trainer del centro') },
        ]}
        value={asTrainer ? 'trainer' : 'client'}
        onChange={(v) => setAsTrainer(v === 'trainer')}
      />

      <Step n="1" title={t('I tuoi dati')} />
      <Card>
        <Row>
          <Field label={t('Nome')} value={first} onChangeText={setFirst} autoComplete="given-name" style={{ flex: 1, minWidth: 140 }} />
          <Field label={t('Cognome')} value={last} onChangeText={setLast} autoComplete="family-name" style={{ flex: 1, minWidth: 140 }} />
        </Row>
        <Field label={t('Telefono')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
        <Field label={t('Email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field label={t('Password (almeno 8 caratteri)')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
      </Card>

      <Step n="2" title={t('La tua foto (se vuoi)')} />
      <Card>
        <Muted>
          {asTrainer
            ? t('I clienti la vedono nelle loro lezioni e nel diario dei cani. Puoi metterla anche dopo, dal tuo profilo.')
            : t('Il centro e i trainer la vedono per riconoscerti al campo. Puoi metterla anche dopo, dal tuo profilo.')}
        </Muted>
        <PhotoPicker name={`${first} ${last}`.trim()} value={photo} onChange={setPhoto} />
      </Card>

      {!asTrainer && (
        <>
          <Step n="3" title={t('Fatturazione')} />
          <Card>
            <BillingFields value={billing} onChange={setBilling} />
          </Card>

          <Step n="4" title={dogs.length > 1 ? t('I tuoi cani') : t('Il tuo cane')} />
        </>
      )}
      {!asTrainer && dogs.map((d, i) => (
        <Card key={i}>
          <Field label={t('Nome del cane')} value={d.name} onChangeText={(v) => setDog(i, { name: v })} />
          <Field label={t('Razza')} value={d.breed} onChangeText={(v) => setDog(i, { breed: v })} />
          <Field label={t('Nato il (AAAA-MM-GG)')} value={d.birth} onChangeText={(v) => setDog(i, { birth: v })} placeholder="2024-03-15" keyboardType="numbers-and-punctuation" />
          {dogs.length > 1 && <Button title={t('Togli questo cane')} kind="danger" small onPress={() => setDogs(dogs.filter((_, j) => j !== i))} />}
        </Card>
      ))}
      {!asTrainer && (
        <Button title={t('+ Aggiungi un altro cane')} kind="ghost" onPress={() => setDogs([...dogs, { name: '', breed: '', birth: '' }])} />
      )}

      <Step n={asTrainer ? '3' : '5'} title={t('Consensi')} />
      <Card>
        {settings && <Expandable title={t('il regolamento')} lines={rulesLines(settings, lessonTypes)} />}
        <Check value={rulesOk} onChange={setRulesOk}>
          {t('Ho letto e accetto il regolamento del campo.')}
        </Check>
        {settings && <Expandable title={t("l'informativa privacy")} lines={settings.privacy.split('\n').filter(Boolean)} />}
        <Check value={privacyOk} onChange={setPrivacyOk}>
          {t("Ho letto l'informativa e acconsento al trattamento dei miei dati per gestire le prenotazioni.")}
        </Check>
      </Card>

      <ErrorText>{err}</ErrorText>
      <Button title={t('Crea il mio account')} onPress={submit} loading={busy} />
      <Button title={t('Ho già un account')} kind="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
