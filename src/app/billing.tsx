import { useState } from 'react';

import { BillingFields } from '@/components/billing-fields';
import { Body, Button, Card, ErrorText, H1, Screen } from '@/components/ui';
import { billingColumns, billingError, billingFromProfile } from '@/lib/billing';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';

/** Per chi si è iscritto prima che servissero i dati di fatturazione. */
export default function Billing() {
  const { profile, refresh } = useSession();
  const [billing, setBilling] = useState(billingFromProfile(profile));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!profile) return null;

  async function save() {
    const bErr = billingError(billing);
    if (bErr) return setErr(bErr);
    setErr('');
    setBusy(true);
    const { error } = await supabase.from('profiles').update(billingColumns(billing)).eq('id', profile!.id);
    if (error) {
      setBusy(false);
      return setErr(errorText(error));
    }
    await refresh();
    setBusy(false);
  }

  return (
    <Screen>
      <H1>Dati per la fattura</H1>
      <Body>Per continuare a prenotare servono il tuo codice fiscale e l&apos;indirizzo di fatturazione.</Body>
      <Card accent>
        <BillingFields value={billing} onChange={setBilling} />
        <ErrorText>{err}</ErrorText>
        <Button title="Salva e continua" onPress={save} loading={busy} />
      </Card>
      <Button title="Esci" kind="ghost" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
