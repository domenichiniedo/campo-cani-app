import { Field, Muted, Row } from '@/components/ui';
import type { CentreBilling } from '@/lib/billing';
import { t } from '@/lib/i18n';

/** I dati per fatturare al centro: alla registrazione dall'app e nel pannello del gestore. */
export function CentreBillingFields({ value, onChange }: { value: CentreBilling; onChange: (v: CentreBilling) => void }) {
  const set = (patch: Partial<CentreBilling>) => onChange({ ...value, ...patch });
  return (
    <>
      <Muted style={{ fontSize: 13 }}>{t('Se organizzi le lezioni come privato bastano nome e cognome: gli altri dati sono facoltativi, servono solo se vuoi la fattura intestata.')}</Muted>
      <Field label={t('Nome e cognome o ragione sociale')} value={value.ragione_sociale} onChangeText={(v) => set({ ragione_sociale: v })} placeholder={t('Es. Mario Rossi o Asd Cinofila Le Querce')} />
      <Row>
        <Field
          label={t('Partita IVA')}
          value={value.partita_iva}
          onChangeText={(v) => set({ partita_iva: v })}
          keyboardType="number-pad"
          maxLength={13}
          style={{ flex: 1, minWidth: 140 }}
        />
        <Field
          label={t('Codice fiscale')}
          value={value.codice_fiscale}
          onChangeText={(v) => set({ codice_fiscale: v.toUpperCase() })}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={16}
          style={{ flex: 1, minWidth: 140 }}
        />
      </Row>
      <Field label={t('Sede: via e numero')} value={value.indirizzo} onChangeText={(v) => set({ indirizzo: v })} autoComplete="street-address" />
      <Row>
        <Field label={t('CAP')} value={value.cap} onChangeText={(v) => set({ cap: v })} keyboardType="number-pad" maxLength={5} autoComplete="postal-code" style={{ width: 96 }} />
        <Field label={t('Comune')} value={value.comune} onChangeText={(v) => set({ comune: v })} style={{ flex: 1, minWidth: 140 }} />
        <Field label={t('Prov.')} value={value.provincia} onChangeText={(v) => set({ provincia: v.toUpperCase() })} autoCapitalize="characters" maxLength={2} style={{ width: 72 }} />
      </Row>
      <Row>
        <Field
          label={t('Codice destinatario (SDI)')}
          value={value.codice_sdi}
          onChangeText={(v) => set({ codice_sdi: v.toUpperCase() })}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
          style={{ flex: 1, minWidth: 140 }}
        />
        <Field label={t('PEC')} value={value.pec} onChangeText={(v) => set({ pec: v })} autoCapitalize="none" keyboardType="email-address" style={{ flex: 1, minWidth: 180 }} />
      </Row>
      <Muted style={{ fontSize: 13 }}>{t('Per la fattura elettronica: il codice destinatario o la PEC. Senza nessuno dei due la fattura arriva nel cassetto fiscale.')}</Muted>
    </>
  );
}
