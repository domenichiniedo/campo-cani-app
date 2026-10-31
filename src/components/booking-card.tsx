import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Avatar } from '@/components/photo';
import { Badge, Body, Button, Card, Chips, ConfirmButton, ErrorText, Muted, Row } from '@/components/ui';
import { euro, hm, timeOf } from '@/lib/format';
import { t } from '@/lib/i18n';
import type { OwnerBooking } from '@/lib/owner';
import { refundCard } from '@/lib/nexi';
import { usePlan } from '@/lib/plans';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import { transferRef } from '@/lib/transfer';
import { fullName, PENALTY_REASONS } from '@/lib/types';

type HeadBooking = Omit<OwnerBooking, 'trainers' | 'penalties'>;

/**
 * Ora, campo, cane, lezione e cliente di una prenotazione: la parte uguale per proprietario e trainer.
 * Dentro una classe di gruppo ora e lezione sono quelle della classe e non si ripetono. Sotto il cliente va `children`.
 */
export function BookingHead({ b, inClass, showField, badges, children }: { b: HeadBooking; inClass?: boolean; showField?: boolean; badges?: ReactNode; children?: ReactNode }) {
  const c = useColors();
  // Sesso, sterilizzazione e la nota del cliente su obiettivi e situazione: servono al trainer prima della lezione.
  const facts = [
    b.dogs?.sex === 'M' ? t('maschio') : b.dogs?.sex === 'F' ? t('femmina') : '',
    b.dogs?.neutered === true ? t('sterilizzato') : b.dogs?.neutered === false ? t('non sterilizzato') : '',
  ].filter(Boolean);
  const dog = (
    <View style={{ gap: 2 }}>
      <Body bold>
        {b.dogs?.name}
        {b.dogs?.breed ? ` (${b.dogs.breed})` : ''}
        {facts.length ? ` · ${facts.join(', ')}` : ''}
      </Body>
      {!!b.dogs?.goals && <Muted style={{ fontSize: 13 }}>{t('Obiettivi: {nota}', { nota: b.dogs.goals })}</Muted>}
    </View>
  );
  return (
    <>
      <Row style={{ justifyContent: 'space-between' }}>
        {inClass ? (
          dog
        ) : (
          <Text style={{ color: c.text, fontSize: 20, fontWeight: '800' }}>
            {hm(b.start_min)}
            <Text style={{ color: c.muted, fontSize: 14, fontWeight: '600' }}> – {hm(b.start_min + b.dur_min)}</Text>
          </Text>
        )}
        <Row>
          {showField && !inClass && b.fields && <Badge>{b.fields.name}</Badge>}
          {!!b.checked_in_at && <Badge tone="ok">{t('Entrato {ora}', { ora: timeOf(b.checked_in_at) })}</Badge>}
          {b.dogs?.blocked && <Badge tone="bad">{t('Sospeso')}</Badge>}
          {badges}
        </Row>
      </Row>
      <View style={{ gap: 2 }}>
        {!inClass && (
          <>
            {dog}
            <Muted>
              {b.lesson_types?.label ?? b.lesson_type}
              {b.lesson_option ? ` · ${b.lesson_option}` : ''}
            </Muted>
          </>
        )}
        <Row>
          <Avatar name={fullName(b.profiles)} path={b.profiles?.photo_path} size={24} />
          <Muted>
            {fullName(b.profiles)} · {b.profiles?.phone}
          </Muted>
        </Row>
        {children}
      </View>
    </>
  );
}

/**
 * Scheda di una prenotazione per il proprietario: ingresso, pagamento, penalità, annullo.
 * Dentro una classe di gruppo ora, lezione e trainer sono quelli della classe e non si ripetono.
 */
