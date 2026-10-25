import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';

import { Badge, Body, Button, Card, ErrorText, Muted, Row } from '@/components/ui';
import { connectStripe, gestoreEnabled, isCentreCode } from '@/lib/gestore';
import { t } from '@/lib/i18n';
import { useLicense } from '@/lib/license-gate';
import { supabase } from '@/lib/supabase';

type Status = 'attivo' | 'in_verifica' | 'da_completare';

/** Il conto Stripe del centro per i pagamenti online, solo per i centri registrati dall'app. */
export function StripePanel() {
  const { license } = useLicense();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!gestoreEnabled || !license || !isCentreCode(license.id)) return null;
  const code = license.id;

  async function connect() {
    setErr('');
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const r = await connectStripe(code, data.session?.access_token ?? '');
      setStatus(r.stato);
      if (r.link) await WebBrowser.openBrowserAsync(r.link);
    } catch (e) {
      setErr(t((e as Error).message));
    }
    setBusy(false);
  }

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Body bold>{t('Conto Stripe')}</Body>
        {status === 'attivo' && <Badge tone="ok">{t('Collegato')}</Badge>}
        {status === 'in_verifica' && <Badge tone="warn">{t('In verifica')}</Badge>}
        {status === 'da_completare' && <Badge tone="warn">{t('Da completare')}</Badge>}
      </Row>
      <Muted style={{ fontSize: 13 }}>
        {t('I pagamenti online dei clienti arrivano sul conto Stripe del centro. Stripe ti chiede una volta i dati del centro (documento, partita IVA, IBAN).')}
      </Muted>
      <ErrorText>{err}</ErrorText>
      {status !== 'attivo' && (
        <Button small kind="ghost" title={status ? t('Continua su Stripe') : t('Collega il conto Stripe')} onPress={connect} loading={busy} />
      )}
    </Card>
  );
}
