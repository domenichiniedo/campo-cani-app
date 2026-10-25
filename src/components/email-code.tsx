import { useState } from 'react';

import { Button, Card, ErrorText, Field, Muted } from '@/components/ui';
import { t } from '@/lib/i18n';
import { errorText, supabase } from '@/lib/supabase';

/**
 * Codice di conferma dell'email, mandato da Supabase all'iscrizione (se il progetto chiede la conferma).
 * Con il codice giusto arriva la sessione e il layout porta il cliente avanti da solo.
 */
export function EmailCode({ email, onConfirmed }: { email: string; onConfirmed?: (userId: string) => Promise<void> | void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function verify() {
    setErr('');
    setBusy(true);
    const { data, error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'signup' });
    if (error) {
      setBusy(false);
      return setErr(errorText(error));
    }
    if (data.user) await onConfirmed?.(data.user.id);
    setBusy(false);
  }

  async function resend() {
    setErr('');
    setMsg('');
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) return setErr(errorText(error));
    setMsg(t('Codice rimandato.'));
  }

  return (
    <Card accent>
      <Muted>{t("Ti abbiamo mandato un codice a {email}. Scrivilo qui per confermare l'email.", { email })}</Muted>
      <Field label={t('Codice ricevuto')} value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" maxLength={10} />
      <ErrorText>{err}</ErrorText>
      {!!msg && <Muted>{msg}</Muted>}
      <Button title={t("Conferma l'email")} onPress={verify} loading={busy} disabled={code.trim().length < 6} />
      <Button title={t('Rimanda il codice')} kind="ghost" small onPress={resend} />
      <Muted style={{ fontSize: 13 }}>{t('Non lo trovi? Guarda anche nella posta indesiderata.')}</Muted>
    </Card>
  );
}
