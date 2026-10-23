import { useState } from 'react';
import { Text, View } from 'react-native';

import { OwnerBookingCard } from '@/components/booking-card';
import { Avatar } from '@/components/photo';
import { Badge, Button, Card, Chips, ConfirmButton, ErrorText, Muted, Row } from '@/components/ui';
import { hm } from '@/lib/format';
import { t } from '@/lib/i18n';
import { useLessonColors } from '@/lib/lesson-colors';
import type { OwnerBooking, OwnerClass } from '@/lib/owner';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';

/**
 * Classe di gruppo per il proprietario: ora, lezione, trainer e posti, con la scheda di ogni cane
 * iscritto (ingresso, pagamento e penalità restano per cane).
 */
export function ClassCard({
  cls,
  dogs,
  onChange,
  onAdd,
  showField,
}: {
  cls: OwnerClass;
  dogs: OwnerBooking[];
  onChange: () => void;
  onAdd: () => void;
  showField?: boolean;
}) {
  const c = useColors();
  const color = useLessonColors()(cls.lesson_type);
  const { trainers } = useSession();
  const [trainerOpen, setTrainerOpen] = useState(false);
  const [err, setErr] = useState('');
  const fit = trainers.filter((tr) => !tr.lessons.length || tr.lessons.includes(cls.lesson_type));
  const full = dogs.length >= cls.seats;
  const arrived = dogs.filter((b) => b.checked_in_at).length;

  async function update(patch: Partial<OwnerClass>) {
    setErr('');
    const { error } = await supabase.from('classes').update(patch).eq('id', cls.id);
    if (error) setErr(errorText(error));
    onChange();
  }

  return (
    <Card style={{ borderLeftWidth: 4, borderLeftColor: color.bar }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ color: c.text, fontSize: 20, fontWeight: '800' }}>
          {hm(cls.start_min)}
          <Text style={{ color: c.muted, fontSize: 14, fontWeight: '600' }}> – {hm(cls.start_min + cls.dur_min)}</Text>
        </Text>
        <Row>
          {showField && cls.fields && <Badge>{cls.fields.name}</Badge>}
          <Badge tone={full ? 'warn' : 'ok'}>{t('{n}/{posti} posti', { n: dogs.length, posti: cls.seats })}</Badge>
          {arrived > 0 && <Badge tone="ok">{t('Entrati {n}', { n: arrived })}</Badge>}
        </Row>
      </Row>
      <View style={{ gap: 2 }}>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '800' }}>
          {t('Classe di gruppo: {lezione}', { lezione: cls.lesson_types?.label ?? cls.lesson_type })}
          {cls.lesson_option ? ` · ${cls.lesson_option}` : ''}
        </Text>
        {trainers.length > 0 && (
          <Row>
            {cls.trainers && <Avatar name={cls.trainers.name} path={trainers.find((tr) => tr.id === cls.trainer_id)?.photo_path} size={24} />}
            <Text style={{ color: cls.trainers ? c.accent : c.brassText, fontSize: 14, fontWeight: '700' }}>
              {cls.trainers ? t('Trainer: {nome}', { nome: cls.trainers.name }) : t('Trainer da assegnare')}
            </Text>
          </Row>
        )}
      </View>
      <Row>
        <Button small title={t('+ Iscrivi un cane')} disabled={full} onPress={onAdd} />
        {trainers.length > 0 && (
          <Button small kind="ghost" title={cls.trainers ? t('Cambia trainer') : t('Assegna trainer')} onPress={() => setTrainerOpen(!trainerOpen)} />
        )}
        <ConfirmButton title={t('Annulla classe')} onConfirm={() => update({ status: 'cancelled' })} />
      </Row>
      {trainerOpen && (
        <View style={{ gap: 8 }}>
          {fit.length === 0 && <Muted>{t('Nessun trainer segue questo tipo di lezione. Controlla in Impostazioni.')}</Muted>}
          <Chips
            items={[...fit.map((tr) => ({ value: tr.id, label: tr.name })), { value: '', label: t('Nessuno') }]}
            value={cls.trainer_id ?? ''}
            onChange={async (v) => {
              await update({ trainer_id: v || null });
              setTrainerOpen(false);
            }}
          />
        </View>
      )}
      <ErrorText>{err}</ErrorText>
      {dogs.length === 0 && <Muted>{t('Nessun cane iscritto per ora.')}</Muted>}
      {dogs.map((b) => (
        <OwnerBookingCard key={b.id} b={b} onChange={onChange} inClass />
      ))}
    </Card>
  );
}
