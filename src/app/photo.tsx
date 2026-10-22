import { useEffect, useState } from 'react';

import { Avatar, myPhoto, PhotoEditor, takePendingPhoto } from '@/components/photo';
import { Body, Button, Card, ErrorText, H1, Muted, Row, Screen } from '@/components/ui';
import { uploadImage } from '@/lib/images';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';

/** Clienti e trainer entrano con la loro foto: chi non ce l'ha la mette qui. */
export default function Photo() {
  const { profile, myTrainer, refresh } = useSession();
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const me = profile ? myPhoto(profile, myTrainer) : null;

  // Appena iscritto: carica la foto scelta nel modulo d'iscrizione.
  useEffect(() => {
    if (!me) return;
    const picked = takePendingPhoto();
    if (!picked) return;
    Promise.resolve().then(async () => {
      setUploading(true);
      try {
        const path = await uploadImage('foto', me.prefix, picked);
        const { error } = await me.write(path);
        if (error) throw error;
        await refresh();
      } catch (e) {
        setErr(`Non sono riuscito a caricare la foto scelta (${errorText(e)}). Rifalla qui sotto.`);
      }
      setUploading(false);
    });
    // Solo all'apertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!me]);

  if (!me) return null;
  return (
    <Screen>
      <H1>La tua foto</H1>
      <Body>
        {myTrainer
          ? 'I clienti vedono la tua foto nelle loro lezioni e nel diario dei cani: mettine una prima di iniziare.'
          : 'Il centro e i trainer vedono la tua foto per riconoscerti al campo: mettine una prima di prenotare.'}
      </Body>
      <Card accent>
        {uploading ? (
          <Row>
            <Avatar name={me.name} path={null} size={72} />
            <Muted>Carico la foto…</Muted>
          </Row>
        ) : (
          <PhotoEditor
            name={me.name}
            path={me.path}
            prefix={me.prefix}
            save={async (path) => {
              const { error } = await me.write(path);
              if (error) return errorText(error);
              await refresh();
              return null;
            }}
          />
        )}
        <ErrorText>{err}</ErrorText>
        <Muted style={{ fontSize: 13 }}>Puoi cambiarla quando vuoi dal tuo profilo.</Muted>
      </Card>
      <Button title="Esci" kind="ghost" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
