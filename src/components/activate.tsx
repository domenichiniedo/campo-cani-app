import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';

import { RegisterCentre, registrationPending } from '@/components/register-centre';
import { BlockedDues } from '@/components/subscription-panel';
import { Body, Button, Card, ErrorText, Field, H1, LangMenu, Muted, Row } from '@/components/ui';
import { gestoreEnabled } from '@/lib/gestore';
import { t } from '@/lib/i18n';
import { storedCentre, useLicense } from '@/lib/license-gate';
import { useColors } from '@/lib/theme';

/** Primo avvio dell'app venduta: si apre con il codice di licenza del centro. */
export function Activate({ reason }: { reason: string }) {
  const c = useColors();
  const { activate } = useLicense();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [registering, setRegistering] = useState(() => gestoreEnabled && registrationPending());

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  async function submit() {
    setBusy(true);
    setErr('');
    const e = await activate(code);
    setBusy(false);
    if (e) setErr(e);
  }

  return (
    // Qui non c'è ancora un centro collegato: niente intestazione con nome e logo.
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 20, paddingTop: 64, gap: 16, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <H1>{t("Attiva l'app")}</H1>
        <LangMenu onLight />
      </Row>
      {registering ? (
        <RegisterCentre onBack={() => setRegistering(false)} />
      ) : (
        <>
          {!!reason && <BlockedDues code={storedCentre()} />}
          <Card>
            <Muted>
              {gestoreEnabled
                ? t("Inserisci il codice del tuo centro cinofilo (K9-...). Se sei un cliente o un trainer, chiedilo al centro: di solito te lo manda come link, e basta aprirlo dal telefono.")
                : t('Inserisci il codice di attivazione del tuo centro cinofilo. Se sei un cliente, chiedilo al centro: di solito te lo manda come link, e basta aprirlo dal telefono.')}
            </Muted>
            <Field
              label={gestoreEnabled ? t('Codice del centro') : t('Codice di attivazione')}
              value={code}
              onChangeText={setCode}
              placeholder={gestoreEnabled ? 'K9-XXXXXX' : 'CC1....'}
              autoCapitalize={gestoreEnabled ? 'characters' : 'none'}
              autoCorrect={false}
              multiline={!gestoreEnabled}
              style={gestoreEnabled ? undefined : { minHeight: 90 }}
            />
            <ErrorText>{err || reason}</ErrorText>
            <Button title={t('Attiva')} onPress={submit} loading={busy} disabled={!code.trim()} />
          </Card>
          {gestoreEnabled && (
            <Card>
              <Body bold>{t('Hai un centro cinofilo?')}</Body>
              <Muted>{t('Registralo in pochi minuti: prepariamo noi il database del centro e ti diamo il codice per i tuoi clienti.')}</Muted>
              <Button kind="ghost" title={t('Registra il tuo centro')} onPress={() => setRegistering(true)} />
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}
