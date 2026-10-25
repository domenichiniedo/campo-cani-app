import { useState } from 'react';

import { nexiTestNote } from '@/components/card-pay';
import { Badge, Body, ErrorText, Muted, Row, Toggle } from '@/components/ui';
import { t } from '@/lib/i18n';
import { nexiReady } from '@/lib/nexi';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';

/** Pagamento con carta tramite Nexi: il proprietario lo accende e lo spegne. Per ora solo in prova. */
export function NexiPanel() {
  const { settings, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const on = !!settings?.online_payments;

  async function toggle(v: boolean) {
    setErr('');
    setBusy(true);
    try {
      // Prima di accenderlo si controlla che la funzione nexi sia installata nel database del centro.
      if (v) await nexiReady();
      const { error } = await supabase.from('settings').update({ online_payments: v }).eq('id', 1);
      if (error) throw new Error(errorText(error));
      await refresh();
    } catch (e) {
      setErr(
        v
          ? t('Il pagamento con carta non è ancora installato nel database del centro (funzione "nexi", vedi README).')
          : (e as Error).message,
      );
    }
    setBusy(false);
  }

  return (
    <>
      <Row style={{ justifyContent: 'space-between' }}>
        <Body bold>{t('Carta con Nexi')}</Body>
        <Badge tone="warn">{t('Prova')}</Badge>
      </Row>
      <Muted style={{ fontSize: 13 }}>
        {t('Il cliente sceglie "Carta (Nexi)" quando prenota e paga sulla pagina sicura di Nexi: la lezione risulta pagata da sola. Se disdice in tempo, il rimborso torna sulla sua carta.')}
      </Muted>
      <Muted style={{ fontSize: 13 }}>{nexiTestNote()}</Muted>
      <Toggle label={t('I clienti possono pagare con carta')} value={on} onChange={toggle} disabled={busy} />
      <ErrorText>{err}</ErrorText>
    </>
  );
}
