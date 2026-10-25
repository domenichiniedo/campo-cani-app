import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { PhotoEditor } from '@/components/photo';
import { ChipField, chipOk, ClientKindCard, DogFacts, dogColumns, dogLine, GoalsField, newDog as emptyDog, type DogDraft } from '@/components/signup-parts';
import { Badge, Body, Button, Card, Check, ConfirmButton, ErrorText, Expandable, Field, H1, Muted, Row, Screen, Step } from '@/components/ui';
import { billingFromProfile, docColumns, docError, type ClientKind } from '@/lib/billing';
import { euro, isDayKey, shortDate } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { invoiceTitle, rulesLines, type Dog, type Invoice, type Penalty } from '@/lib/types';

export default function Profile() {
  const { profile, settings, lessonTypes, refresh } = useSession();
  const [first, setFirst] = useState(profile?.first_name ?? '');
  const [last, setLast] = useState(profile?.last_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [billing, setBilling] = useState(billingFromProfile(profile));
  const [kind, setKind] = useState<ClientKind>(profile?.client_kind ?? 'persona');
  const [wantsInvoice, setWantsInvoice] = useState(profile?.client_kind === 'societa' && profile.doc_pref === 'invoice');
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [penalties, setPenalties] = useState<Penalty[]>([]);
  const [newDog, setNewDog] = useState<DogDraft>(emptyDog);
  // I dettagli di un cane già iscritto che il cliente sta cambiando, per cane.
  const [edits, setEdits] = useState<Record<string, DogDraft>>({});
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [deleteErr, setDeleteErr] = useState('');
  const [socialErr, setSocialErr] = useState('');

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
    // Solo un'associazione o società che vuole la fattura deve dare i suoi dati.
    const bErr = docError(kind, wantsInvoice, billing);
    if (bErr) return setErr(bErr);
    setErr('');
    const { error } = await supabase
      .from('profiles')
      .update({ first_name: first.trim(), last_name: last.trim(), phone: phone.trim(), ...docColumns(kind, wantsInvoice, billing) })
      .eq('id', profile.id);
    if (error) return setErr(errorText(error));
    setMsg(t('Dati salvati.'));
    refresh();
  }

  async function addDog() {
    if (!profile || !newDog.name.trim()) return;
    if (newDog.birth && !isDayKey(newDog.birth)) return setErr(t('Scrivi la data di nascita come AAAA-MM-GG.'));
    if (!chipOk(newDog.chip)) return setErr(t('Il microchip ha 15 cifre: controllalo o lascialo vuoto.'));
    setErr('');
    const { error } = await supabase
      .from('dogs')
      .insert({ owner_id: profile.id, ...dogColumns(newDog) });
    if (error) return setErr(errorText(error));
    setNewDog(emptyDog());
    load();
  }

  const draftOf = (d: Dog): DogDraft => ({
    name: d.name,
    breed: d.breed,
    birth: d.birth ?? '',
    chip: d.chip,
    goals: d.goals,
    sex: d.sex,
    neutered: d.neutered === null ? '' : d.neutered ? 'si' : 'no',
  });

  async function saveDog(id: string) {
    const x = edits[id];
    if (!x) return;
    if (!chipOk(x.chip)) return setErr(t('Il microchip ha 15 cifre: controllalo o lascialo vuoto.'));
    setErr('');
    const { chip, goals, sex, neutered } = dogColumns(x);
    const { error } = await supabase.from('dogs').update({ chip, goals, sex, neutered }).eq('id', id);
    if (error) return setErr(errorText(error));
    setEdits(({ [id]: _, ...rest }) => rest);
    load();
  }

  async function archiveDog(id: string) {
    const { error } = await supabase.from('dogs').update({ archived: true }).eq('id', id);
    if (error) setErr(errorText(error));
    load();
  }

  return (
    <Screen>
      <H1>{t('Profilo')}</H1>

      <Step title={t('I tuoi dati')} />
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
          <Field label={t('Nome')} value={first} onChangeText={setFirst} style={{ flex: 1, minWidth: 140 }} />
          <Field label={t('Cognome')} value={last} onChangeText={setLast} style={{ flex: 1, minWidth: 140 }} />
        </Row>
        <Field label={t('Telefono')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Muted>{t('Email: {email}', { email: profile?.email ?? '' })}</Muted>
        {!!msg && <Muted>{msg}</Muted>}
        <Button title={t('Salva')} onPress={saveMe} small />
      </Card>
      <ClientKindCard kind={kind} onKind={setKind} wants={wantsInvoice} onWants={setWantsInvoice} billing={billing} onBilling={setBilling} />
      <Button title={t('Salva')} onPress={saveMe} small kind="ghost" />

      <Step title={t('I tuoi cani')} />
      {dogs.map((d) => {
        const own = penalties.filter((p) => p.dog_id === d.id);
        return (
          <Card key={d.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Body bold>{d.name}</Body>
              {d.blocked ? <Badge tone="bad">{t('Sospeso')}</Badge> : own.length > 0 && <Badge tone="warn">{t('{n} penalità', { n: own.length })}</Badge>}
            </Row>
            <Muted>{dogLine(d, (day) => t('nato il {data}', { data: shortDate(day) })) || t('Nessun dettaglio')}</Muted>
            {!!d.goals && <Muted style={{ fontSize: 13 }}>{d.goals}</Muted>}
            {edits[d.id] ? (
              <>
                <DogFacts sex={edits[d.id].sex} neutered={edits[d.id].neutered} onChange={(p) => setEdits({ ...edits, [d.id]: { ...edits[d.id], ...p } })} />
                <ChipField value={edits[d.id].chip} onChange={(chip) => setEdits({ ...edits, [d.id]: { ...edits[d.id], chip } })} />
                <GoalsField value={edits[d.id].goals} onChange={(goals) => setEdits({ ...edits, [d.id]: { ...edits[d.id], goals } })} />
                <Row>
                  <Button title={t('Salva')} small onPress={() => saveDog(d.id)} />
                  <Button title={t('Annulla')} small kind="ghost" onPress={() => setEdits(({ [d.id]: _, ...rest }) => rest)} />
                </Row>
              </>
            ) : (
              <Button
                title={d.chip ? t('Cambia i dettagli') : t('Aggiungi microchip e dettagli')}
                small
                kind="ghost"
                onPress={() => setEdits({ ...edits, [d.id]: draftOf(d) })}
              />
            )}
            {own.map((p) => (
              <Muted key={p.id} style={{ fontSize: 13 }}>
                {shortDate(p.created_at)}: {t(p.reason)}
              </Muted>
            ))}
            <Button title={t('Rimuovi dal profilo')} kind="danger" small onPress={() => archiveDog(d.id)} />
          </Card>
        );
      })}
      <Card>
        <Body bold>{t('Aggiungi un cane')}</Body>
        <Field label={t('Nome')} value={newDog.name} onChangeText={(v) => setNewDog({ ...newDog, name: v })} />
        <Field label={t('Razza')} value={newDog.breed} onChangeText={(v) => setNewDog({ ...newDog, breed: v })} />
        <Field label={t('Nato il (AAAA-MM-GG)')} value={newDog.birth} onChangeText={(v) => setNewDog({ ...newDog, birth: v })} placeholder="2024-03-15" />
        <DogFacts sex={newDog.sex} neutered={newDog.neutered} onChange={(p) => setNewDog({ ...newDog, ...p })} />
        <ChipField value={newDog.chip} onChange={(v) => setNewDog({ ...newDog, chip: v })} />
        <GoalsField value={newDog.goals} onChange={(v) => setNewDog({ ...newDog, goals: v })} />
        <Button title={t('Aggiungi')} small kind="ghost" onPress={addDog} disabled={!newDog.name.trim()} />
      </Card>
      <ErrorText>{err}</ErrorText>

      {invoices.length > 0 && (
        <>
          <Step title={t('Fatture e scontrini')} />
          {invoices.map((i) => (
            <Card key={i.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Body bold>{invoiceTitle(i)}</Body>
                {i.status === 'sent' ? <Badge tone="ok">{t('Emesso')}</Badge> : <Badge tone="warn">{t('In preparazione')}</Badge>}
              </Row>
              <Muted>
                {i.description} · {euro(i.total_cents)}
              </Muted>
            </Card>
          ))}
          <Muted style={{ fontSize: 13 }}>
            {t("Le fatture inviate le trovi anche nel tuo cassetto fiscale sul sito dell'Agenzia delle Entrate. Lo scontrino te lo consegna il campo.")}
          </Muted>
        </>
      )}

      <Step title={t('Documenti')} />
      <Card>
        {settings && <Expandable title={t('il regolamento')} lines={rulesLines(settings, lessonTypes)} />}
        {settings && <Expandable title={t("l'informativa privacy")} lines={settings.privacy.split('\n').filter(Boolean)} />}
        <Muted style={{ fontSize: 13 }}>
          {t('Consensi dati il {regolamento} (regolamento) e il {privacy} (privacy).', {
            regolamento: shortDate(profile?.rules_accepted_at),
            privacy: shortDate(profile?.privacy_accepted_at),
          })}
        </Muted>
        {profile && (
          <>
            <Check
              value={profile.social_consent}
              onChange={async (v) => {
                setSocialErr('');
                const { error } = await supabase.from('profiles').update({ social_consent: v }).eq('id', profile.id);
                if (error) setSocialErr(errorText(error));
                await refresh();
              }}>
              {t('Acconsento alla pubblicazione sui social del centro di foto e video in cui compaiono i miei cani o io.')}
            </Check>
            <Muted style={{ fontSize: 13 }}>
              {profile.social_consent_at
                ? t('Scelta fatta il {giorno}. Puoi cambiarla quando vuoi.', { giorno: shortDate(profile.social_consent_at) })
                : t('Facoltativo: puoi cambiare idea quando vuoi.')}
            </Muted>
            <ErrorText>{socialErr}</ErrorText>
          </>
        )}
      </Card>

      <Button title={t('Esci')} kind="ghost" onPress={() => supabase.auth.signOut()} />

      <Step title={t('Cancella account')} />
      <Card>
        <Muted>
          {t("Annulla le tue lezioni in programma e cancella i tuoi dati, i cani e i pacchetti. Le fatture già emesse restano al campo, come chiede la legge. Le lezioni rimaste nei pacchetti non vengono rimborsate dall'app: parlane con il campo prima di procedere.")}
        </Muted>
        <ConfirmButton title={t('Cancella il mio account')} onConfirm={deleteAccount} />
        <ErrorText>{deleteErr}</ErrorText>
      </Card>
    </Screen>
  );
}
