import { useState } from 'react';

import { PhotoEditor } from '@/components/photo';
import { Body, Button, Card, ConfirmButton, ErrorText, H1, Muted, Screen } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { fullName } from '@/lib/types';

export default function TrainerProfile() {
  const { profile, myTrainer, lessonTypes, refresh } = useSession();
  const [deleteErr, setDeleteErr] = useState('');

  async function deleteAccount() {
    setDeleteErr('');
    const { error } = await supabase.rpc('delete_my_account');
    if (error) return setDeleteErr(errorText(error));
    // L'utente non esiste più: chiudiamo solo la sessione su questo telefono.
    await supabase.auth.signOut({ scope: 'local' });
  }
  const follows = myTrainer?.lessons.length
    ? myTrainer.lessons.map((id) => lessonTypes.find((t) => t.id === id)?.label ?? id).join(', ')
    : t('tutte le lezioni');
  return (
    <Screen>
      <H1>{t('Profilo')}</H1>
      <Card>
        {myTrainer && (
          <PhotoEditor
            name={myTrainer.name}
            path={myTrainer.photo_path}
            prefix={`trainer-${myTrainer.id}-`}
            save={async (path) => {
              const { error } = await supabase.rpc('set_my_photo', { p_path: path });
              if (error) return errorText(error);
              await refresh();
              return null;
            }}
          />
        )}
        <Body bold>{fullName(profile) || myTrainer?.name}</Body>
        <Muted>{profile?.email}</Muted>
        {myTrainer && <Muted>{t('Trainer {nome} · segui {lezioni}', { nome: myTrainer.name, lezioni: follows })}</Muted>}
      </Card>
      <Muted style={{ fontSize: 13 }}>
        {t("La foto la vedono i clienti nelle loro lezioni e nel diario dei cani. Nome, lezioni che segui e collegamento dell'account li cambia il centro.")}
      </Muted>
      <Button title={t('Esci')} kind="ghost" onPress={() => supabase.auth.signOut()} />
      <ConfirmButton title={t('Cancella il mio account')} onConfirm={deleteAccount} />
      <Muted style={{ fontSize: 13 }}>{t('Il tuo account viene cancellato. La tua scheda da trainer, con nome e foto, resta al centro, che può toglierla.')}</Muted>
      <ErrorText>{deleteErr}</ErrorText>
    </Screen>
  );
}
