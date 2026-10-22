import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { BillingFields } from '@/components/billing-fields';
import { Badge, Body, Button, Card, ErrorText, Expandable, Field, H1, Muted, Row, Screen, Step } from '@/components/ui';
import { billingColumns, billingError, billingFromProfile } from '@/lib/billing';
import { isDayKey, shortDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { rulesLines, type Dog, type Penalty } from '@/lib/types';

export default function Profile() {
  const { profile, settings, lessonTypes, refresh } = useSession();
  const [first, setFirst] = useState(profile?.first_name ?? '');
  const [last, setLast] = useState(profile?.last_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [billing, setBilling] = useState(billingFromProfile(profile));
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [penalties, setPenalties] = useState<Penalty[]>([]);
  const [newDog, setNewDog] = useState({ name: '', breed: '', birth: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!profile) return;
    const d = await supabase.from('dogs').select('*').eq('owner_id', profile.id).eq('archived', false).order('name');
    const list = (d.data ?? []) as Dog[];
    setDogs(list);
    if (list.length) {
      const p = await supabase.from('penalties').select('*').in('dog_id', list.map((x) => x.id)).order('created_at', { ascending: false });
      setPenalties((p.data ?? []) as Penalty[]);
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function saveMe() {
    if (!profile) return;
    const bErr = billingError(billing);
    if (bErr) return setErr(bErr);
    setErr('');
    const { error } = await supabase
      .from('profiles')
      .update({ first_name: first.trim(), last_name: last.trim(), phone: phone.trim(), ...billingColumns(billing) })
      .eq('id', profile.id);
    if (error) return setErr(errorText(error));
    setMsg('Dati salvati.');
    refresh();
  }

  async function addDog() {
    if (!profile || !newDog.name.trim()) return;
    if (newDog.birth && !isDayKey(newDog.birth)) return setErr('Scrivi la data di nascita come AAAA-MM-GG.');
    setErr('');
    const { error } = await supabase
      .from('dogs')
      .insert({ owner_id: profile.id, name: newDog.name.trim(), breed: newDog.breed.trim(), birth: newDog.birth || null });
    if (error) return setErr(errorText(error));
    setNewDog({ name: '', breed: '', birth: '' });
    load();
  }

  async function archiveDog(id: string) {
    const { error } = await supabase.from('dogs').update({ archived: true }).eq('id', id);
    if (error) setErr(errorText(error));
    load();
  }

  return (
    <Screen>
      <H1>Profilo</H1>

      <Step title="I tuoi dati" />
      <Card>
        <Row>
          <Field label="Nome" value={first} onChangeText={setFirst} style={{ flex: 1, minWidth: 140 }} />
          <Field label="Cognome" value={last} onChangeText={setLast} style={{ flex: 1, minWidth: 140 }} />
        </Row>
        <Field label="Telefono" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Muted>Email: {profile?.email}</Muted>
        <BillingFields value={billing} onChange={setBilling} />
        {!!msg && <Muted>{msg}</Muted>}
        <Button title="Salva" onPress={saveMe} small />
      </Card>

      <Step title="I tuoi cani" />
      {dogs.map((d) => {
        const own = penalties.filter((p) => p.dog_id === d.id);
        return (
          <Card key={d.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Body bold>{d.name}</Body>
              {d.blocked ? <Badge tone="bad">Sospeso</Badge> : own.length > 0 && <Badge tone="warn">{`${own.length} penalità`}</Badge>}
            </Row>
            <Muted>
              {[d.breed, d.birth && `nato il ${shortDate(d.birth)}`].filter(Boolean).join(' · ') || 'Nessun dettaglio'}
            </Muted>
            {own.map((p) => (
              <Muted key={p.id} style={{ fontSize: 13 }}>
                {shortDate(p.created_at)}: {p.reason}
              </Muted>
            ))}
            <Button title="Rimuovi dal profilo" kind="danger" small onPress={() => archiveDog(d.id)} />
          </Card>
        );
      })}
      <Card>
        <Body bold>Aggiungi un cane</Body>
        <Field label="Nome" value={newDog.name} onChangeText={(v) => setNewDog({ ...newDog, name: v })} />
        <Field label="Razza" value={newDog.breed} onChangeText={(v) => setNewDog({ ...newDog, breed: v })} />
        <Field label="Nato il (AAAA-MM-GG)" value={newDog.birth} onChangeText={(v) => setNewDog({ ...newDog, birth: v })} placeholder="2024-03-15" />
        <Button title="Aggiungi" small kind="ghost" onPress={addDog} disabled={!newDog.name.trim()} />
      </Card>
      <ErrorText>{err}</ErrorText>

      <Step title="Documenti" />
      <Card>
        {settings && <Expandable title="il regolamento" lines={rulesLines(settings, lessonTypes)} />}
        {settings && <Expandable title="l'informativa privacy" lines={settings.privacy.split('\n').filter(Boolean)} />}
        <Muted style={{ fontSize: 13 }}>
          Consensi dati il {shortDate(profile?.rules_accepted_at)} (regolamento) e il {shortDate(profile?.privacy_accepted_at)} (privacy).
        </Muted>
      </Card>

      <Button title="Esci" kind="ghost" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
