import { router } from 'expo-router';
import { useState } from 'react';

import { Button, Card, ErrorText, Field, H1, Muted, Screen } from '@/components/ui';
import { t } from '@/lib/i18n';
import { errorText, supabase } from '@/lib/supabase';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function sendCode() {
    setErr('');
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setBusy(false);
    if (error) return setErr(errorText(error));
    setSent(true);
  }

  async function reset() {
    setErr('');
    if (password.length < 8) return setErr(t('La password deve avere almeno 8 caratteri.'));
    setBusy(true);
    const v = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' });
    if (v.error) {
      setBusy(false);
      return setErr(errorText(v.error));
    }
    const u = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (u.error) return setErr(errorText(u.error));
    // La sessione è già attiva: il layout porta il cliente alla sua schermata.
  }

  return (
    <Screen>
      <H1>{t('Nuova password')}</H1>
      {!sent ? (
        <Card accent>
          <Muted>{t("Scrivi l'email del tuo account: ti mandiamo un codice per scegliere una nuova password.")}</Muted>
          <Field label={t('Email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <ErrorText>{err}</ErrorText>
          <Button title={t('Mandami il codice')} onPress={sendCode} loading={busy} disabled={!email} />
        </Card>
      ) : (
        <Card accent>
          <Muted>{t('Abbiamo mandato un codice a {email}. Inseriscilo qui con la nuova password.', { email: email.trim() })}</Muted>
          <Field label={t('Codice ricevuto')} value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" />
          <Field label={t('Nuova password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
          <ErrorText>{err}</ErrorText>
          <Button title={t('Salva la password')} onPress={reset} loading={busy} disabled={!code || !password} />
          <Button title={t('Rimanda il codice')} kind="ghost" small onPress={sendCode} />
        </Card>
      )}
      <Button title={t("Torna all'accesso")} kind="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
