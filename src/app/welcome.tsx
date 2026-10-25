import { useEffect, useState } from 'react';

import { ChipField, chipOk, ClientKindCard, DogFacts, dogColumns, GoalsField, ConsentCard, DogCards, newDog, OptionalSection, SocialCheck, type DogDraft } from '@/components/signup-parts';
import { Body, Button, Card, ErrorText, Field, H1, Muted, Row, Screen, Step } from '@/components/ui';
import { docColumns, docError, emptyBilling, type BillingDraft, type ClientKind } from '@/lib/billing';
import { isDayKey } from '@/lib/format';
import { t } from '@/lib/i18n';
import { usePlan } from '@/lib/plans';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';

/** Nome e cognome che Google ha dato a Supabase (given_name e family_name, o il nome intero). */
function googleName(meta: Record<string, unknown> | undefined) {
  const str = (k: string) => (typeof meta?.[k] === 'string' ? (meta[k] as string).trim() : '');
  if (str('given_name') || str('family_name')) return { first: str('given_name'), last: str('family_name') };
  const [first = '', ...rest] = (str('full_name') || str('name')).split(/\s+/);
  return { first, last: rest.join(' ') };
}

/**
 * Chi entra la prima volta con Google ha l'account ma non è passato dal modulo di iscrizione:
 * qui mette telefono, il nome del cane e il consenso; fattura, altri cani e social sono facoltativi. Poi, se il centro lo chiede, conferma il cellulare via SMS.
 * L'email non va confermata: Google l'ha già verificata.
 */
export default function Welcome() {
  const { session, profile, settings, refresh } = useSession();
  const plan = usePlan();
  const name = googleName(session?.user.user_metadata);
  const [first, setFirst] = useState(profile?.first_name || name.first);
  const [last, setLast] = useState(profile?.last_name || name.last);
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [billing, setBilling] = useState<BillingDraft>(emptyBilling);
  const [wantsInvoice, setWantsInvoice] = useState(false);
  const [kind, setKind] = useState<ClientKind>('persona');
  // Chi ha già dei cani (messi dal centro) non deve riscriverli.
  const [hasDogs, setHasDogs] = useState<boolean | null>(null);
  const [dogs, setDogs] = useState<DogDraft[]>([newDog()]);
  const [accepted, setAccepted] = useState(false);
  const [socialOk, setSocialOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('dogs')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', profile.id)
      .then(({ count }) => setHasDogs((count ?? 0) > 0));
  }, [profile]);

  if (!profile) return null;
  const askDogs = hasDogs === false;

  async function submit() {
    setErr('');
    const cleanDogs = dogs.filter((d) => d.name.trim());
    if (!first.trim() || !last.trim() || !phone.trim()) return setErr(t('Inserisci nome, cognome e telefono.'));
    const bErr = docError(kind, wantsInvoice, billing);
    if (bErr) return setErr(bErr);
    if (askDogs && !cleanDogs.length) return setErr(t('Scrivi il nome del tuo cane.'));
    if (cleanDogs.some((d) => !chipOk(d.chip))) return setErr(t('Il microchip ha 15 cifre: controllalo o lascialo vuoto.'));
    if (cleanDogs.some((d) => d.birth && !isDayKey(d.birth))) return setErr(t('Scrivi la data di nascita come AAAA-MM-GG, per esempio 2024-03-15.'));
    if (!accepted) return setErr(t('Per iscriverti devi accettare il regolamento e l’informativa privacy.'));
    if (!settings) return setErr(t('Impossibile leggere il regolamento. Controlla la connessione.'));

    setBusy(true);
    if (plan.maxClients !== null) {
      // L'account c'è già, quindi nel conto ci sei anche tu.
      const { data: count } = await supabase.rpc('client_count');
      if (typeof count === 'number' && count > plan.maxClients) {
        setBusy(false);
        return setErr(t('Il centro ha raggiunto il numero massimo di iscritti previsto dal suo abbonamento. Contatta il centro.'));
      }
    }
    const fail = (e: unknown) => {
      setBusy(false);
      setErr(errorText(e));
    };
    const p = await supabase
      .from('profiles')
      .update({
        first_name: first.trim(),
        last_name: last.trim(),
        phone: phone.trim(),
        social_consent: socialOk,
        ...docColumns(kind, wantsInvoice, billing),
      })
      .eq('id', profile!.id);
    if (p.error) return fail(p.error);
    if (askDogs) {
      const d = await supabase
        .from('dogs')
        .insert(cleanDogs.map((x) => ({ owner_id: profile!.id, ...dogColumns(x) })));
      if (d.error) return fail(d.error);
    }
    // Per ultimi i consensi: da qui in poi l'iscrizione è completa e il layout porta avanti.
    const a = await supabase.rpc('accept_terms');
    if (a.error) return fail(a.error);
    await refresh();
    setBusy(false);
  }

  const setDogName = (n: string) => setDogs(dogs.map((d, i) => (i === 0 ? { ...d, name: n } : d)));

  return (
    <Screen>
      <H1>{t('Benvenuto!')}</H1>
      <Body>{t('Sei entrato con Google. Per prenotare il campo mancano pochi dati.')}</Body>

      <Card>
        <Row>
          <Field label={t('Nome')} value={first} onChangeText={setFirst} autoComplete="given-name" style={{ flex: 1, minWidth: 140 }} />
          <Field label={t('Cognome')} value={last} onChangeText={setLast} autoComplete="family-name" style={{ flex: 1, minWidth: 140 }} />
        </Row>
        <Field label={t('Telefono')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
        {askDogs && (
          <>
            <Field label={t('Nome del cane')} value={dogs[0].name} onChangeText={setDogName} />
            <DogFacts sex={dogs[0].sex} neutered={dogs[0].neutered} onChange={(p) => setDogs(dogs.map((d, i) => (i === 0 ? { ...d, ...p } : d)))} />
            <ChipField value={dogs[0].chip} onChange={(chip) => setDogs(dogs.map((d, i) => (i === 0 ? { ...d, chip } : d)))} />
            <GoalsField value={dogs[0].goals} onChange={(goals) => setDogs(dogs.map((d, i) => (i === 0 ? { ...d, goals } : d)))} />
          </>
        )}
        <Muted style={{ fontSize: 13 }}>{t('Email: {email}', { email: profile.email })}</Muted>
      </Card>

      <ClientKindCard kind={kind} onKind={setKind} wants={wantsInvoice} onWants={setWantsInvoice} billing={billing} onBilling={setBilling} />

      <ConsentCard accepted={accepted} onAccepted={setAccepted} />

      <OptionalSection>
        {askDogs && (
          <>
            <Step title={dogs.length > 1 ? t('I tuoi cani') : t('Il tuo cane')} />
            <DogCards dogs={dogs} onChange={setDogs} extraOnly />
          </>
        )}
        <SocialCheck value={socialOk} onChange={setSocialOk} />
      </OptionalSection>

      <ErrorText>{err}</ErrorText>
      <Button title={t('Completa l’iscrizione')} onPress={submit} loading={busy} disabled={hasDogs === null} />
      <Button title={t('Esci')} kind="ghost" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
