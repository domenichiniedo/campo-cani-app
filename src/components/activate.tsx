import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';

import { Button, Card, ErrorText, Field, H1, LangMenu, Muted, Row } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useLicense } from '@/lib/license-gate';
import { useColors } from '@/lib/theme';

/** Primo avvio dell'app venduta: si apre con il codice di licenza del centro. */
export function Activate({ reason }: { reason: string }) {
  const c = useColors();
  const { activate } = useLicense();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

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
      <Card>
        <Muted>
          {t('Inserisci il codice di attivazione del tuo centro cinofilo. Se sei un cliente, chiedilo al centro: di solito te lo manda come link, e basta aprirlo dal telefono.')}
        </Muted>
        <Field
          label={t('Codice di attivazione')}
          value={code}
          onChangeText={setCode}
          placeholder="CC1...."
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          style={{ minHeight: 90 }}
        />
        <ErrorText>{err || reason}</ErrorText>
        <Button title={t('Attiva')} onPress={submit} loading={busy} disabled={!code.trim()} />
      </Card>
    </ScrollView>
  );
}
