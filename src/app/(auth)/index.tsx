import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { EmailCode } from '@/components/email-code';
import { Button, Card, ErrorText, Field, H1, Muted, Screen } from '@/components/ui';
import { ownerOnly } from '@/lib/edition';
import { t } from '@/lib/i18n';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';

export default function Login() {
  const c = useColors();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Iscritto che non ha ancora messo il codice dell'email: gliene mandiamo uno nuovo.
  const [confirm, setConfirm] = useState(false);

  async function submit() {
    setErr('');
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error && /Email not confirmed/i.test(error.message)) {
      await supabase.auth.resend({ type: 'signup', email: email.trim() });
      setConfirm(true);
      return;
    }
    if (error) setErr(errorText(error));
  }

  if (confirm) {
    return (
      <Screen>
        <H1>{t("Conferma l'email")}</H1>
        <EmailCode email={email.trim()} />
        <Button title={t("Torna all'accesso")} kind="ghost" onPress={() => setConfirm(false)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <H1>{t('Accedi')}</H1>
      <Muted>
        {ownerOnly
          ? t("Programma del proprietario: entra con l'email e la password del tuo account da proprietario.")
          : t("Entra con l'email e la password che hai scelto quando ti sei iscritto.")}
      </Muted>
      <Card accent>
        <Field label={t('Email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field label={t('Password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
        <ErrorText>{err}</ErrorText>
        <Button title={t('Accedi')} onPress={submit} loading={busy} disabled={!email || !password} />
        <Link href="/forgot" style={{ color: c.accent, fontWeight: '700', textAlign: 'center' }}>
          {t('Password dimenticata?')}
        </Link>
      </Card>
      {!ownerOnly && (
        <Card>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{t('Prima volta qui?')}</Text>
          <Muted>{t('Iscriviti con i tuoi dati e quelli del tuo cane per prenotare il campo.')}</Muted>
          <Button title={t('Iscriviti')} kind="ghost" onPress={() => router.push('/register')} />
        </Card>
      )}
    </Screen>
  );
}
