import { useState } from 'react';

import { Button, Card, Chips, ErrorText, Field, Muted, Row, Toggle } from '@/components/ui';
import { t } from '@/lib/i18n';
import { periodLabel, useMembershipSettings } from '@/lib/membership';
import { usePlan } from '@/lib/plans';
import { errorText, supabase } from '@/lib/supabase';
import type { MembershipSettings } from '@/lib/types';

const euroField = (cents: number) => (cents / 100).toString().replace('.', ',');

/** La tessera del centro: accesa o spenta, nome, quota, durata e se serve per prenotare. Si salva a parte. */
export function MembershipEditor() {
  const { cfg, reload } = useMembershipSettings();
  // Il database del centro non ha ancora il tesseramento (migrazione 0025 non eseguita).
  if (!cfg) return <Muted>{t("Il tesseramento arriva con l'aggiornamento del database del centro.")}</Muted>;
  return <MembershipForm cfg={cfg} onSaved={reload} />;
}

function MembershipForm({ cfg, onSaved }: { cfg: MembershipSettings; onSaved: () => PromiseLike<unknown> }) {
  const [enabled, setEnabled] = useState(cfg.enabled);
  const [name, setName] = useState(cfg.name);
  const [price, setPrice] = useState(euroField(cfg.price_cents));
  const [period, setPeriod] = useState<MembershipSettings['period']>(cfg.period);
  const [required, setRequired] = useState(cfg.required);
  const [vat, setVat] = useState(cfg.vat ?? false);
  const plan = usePlan();
  const [renewDays, setRenewDays] = useState(String(cfg.renew_days));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function save() {
    setErr('');
    setMsg('');
    const cents = Math.round(Number(price.replace(',', '.')) * 100);
    const days = Number(renewDays);
    if (!name.trim()) return setErr(t('Dai un nome alla tessera.'));
    if (!Number.isFinite(cents) || cents < 0) return setErr(t('Quota della tessera non valida.'));
    if (!Number.isInteger(days) || days < 0 || days > 120) return setErr(t('I giorni per il rinnovo vanno da 0 a 120.'));
    setSaving(true);
    const { error } = await supabase
      .from('membership_settings')
      .update({ enabled, name: name.trim(), price_cents: cents, period, required: enabled && required, renew_days: days, vat })
      .eq('id', 1);
    setSaving(false);
    if (error) return setErr(errorText(error));
    await onSaved();
    setMsg(t('Tessera salvata.'));
  }

  return (
    <Card>
      <Muted>
        {t("Il cliente chiede la tessera o il rinnovo dal Profilo e la paga al campo o con bonifico. Tu la segni pagata da Clienti, dove vedi anche chi l'ha scaduta e lo storico di ognuno.")}
      </Muted>
      <Toggle label={t('Usa la tessera')} value={enabled} onChange={setEnabled} />
      {enabled && (
        <>
          <Row>
            <Field label={t('Nome')} value={name} onChangeText={setName} placeholder={t('Tessera associativa')} style={{ flex: 2, minWidth: 180 }} />
            <Field label={t('Quota (€)')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" style={{ flex: 1, minWidth: 90 }} />
          </Row>
          <Muted style={{ fontSize: 13 }}>{t('Durata')}</Muted>
          <Chips
            items={[
              { value: 'anno' as const, label: t('Anno solare') },
              { value: 'stagione' as const, label: t('Stagione sportiva') },
              { value: 'mesi' as const, label: t('12 mesi') },
            ]}
            value={period}
            onChange={setPeriod}
          />
          <Muted style={{ fontSize: 13 }}>{periodLabel(period)}</Muted>
          <Field
            label={t('Rinnovo possibile da quanti giorni prima della scadenza')}
            value={renewDays}
            onChangeText={setRenewDays}
            keyboardType="number-pad"
            style={{ maxWidth: 320 }}
          />
          <Muted style={{ fontSize: 13 }}>{t('IVA')}</Muted>
          <Chips
            items={[
              { value: 'no' as const, label: t('Senza IVA') },
              { value: 'si' as const, label: t('Con IVA') },
            ]}
            value={vat ? 'si' : 'no'}
            onChange={(v) => setVat(v === 'si')}
          />
          <Muted style={{ fontSize: 13 }}>
            {!vat
              ? t("Quota associativa fuori campo IVA (per esempio di un'ASD): all'incasso non parte né fattura né scontrino.")
              : plan.invoices
                ? t("All'incasso parte la fattura o lo scontrino, con l'IVA delle tue impostazioni delle fatture, come per i pacchetti.")
                : t('La quota ha l\'IVA: fattura o scontrino li fai tu, come per le lezioni.')}
          </Muted>
          <Toggle label={t('Senza tessera valida il cliente non prenota')} value={required} onChange={setRequired} />
          <Muted style={{ fontSize: 13 }}>
            {required
              ? t('Il cliente deve avere la tessera valida il giorno della lezione. Tu puoi sempre prenotare per lui.')
              : t('La tessera non blocca le prenotazioni: in Clienti vedi chi deve rinnovarla.')}
          </Muted>
        </>
      )}
      <ErrorText>{err}</ErrorText>
      {!!msg && <Muted>{msg}</Muted>}
      <Button title={t('Salva la tessera')} onPress={save} loading={saving} />
    </Card>
  );
}
