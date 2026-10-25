import { useState } from 'react';

import { Body, Button, Card, ErrorText, Field, H1, Muted, Screen } from '@/components/ui';
import { t } from '@/lib/i18n';
import { toE164 } from '@/lib/phone';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';

/** Il cliente appena iscritto conferma il cellulare con il codice ricevuto per SMS (se il centro lo chiede). */
export default function Phone() {
  const { profile, refresh } = useSession();
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function send() {
    setErr('');
    const e164 = toE164(phone);
    if (!e164) return setErr(t('Il numero di cellulare non è valido. Scrivilo con il prefisso, per esempio +39 333 1234567.'));
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ phone: e164 });
    setBusy(false);
    if (error) return setErr(errorText(error));
    setSentTo(e164);
  }

  async function verify() {
    if (!sentTo) return;
    setErr('');
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ phone: sentTo, token: code.trim(), type: 'phone_change' });
    if (error) {
      setBusy(false);
      return setErr(errorText(error));
    }
    // Il database segna il cellulare come confermato: col profilo aggiornato il layout porta avanti.
    await refresh();
    setBusy(false);
  }

  return (
    <Screen>
      <H1>{t('Conferma il cellulare')}</H1>
      <Body>{t('Il centro chiede di confermare il numero di cellulare: ti mandiamo un codice per SMS.')}</Body>
      {!sentTo ? (
        <Card accent>
          <Field label={t('Cellulare')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
          <ErrorText>{err}</ErrorText>
          <Button title={t('Mandami il codice')} onPress={send} loading={busy} disabled={!phone.trim()} />
        </Card>
      ) : (
        <Card accent>
          <Muted>{t('Abbiamo mandato un SMS a {numero}. Scrivi qui il codice.', { numero: sentTo })}</Muted>
          <Field label={t('Codice ricevuto')} value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" maxLength={10} />
          <ErrorText>{err}</ErrorText>
          <Button title={t('Conferma il cellulare')} onPress={verify} loading={busy} disabled={code.trim().length < 4} />
          <Button title={t('Rimanda il codice')} kind="ghost" small onPress={send} />
          <Button title={t('Cambia numero')} kind="ghost" small onPress={() => { setSentTo(null); setCode(''); }} />
        </Card>
      )}
      <Button title={t('Esci')} kind="ghost" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
