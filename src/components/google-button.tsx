import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Button, ErrorText } from '@/components/ui';
import { googleEnabledOn, googleMode, googleWebClientId, nativeGoogleSignIn, newNonce, signInWithGoogleToken } from '@/lib/google';
import { lang, t } from '@/lib/i18n';

type Gis = {
  accounts: {
    id: {
      initialize: (o: object) => void;
      renderButton: (el: HTMLElement, o: object) => void;
    };
  };
};

let gisScript: Promise<Gis> | null = null;

/** Lo script di Google Identity Services, caricato una volta sola. */
function loadGis() {
  gisScript ??= new Promise<Gis>((resolve, reject) => {
    const g = globalThis as unknown as { google?: Gis };
    if (g.google?.accounts?.id) return resolve(g.google);
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (g.google ? resolve(g.google) : reject(new Error('gsi')));
    s.onerror = () => {
      gisScript = null;
      reject(new Error('gsi'));
    };
    document.head.appendChild(s);
  });
  return gisScript;
}

/**
 * "Continua con Google": compare solo se la build ha il client di Google e il progetto Supabase (url e
 * chiave) ha l'accesso con Google acceso. Dopo l'accesso pensa a tutto la sessione di Supabase.
 */
export function GoogleButton({ client, url, apiKey }: { client: SupabaseClient; url: string; apiKey: string }) {
  const [on, setOn] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    if (googleMode) googleEnabledOn(url, apiKey).then((v) => live && setOn(v));
    return () => {
      live = false;
    };
  }, [url, apiKey]);

  if (!on) return null;
  if (googleMode === 'web') return <GisButton client={client} />;

  async function press() {
    setErr('');
    setBusy(true);
    const e = await nativeGoogleSignIn(client);
    setBusy(false);
    if (e) setErr(e);
  }

  return (
    <View style={{ gap: 8 }}>
      <Button title={t('Continua con Google')} kind="ghost" onPress={press} loading={busy} />
      <ErrorText>{err}</ErrorText>
    </View>
  );
}

/** Nel browser il pulsante lo disegna Google (le sue regole non permettono un pulsante fatto da noi). */
function GisButton({ client }: { client: SupabaseClient }) {
  // In React Native Web il ref di una View è il suo elemento della pagina.
  const box = useRef<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!width) return;
    let live = true;
    (async () => {
      try {
        const [gis, nonce] = await Promise.all([loadGis(), newNonce()]);
        if (!live) return;
        gis.accounts.id.initialize({
          client_id: googleWebClientId,
          nonce: nonce.hashed,
          ux_mode: 'popup',
          use_fedcm_for_button: true,
          callback: async ({ credential }: { credential: string }) => {
            setErr('');
            const e = await signInWithGoogleToken(client, credential, nonce.raw);
            if (e && live) setErr(e);
          },
        });
        if (!box.current) return;
        gis.accounts.id.renderButton(box.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          logo_alignment: 'center',
          locale: lang(),
          width: Math.min(400, Math.max(200, Math.floor(width))),
        });
      } catch {
        if (live) setErr(t('Connessione assente. Controlla internet e riprova.'));
      }
    })();
    return () => {
      live = false;
    };
  }, [client, width]);

  return (
    <View style={{ gap: 8 }}>
      <View
        ref={box as never}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          // Si ridisegna solo se cambia davvero (rotazione dello schermo, finestra più stretta).
          if (Math.abs(w - width) > 20) setWidth(w);
        }}
        style={{ minHeight: 44, alignItems: 'center' }}
      />
      <ErrorText>{err}</ErrorText>
    </View>
  );
}