export function OwnerBookingCard({
  b,
  onChange,
  showField,
  inClass,
}: {
  b: OwnerBooking;
  onChange: () => void;
  showField?: boolean;
  inClass?: boolean;
}) {
  const c = useColors();
  const { trainers, lessonTypes } = useSession();
  const plan = usePlan();
  // Campo libero: niente trainer da assegnare.
  const free = !!lessonTypes.find((lt) => lt.id === b.lesson_type)?.free_field;
  const withTrainer = trainers.length > 0 && !inClass && !free;
  const [trainerOpen, setTrainerOpen] = useState(false);
  // Solo i trainer che seguono questo tipo di lezione (lista vuota = tutti).
  const fit = trainers.filter((t) => !t.lessons.length || t.lessons.includes(b.lesson_type));
  const [busy, setBusy] = useState(false);
  const [penaltyOpen, setPenaltyOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [err, setErr] = useState('');

  async function run(fn: () => PromiseLike<{ error: unknown }>) {
    setErr('');
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) setErr(errorText(error));
    onChange();
  }

  const arrived = !!b.checked_in_at;
  const penalized = b.penalties.length > 0;

  return (
    <Card style={arrived ? { borderLeftWidth: 4, borderLeftColor: c.accent } : undefined}>
      <BookingHead b={b} inClass={inClass} showField={showField} badges={penalized && <Badge tone="bad">{t('Penalità')}</Badge>}>
        {free && <Muted style={{ fontSize: 14, fontWeight: '700' }}>{t('Campo libero, senza trainer')}</Muted>}
        {withTrainer && (
          <Row>
            {b.trainers && <Avatar name={b.trainers.name} path={trainers.find((t) => t.id === b.trainer_id)?.photo_path} size={24} />}
            <Text style={{ color: b.trainers ? c.accent : c.brassText, fontSize: 14, fontWeight: '700' }}>
              {b.trainers ? t('Trainer: {nome}', { nome: b.trainers.name }) : t('Trainer da assegnare')}
            </Text>
          </Row>
        )}
        {!!b.note && <Body style={{ fontSize: 14 }}>{t('Nota del cliente: {nota}', { nota: b.note })}</Body>}
        {b.pay === 'transfer' && (
          <Muted style={{ fontSize: 13 }}>
            {b.paid
              ? t('Pagata con bonifico (causale {codice})', { codice: transferRef(b) })
              : t('Bonifico istantaneo da controllare: cerca la causale {codice}', { codice: transferRef(b) })}
          </Muted>
        )}
      </BookingHead>
      <Row>
        <Button
          small
          kind={arrived ? 'ghost' : 'primary'}
          title={arrived ? t('Annulla ingresso') : t('Ingresso')}
          loading={busy}
          onPress={() =>
            run(() => supabase.from('bookings').update({ checked_in_at: arrived ? null : new Date().toISOString() }).eq('id', b.id))
          }
        />
        {b.pay === 'package' ? (
          <Badge tone="ok">{t('Dal pacchetto')}</Badge>
        ) : b.pay === 'online' ? (
          // Con la carta lo segna pagato Nexi, non il proprietario.
          <Badge tone={b.paid ? 'ok' : 'warn'}>{b.paid ? t('Pagato con carta {prezzo} ✓', { prezzo: euro(b.price_cents) }) : t('Carta da pagare {prezzo}', { prezzo: euro(b.price_cents) })}</Badge>
        ) : (
          // Il bonifico si segna come pagato con ogni piano: solo il proprietario vede l'accredito.
          (plan.payments || b.pay === 'transfer') && (
            <Button
              small
              kind="ghost"
              title={b.paid ? t('Pagato {prezzo} ✓', { prezzo: euro(b.price_cents) }) : t('Incassa {prezzo}', { prezzo: euro(b.price_cents) })}
              onPress={() => run(() => supabase.from('bookings').update({ paid: !b.paid }).eq('id', b.id))}
            />
          )
        )}
        {withTrainer && (
          <Button small kind="ghost" title={b.trainers ? t('Cambia trainer') : t('Assegna trainer')} onPress={() => setTrainerOpen(!trainerOpen)} />
        )}
        <Button small kind="ghost" title={t('Penalità')} onPress={() => setPenaltyOpen(!penaltyOpen)} />
        <ConfirmButton
          title={inClass ? t('Togli dalla classe') : t('Annulla lezione')}
          onConfirm={() =>
            run(async () => {
              const r = await supabase.from('bookings').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', b.id);
              // Pagata con carta: il rimborso torna sulla carta del cliente.
              if (!r.error && b.pay === 'online' && b.paid) await refundCard(b.id).catch((e: Error) => setErr(e.message));
              return r;
            })
          }
        />
      </Row>
      {trainerOpen && (
        <View style={{ gap: 8 }}>
          {fit.length === 0 && <Muted>{t('Nessun trainer segue questo tipo di lezione. Controlla in Impostazioni.')}</Muted>}
          <Chips
            items={[...fit.map((t) => ({ value: t.id, label: t.name })), { value: '', label: t('Nessuno') }]}
            value={b.trainer_id ?? ''}
            onChange={async (v) => {
              await run(() => supabase.from('bookings').update({ trainer_id: v || null }).eq('id', b.id));
              setTrainerOpen(false);
            }}
          />
        </View>
      )}
      {penaltyOpen && (
        <View style={{ gap: 8 }}>
          <Chips items={PENALTY_REASONS.map((r) => ({ value: r, label: t(r) }))} value={reason} onChange={setReason} />
          <Button
            small
            kind="danger"
            title={t('Dai penalità')}
            disabled={!reason}
            onPress={async () => {
              await run(() => supabase.from('penalties').insert({ dog_id: b.dog_id, booking_id: b.id, reason }));
              setPenaltyOpen(false);
              setReason(null);
            }}
          />
        </View>
      )}
      <ErrorText>{err}</ErrorText>
    </Card>
  );
}
