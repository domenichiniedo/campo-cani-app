import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { BillingFields } from '@/components/billing-fields';
import { PhotoEditor } from '@/components/photo';
import { Badge, Body, Button, Card, Chips, ConfirmButton, ErrorText, Expandable, Field, H1, Muted, Row, Screen, Step } from '@/components/ui';
import { billingColumns, billingError, billingFromProfile } from '@/lib/billing';
import { euro, isDayKey, shortDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { invoiceTitle, rulesLines, type Dog, type Invoice, type Penalty } from '@/lib/types';
import { usePlan } from '@/lib/plans';

export default function Profile() {
  const { profile, settings, lessonTypes, refresh } = useSession();
  const [first, setFirst] = useState(profile?.first_name ?? '');
  const [last, setLast] = useState(profile?.last_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [billing, setBilling] = useState(billingFromProfile(profile));
  const plan = usePlan();
  const [docPref, setDocPref] = useState(profile?.doc_pref ?? 'invoice');
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [penalties, setPenalties] = useState<Penalty[]>([]);
  const [newDog, setNewDog] = useState({ name: '', breed: '', birth: '' });
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [deleteErr, setDeleteErr] = useState('');

  async function deleteAccount() {
    setDeleteErr('');
    const { error } = await supabase.rpc('delete_my_account');
    if (error) return setDeleteErr(errorText(error));
    // L'utente non esiste più: chiudiamo solo la sessione su questo telefono.
    await supabase.auth.signOut({ scope: 'local' });
  }
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!profile) return;
    supabase
      .from('invoices')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setInvoices((data ?? []) as Invoice[]));
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
      .update({ first_name: first.trim(), last_name: last.trim(), phone: phone.trim(), doc_pref: docPref, ...billingColumns(billing) })
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
        {profile && (
          <PhotoEditor
            name={`${first} ${last}`}
            path={profile.photo_path}
            prefix={`cliente-${profile.id}-`}
            save={async (path) => {
              const { error } = await supabase.from('profiles').update({ photo_path: path }).eq('id', profile.id);
              if (error) return errorText(error);
              await refresh();
              return null;
            }}
          />
        )}
        <Row>
          <Field label="Nome" value={first} onChangeText={setFirst} style={{ flex: 1, minWidth: 140 }} />
          <Field label="Cognome" value={last} onChangeText={setLast} style={{ flex: 1, minWidth: 140 }} />
        </Row>
        <Field label="Telefono" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Muted>Email: {profile?.email}</Muted>
        <BillingFields value={billing} onChange={setBilling} />
        {plan.invoices && (
          <>
            <Muted style={{ fontSize: 13 }}>Per pacchetti e pagamenti online vuoi</Muted>
            <Chips
              items={[
                { value: 'invoice', label: 'Fattura' },
                { value: 'receipt', label: 'Scontrino' },
              ]}
              value={docPref}
              onChange={setDocPref}
            />
          </>
        )}
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

      {invoices.length > 0 && (
        <>
          <Step title="Fatture e scontrini" />
          {invoices.map((i) => (
            <Card key={i.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Body bold>{invoiceTitle(i)}</Body>
                {i.status === 'sent' ? <Badge tone="ok">Emesso</Badge> : <Badge tone="warn">In preparazione</Badge>}
              </Row>
              <Muted>
                {i.description} · {euro(i.total_cents)}
              </Muted>
            </Card>
          ))}
          <Muted style={{ fontSize: 13 }}>
            Le fatture inviate le trovi anche nel tuo cassetto fiscale sul sito dell&apos;Agenzia delle Entrate. Lo scontrino te lo
            consegna il campo.
          </Muted>
        </>
      )}

      <Step title="Documenti" />
      <Card>
        {settings && <Expandable title="il regolamento" lines={rulesLines(settings, lessonTypes)} />}
        {settings && <Expandable title="l'informativa privacy" lines={settings.privacy.split('\n').filter(Boolean)} />}
        <Muted style={{ fontSize: 13 }}>
          Consensi dati il {shortDate(profile?.rules_accepted_at)} (regolamento) e il {shortDate(profile?.privacy_accepted_at)} (privacy).
        </Muted>
      </Card>

      <Button title="Esci" kind="ghost" onPress={() => supabase.auth.signOut()} />

      <Step title="Cancella account" />
      <Card>
        <Muted>
          Annulla le tue lezioni in programma e cancella i tuoi dati, i cani e i pacchetti. Le fatture già emesse restano al
          campo, come chiede la legge. Le lezioni rimaste nei pacchetti non vengono rimborsate dall&apos;app: parlane con il
          campo prima di procedere.
        </Muted>
        <ConfirmButton title="Cancella il mio account" onConfirm={deleteAccount} />
        <ErrorText>{deleteErr}</ErrorText>
      </Card>
    </Screen>
  );
}
