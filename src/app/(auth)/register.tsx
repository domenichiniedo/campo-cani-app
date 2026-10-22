import { router } from 'expo-router';
import { useState } from 'react';

import { BillingFields } from '@/components/billing-fields';
import { Body, Button, Card, Check, ErrorText, Expandable, Field, H1, Muted, Row, Screen, Step } from '@/components/ui';
import { billingColumns, billingError, emptyBilling, type BillingDraft } from '@/lib/billing';
import { isDayKey } from '@/lib/format';
import { usePlan } from '@/lib/plans';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { rulesLines } from '@/lib/types';

type DogDraft = { name: string; breed: string; birth: string };

export default function Register() {
  const { settings, lessonTypes } = useSession();
  const plan = usePlan();
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [billing, setBilling] = useState<BillingDraft>(emptyBilling);
  const [dogs, setDogs] = useState<DogDraft[]>([{ name: '', breed: '', birth: '' }]);
  const [rulesOk, setRulesOk] = useState(false);
  const [privacyOk, setPrivacyOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);

  const setDog = (i: number, patch: Partial<DogDraft>) => setDogs(dogs.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  async function submit() {
    setErr('');
    const cleanDogs = dogs.filter((d) => d.name.trim());
    if (!first.trim() || !last.trim() || !phone.trim()) return setErr('Inserisci nome, cognome e telefono.');
    const bErr = billingError(billing);
    if (bErr) return setErr(bErr);
    if (!cleanDogs.length) return setErr('Inserisci almeno un cane.');
    if (cleanDogs.some((d) => d.birth && !isDayKey(d.birth))) return setErr('Scrivi la data di nascita come AAAA-MM-GG, per esempio 2024-03-15.');
    if (password.length < 8) return setErr('La password deve avere almeno 8 caratteri.');
    if (!rulesOk || !privacyOk) return setErr('Per iscriverti devi accettare il regolamento e l’informativa privacy.');
    if (!settings) return setErr('Impossibile leggere il regolamento. Controlla la connessione.');

    setBusy(true);
    if (plan.maxClients !== null) {
      const { data: count } = await supabase.rpc('client_count');
      if (typeof count === 'number' && count >= plan.maxClients) {
        setBusy(false);
        return setErr('Il centro ha raggiunto il numero massimo di iscritti previsto dal suo abbonamento. Contatta il centro.');
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
          ...billingColumns(billing),
          rules_ver: settings.rules_ver,
          privacy_ver: settings.privacy_ver,
          dogs: cleanDogs.map((d) => ({ name: d.name.trim(), breed: d.breed.trim(), birth: d.birth || null })),
        },
      },
    });
    setBusy(false);
    if (error) return setErr(errorText(error));
    // Se il progetto chiede la conferma dell'email non arriva una sessione: lo diciamo al cliente.
    if (!data.session) setSent(true);
  }

  if (sent) {
    return (
      <Screen>
        <H1>Controlla l&apos;email</H1>
        <Body>Ti abbiamo mandato un link a {email.trim()}. Aprilo per confermare l&apos;iscrizione, poi accedi.</Body>
        <Button title="Vai all'accesso" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <H1>Iscriviti</H1>
      <Muted>Servono i tuoi dati, quelli del cane e il consenso al regolamento e alla privacy.</Muted>

      <Step n="1" title="I tuoi dati" />
      <Card>
        <Row>
          <Field label="Nome" value={first} onChangeText={setFirst} autoComplete="given-name" style={{ flex: 1, minWidth: 140 }} />
          <Field label="Cognome" value={last} onChangeText={setLast} autoComplete="family-name" style={{ flex: 1, minWidth: 140 }} />
        </Row>
        <Field label="Telefono" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field label="Password (almeno 8 caratteri)" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
      </Card>

      <Step n="2" title="Fatturazione" />
      <Card>
        <BillingFields value={billing} onChange={setBilling} />
      </Card>

      <Step n="3" title={dogs.length > 1 ? 'I tuoi cani' : 'Il tuo cane'} />
      {dogs.map((d, i) => (
        <Card key={i}>
          <Field label="Nome del cane" value={d.name} onChangeText={(v) => setDog(i, { name: v })} />
          <Field label="Razza" value={d.breed} onChangeText={(v) => setDog(i, { breed: v })} />
          <Field label="Nato il (AAAA-MM-GG)" value={d.birth} onChangeText={(v) => setDog(i, { birth: v })} placeholder="2024-03-15" keyboardType="numbers-and-punctuation" />
          {dogs.length > 1 && <Button title="Togli questo cane" kind="danger" small onPress={() => setDogs(dogs.filter((_, j) => j !== i))} />}
        </Card>
      ))}
      <Button title="+ Aggiungi un altro cane" kind="ghost" onPress={() => setDogs([...dogs, { name: '', breed: '', birth: '' }])} />

      <Step n="4" title="Consensi" />
      <Card>
        {settings && <Expandable title="il regolamento" lines={rulesLines(settings, lessonTypes)} />}
        <Check value={rulesOk} onChange={setRulesOk}>
          Ho letto e accetto il regolamento del campo.
        </Check>
        {settings && <Expandable title="l'informativa privacy" lines={settings.privacy.split('\n').filter(Boolean)} />}
        <Check value={privacyOk} onChange={setPrivacyOk}>
          Ho letto l&apos;informativa e acconsento al trattamento dei miei dati per gestire le prenotazioni.
        </Check>
      </Card>

      <ErrorText>{err}</ErrorText>
      <Button title="Crea il mio account" onPress={submit} loading={busy} />
      <Button title="Ho già un account" kind="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
