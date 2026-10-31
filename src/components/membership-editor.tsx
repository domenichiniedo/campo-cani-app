import { useState } from 'react';

import { Button, Card, Chips, ErrorText, Field, Muted, Row, Toggle } from '@/components/ui';
import { t } from '@/lib/i18n';
import { periodLabel, useMembershipSettings, type MembershipKind } from '@/lib/membership';
import { usePlan } from '@/lib/plans';
import { errorText, supabase } from '@/lib/supabase';
import type { MembershipSettings } from '@/lib/types';

const euroField = (cents: number) => (cents / 100).toString().replace('.', ',');

/** La tessera o la quota campo del centro: accesa o spenta, nome, importo, durata, IVA e se serve per prenotare. */
export function MembershipEditor({ kind }: { kind: MembershipKind }) {
  const { all, reload } = useMembershipSettings();
  const cfg = all?.find((x) => x.kind === kind);
  if (!all) return null;
  // Il database del centro non ha ancora le quote (migrazione 0025 non eseguita).
  if (!cfg) return <Muted>{t("Arriva con l'aggiornamento del database del centro.")}</Muted>;
  return <MembershipForm cfg={cfg} onSaved={reload} />;
}

function MembershipForm({ cfg, onSaved }: { cfg: MembershipSettings; onSaved: () => PromiseLike<unknown> }) {
  const plan = usePlan();
  const [enabled, setEnabled] = useState(cfg.enabled);
  const [name, setName] = useState(cfg.name);
  const [price, setPrice] = useState(euroField(cfg.price_cents));
  const [period, setPeriod] = useState<MembershipSettings['period']>(cfg.period);
  const [months, setMonths] = useState(String(cfg.months));
  const [required, setRequired] = useState(cfg.required);
  const [vat, setVat] = useState(cfg.vat);
  const [renewDays, setRenewDays] = useState(String(cfg.renew_days));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const tessera = cfg.kind === 'tessera';

  async function save() {
    setErr('');
    setMsg('');
    const cents = Math.round(Number(price.replace(',', '.')) * 100);
    const days = Number(renewDays);
    const m = Number(months);
    if (!name.trim()) return setErr(t('Dai un nome.'));
    if (!Number.isFinite(cents) || cents < 0) return setErr(t('Importo non valido.'));
    if (period === 'mesi' && (!Number.isInteger(m) || m < 1 || m > 24)) return setErr(t('I mesi vanno da 1 a 24.'));
    if (!Number.isInteger(days) || days < 0 || days > 120) return setErr(t('I giorni per il rinnovo vanno da 0 a 120.'));
    setSaving(true);
    const { error } = await supabase
      .from('membership_settings')
      .update({ enabled, name: name.trim(), price_cents: cents, period, months: period === 'mesi' ? m : cfg.months, required: enabled && required, renew_days: days, vat })
      .eq('kind', cfg.kind);
    setSaving(false);
    if (error) return setErr(errorText(error));
    await onSaved();
    setMsg(t('Salvato.'));
  }

  return (
    <Card>
      <Muted>
        {tessera
          ? t("La tessera del centro, per esempio quella associativa. Il cliente la chiede o la rinnova dal Profilo e la paga al campo o con bonifico. Tu la segni pagata da Clienti, dove vedi anche chi l'ha scaduta e lo storico di ognuno.")
          : t("La quota per frequentare il campo, per esempio mensile. Il cliente la chiede o la rinnova dal Profilo e la paga al campo o con bonifico. Tu la segni pagata da Clienti, dove vedi anche chi l'ha scaduta e lo storico di ognuno.")}
      </Muted>
      <Toggle label={tessera ? t('Usa la tessera') : t('Usa la quota campo')} value={enabled} onChange={setEnabled} />
      {enabled && (
        <>
          <Row>
            <Field label={t('Nome')} value={name} onChangeText={setName} placeholder={tessera ? t('Tessera associativa') : t('Quota campo')} style={{ flex: 2, minWidth: 180 }} />
            <Field label={t('Importo (€)')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" style={{ flex: 1, minWidth: 90 }} />
          </Row>
          <Muted style={{ fontSize: 13 }}>{t('Durata')}</Muted>
          <Chips
            items={[
              { value: 'anno' as const, label: t('Anno solare') },
              { value: 'stagione' as const, label: t('Stagione sportiva') },
              { value: 'mesi' as const, label: t('Mesi dal pagamento') },
            ]}
            value={period}
            onChange={setPeriod}
          />
          {period === 'mesi' && <Field label={t('Mesi')} value={months} onChangeText={setMonths} keyboardType="number-pad" style={{ maxWidth: 120 }} />}
          <Muted style={{ fontSize: 13 }}>{periodLabel(period, Number(months) || 1)}</Muted>
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
                : t("La quota ha l'IVA: fattura o scontrino li fai tu, come per le lezioni.")}
          </Muted>
          <Toggle label={t('Serve per prenotare')} value={required} onChange={setRequired} />
          <Muted style={{ fontSize: 13 }}>
            {required
              ? t('Il cliente deve averla valida il giorno della lezione. Tu puoi sempre prenotare per lui.')
              : t('Non blocca le prenotazioni: in Clienti vedi chi deve rinnovarla.')}
          </Muted>
        </>
      )}
      <ErrorText>{err}</ErrorText>
      {!!msg && <Muted>{msg}</Muted>}
      <Button title={t('Salva')} onPress={save} loading={saving} />
    </Card>
  );
}
