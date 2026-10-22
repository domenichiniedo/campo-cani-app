import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme, View } from 'react-native';

import { Body, H1, Muted } from '@/components/ui';
import { SessionProvider, useSession } from '@/lib/session';
import { isConfigured } from '@/lib/supabase';
import { useColors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

function Navigator() {
  const { ready, session, profile, isOwner, needsTerms, needsBilling } = useSession();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  const signedIn = !!session && !!profile;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && needsTerms}>
        <Stack.Screen name="terms" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !needsTerms && needsBilling}>
        <Stack.Screen name="billing" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !needsTerms && !needsBilling && !isOwner}>
        <Stack.Screen name="(client)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && isOwner}>
        <Stack.Screen name="(owner)" />
      </Stack.Protected>
    </Stack>
  );
}

function NotConfigured() {
  const c = useColors();
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);
  return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 12, backgroundColor: c.bg }}>
      <H1>Manca il collegamento</H1>
      <Body>L&apos;app non sa ancora a quale database collegarsi.</Body>
      <Muted>
        Copia il file .env.example in .env.local e inserisci EXPO_PUBLIC_SUPABASE_URL ed EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY del tuo
        progetto Supabase, poi riavvia con npx expo start.
      </Muted>
    </View>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="light" />
      {isConfigured ? (
        <SessionProvider>
          <Navigator />
        </SessionProvider>
      ) : (
        <NotConfigured />
      )}
    </ThemeProvider>
  );
}
