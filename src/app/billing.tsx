import { useState } from 'react';

import { BillingFields } from '@/components/billing-fields';
import { Body, Button, Card, ErrorText, H1, Screen } from '@/components/ui';
import { billingColumns, billingError, billingFromProfile } from '@/lib/billing';
import { t } from '@/lib/i18n';
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

  async function noInvoice() {
    setErr('');
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ doc_pref: 'receipt' }).eq('id', profile!.id);
    if (error) {
      setBusy(false);
      return setErr(errorText(error));
    }
    await refresh();
    setBusy(false);
  }

  return (
    <Screen>
      <H1>{t('Dati per la fattura')}</H1>
      <Body>{t("Hai chiesto la fattura: per riceverla servono il tuo codice fiscale e l'indirizzo di fatturazione.")}</Body>
      <Card accent>
        <BillingFields value={billing} onChange={setBilling} />
        <ErrorText>{err}</ErrorText>
        <Button title={t('Salva e continua')} onPress={save} loading={busy} />
      </Card>
      <Button title={t('Non mi serve la fattura')} kind="ghost" onPress={noInvoice} />
      <Button title={t('Esci')} kind="ghost" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
