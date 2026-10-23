import { useState } from 'react';

import { Button, Card, ErrorText, Muted } from '@/components/ui';
import { t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

/** Report mensile in Excel: parte da solo l'ultimo venerdì del mese, qui si prova subito. */
export function ReportPanel() {
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function sendNow() {
    setErr('');
    setMsg('');
    setSending(true);
    const { data, error } = await supabase.functions.invoke('report-mensile', { method: 'POST' });
    setSending(false);
    if (!error) return setMsg(t('Report inviato a {email}.', { email: (data?.to ?? []).join(', ') }));
    // Il motivo sta nella risposta della funzione; se non risponde, non è ancora installata.
    const body = await error.context?.json?.().catch(() => null);
    const reason: string = body?.error ?? body?.skipped ?? '';
    if (!reason || reason.includes('RESEND_API_KEY')) return setErr(t("L'invio per email non è ancora collegato: segui i passi nel README."));
    setErr(reason);
  }

  return (
    <Card>
      <Muted>
        {t("L'ultimo venerdì di ogni mese ti arriva per email un Excel con le lezioni, i pacchetti venduti, le fatture e gli scontrini, gli incassi e le statistiche del mese.")}
      </Muted>
      <Button title={t('Mandami ora il report')} kind="ghost" onPress={sendNow} loading={sending} />
      <ErrorText>{err}</ErrorText>
      {!!msg && <Muted>{msg}</Muted>}
    </Card>
  );
}
