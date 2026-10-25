import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { Button, ErrorText, Field, Muted, Row } from '@/components/ui';
import { t } from '@/lib/i18n';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import type { LessonRating } from '@/lib/types';

/** Voto in stelline: piene fino al voto, vuote dopo. */
export function Stars({ score, size = 16 }: { score: number; size?: number }) {
  const c = useColors();
  const n = Math.round(score);
  return <Text style={{ color: c.brass, fontSize: size, letterSpacing: 1 }}>{'★'.repeat(n) + '☆'.repeat(5 - n)}</Text>;
}

/** Il cliente dà un voto da 1 a 5 alla lezione fatta, con un commento facoltativo; può cambiarlo dopo. */
export function RateLesson({ booking, rating, onSaved }: { booking: string; rating: Pick<LessonRating, 'score' | 'comment'> | null; onSaved: () => void }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState(rating?.score ?? 0);
  const [comment, setComment] = useState(rating?.comment ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (rating && !open) {
    return (
      <>
        <Row>
          <Stars score={rating.score} />
          <Muted style={{ fontSize: 13 }}>{t('Il tuo voto')}</Muted>
          <Button small kind="ghost" title={t('Cambia')} onPress={() => setOpen(true)} />
        </Row>
        {!!rating.comment && <Muted style={{ fontSize: 13 }}>{t('Il tuo commento: {commento}', { commento: rating.comment })}</Muted>}
      </>
    );
  }

  return (
    <>
      <Muted style={{ fontSize: 13 }}>{t("Com'è andata la lezione?")}</Muted>
      <Row style={{ gap: 4 }}>
        {[1, 2, 3, 4, 5].map((v) => (
          <Pressable
            key={v}
            accessibilityRole="button"
            accessibilityLabel={t('{n} su 5', { n: v })}
            onPress={() => {
              setScore(v);
              setOpen(true);
            }}
            hitSlop={4}>
            <Text style={{ color: v <= score ? c.brass : c.lineStrong, fontSize: 30 }}>{v <= score ? '★' : '☆'}</Text>
          </Pressable>
        ))}
      </Row>
      {open && (
        <>
          <Field label={t('Commento (se vuoi)')} value={comment} onChangeText={setComment} maxLength={500} multiline />
          <Row>
            <Button
              small
              title={t('Invia il voto')}
              disabled={!score}
              loading={busy}
              onPress={async () => {
                setErr('');
                setBusy(true);
                const { error } = await supabase.rpc('rate_lesson', { p_booking: booking, p_score: score, p_comment: comment.trim() });
                setBusy(false);
                if (error) return setErr(errorText(error));
                setOpen(false);
                onSaved();
              }}
            />
            {rating && (
              <Button
                small
                kind="ghost"
                title={t('Annulla')}
                onPress={() => {
                  setScore(rating.score);
                  setComment(rating.comment);
                  setOpen(false);
                }}
              />
            )}
          </Row>
        </>
      )}
      <ErrorText>{err}</ErrorText>
    </>
  );
}
