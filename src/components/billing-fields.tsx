import { Field, Row } from '@/components/ui';
import type { BillingDraft } from '@/lib/billing';
import { t } from '@/lib/i18n';

/** I dati dell'associazione o della società per la fattura, usati in iscrizione e profilo. */
export function BillingFields({ value, onChange }: { value: BillingDraft; onChange: (v: BillingDraft) => void }) {
  const set = (patch: Partial<BillingDraft>) => onChange({ ...value, ...patch });
  return (
    <>
      <Field label={t('Ragione sociale')} value={value.company} onChangeText={(v) => set({ company: v })} placeholder={t('Es. Asd Cinofila Le Querce')} />
      <Row>
        <Field
          label={t('Partita IVA (se ce l’hai)')}
          value={value.vat}
          onChangeText={(v) => set({ vat: v })}
          keyboardType="number-pad"
          maxLength={13}
          style={{ flex: 1, minWidth: 140 }}
        />
        <Field
          label={t('Codice fiscale')}
          value={value.taxCode}
          onChangeText={(v) => set({ taxCode: v.toUpperCase() })}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={16}
          style={{ flex: 1, minWidth: 140 }}
        />
      </Row>
      <Field label={t('Sede: via e numero')} value={value.street} onChangeText={(v) => set({ street: v })} autoComplete="street-address" />
      <Row>
        <Field label={t('CAP')} value={value.zip} onChangeText={(v) => set({ zip: v })} keyboardType="number-pad" maxLength={5} autoComplete="postal-code" style={{ width: 96 }} />
        <Field label={t('Comune')} value={value.city} onChangeText={(v) => set({ city: v })} style={{ flex: 1, minWidth: 140 }} />
        <Field label={t('Prov.')} value={value.province} onChangeText={(v) => set({ province: v.toUpperCase() })} autoCapitalize="characters" maxLength={2} style={{ width: 72 }} />
      </Row>
      <Row>
        <Field
          label={t('Codice destinatario (SDI)')}
          value={value.sdi}
          onChangeText={(v) => set({ sdi: v.toUpperCase() })}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
          style={{ flex: 1, minWidth: 140 }}
        />
        <Field label={t('PEC')} value={value.pec} onChangeText={(v) => set({ pec: v })} autoCapitalize="none" keyboardType="email-address" style={{ flex: 1, minWidth: 180 }} />
      </Row>
    </>
  );
}
