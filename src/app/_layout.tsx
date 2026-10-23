import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme, View } from 'react-native';

import { Body, Button, H1, Muted } from '@/components/ui';
import { t, useLang } from '@/lib/i18n';
import { SessionProvider, useSession } from '@/lib/session';
import { Activate } from '@/components/activate';
import { ownerOnly } from '@/lib/edition';
import { licensingEnabled } from '@/lib/license';
import { LicenseGate } from '@/lib/license-gate';
import { planWith, usePlan } from '@/lib/plans';
import { hasEnvConfig, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import { trialEndText, useTrialOver } from '@/lib/trial';

SplashScreen.preventAutoHideAsync();

function Navigator() {
  const { ready, session, profile, isOwner, isTrainer, needsTerms, needsBilling } = useSession();
  const plan = usePlan();
  // Cambiando lingua tutte le schermate si ridisegnano.
  const l = useLang();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // Il programma per computer si apre solo con una licenza del piano che lo comprende.
  if (ownerOnly && !plan.desktop)
    return <Activate reason={t("Il programma per computer è compreso nel piano {piano}, la tua licenza è del piano {tuo}. Inserisci un codice {piano}, oppure usa l'app sul telefono.", { piano: planWith('desktop'), tuo: plan.label })} />;
  if (!ready) return null;
  const signedIn = !!session && !!profile;
  if (ownerOnly && signedIn && !isOwner) return <OwnerOnly />;

  return (
    <Stack key={l} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="attiva" />
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && needsTerms}>
        <Stack.Screen name="terms" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !needsTerms && needsBilling}>
        <Stack.Screen name="billing" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !needsTerms && !needsBilling && !isOwner && !isTrainer}>
        <Stack.Screen name="(client)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && isTrainer}>
        <Stack.Screen name="(trainer)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && isOwner}>
        <Stack.Screen name="(owner)" />
      </Stack.Protected>
    </Stack>
  );
}

/** Un cliente ha fatto l'accesso nel programma del proprietario. */
function OwnerOnly() {
  const c = useColors();
  return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 12, backgroundColor: c.bg }}>
      <H1>{t('Solo per il proprietario')}</H1>
      <Body>{t("Questo programma serve a gestire il campo. Per prenotare, o per le lezioni da trainer, usa l'app sul telefono.")}</Body>
      <Button title={t('Esci')} onPress={() => supabase.auth.signOut()} />
    </View>
  );
}

/** La versione di prova è scaduta: i dati restano nel database, l'app non si apre più. */
function TrialOver() {
  const c = useColors();
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);
  return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 12, backgroundColor: c.bg }}>
      <H1>{t('La prova è finita')}</H1>
      <Body>{t('La prova di K9 Manager era valida fino al {data}.', { data: trialEndText })}</Body>
      <Muted>{t("I dati inseriti restano salvati. Per continuare a usare l'app contatta chi ti ha dato la prova.")}</Muted>
    </View>
  );
}

function NotConfigured() {
  const c = useColors();
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);
  return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 12, backgroundColor: c.bg }}>
      <H1>{t('Manca il collegamento')}</H1>
      <Body>{t("L'app non sa ancora a quale database collegarsi.")}</Body>
      <Muted>
        {ownerOnly
          ? t('Su GitHub, in Settings → Secrets and variables → Actions → Variables, inserisci EXPO_PUBLIC_SUPABASE_URL ed EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY del tuo progetto Supabase, poi ricostruisci il programma (Actions → App per Windows o App per Mac → Run workflow).')
          : t('Copia il file .env.example in .env.local e inserisci EXPO_PUBLIC_SUPABASE_URL ed EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY del tuo progetto Supabase, poi riavvia con npx expo start.')}
      </Muted>
    </View>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const trialOver = useTrialOver();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="light" />
      {trialOver ? (
        <TrialOver />
      ) : licensingEnabled || hasEnvConfig ? (
        <LicenseGate activation={(reason) => <Activate reason={reason} />}>
          <SessionProvider>
            <Navigator />
          </SessionProvider>
        </LicenseGate>
      ) : (
        <NotConfigured />
      )}
    </ThemeProvider>
  );
}
