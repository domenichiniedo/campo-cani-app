import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { Button, Card, ErrorText, Field, H1, Muted, Screen } from '@/components/ui';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';

export default function Login() {
  const c = useColors();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    setErr('');
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setErr(errorText(error));
  }

  return (
    <Screen>
      <H1>Accedi</H1>
      <Muted>Entra con l&apos;email e la password che hai scelto quando ti sei iscritto.</Muted>
      <Card accent>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
        <ErrorText>{err}</ErrorText>
        <Button title="Accedi" onPress={submit} loading={busy} disabled={!email || !password} />
        <Link href="/forgot" style={{ color: c.accent, fontWeight: '700', textAlign: 'center' }}>
          Password dimenticata?
        </Link>
      </Card>
      <Card>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>Prima volta qui?</Text>
        <Muted>Iscriviti con i tuoi dati e quelli del tuo cane per prenotare il campo.</Muted>
        <Button title="Iscriviti" kind="ghost" onPress={() => router.push('/register')} />
      </Card>
    </Screen>
  );
}
