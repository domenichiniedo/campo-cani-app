import { useCallback, useEffect, useState } from 'react';

import { Badge, Body, Button, Card, Chips, ErrorText, Field, Muted, Row, Toggle } from '@/components/ui';
import { printEpsonReceipt } from '@/lib/epson-rt';
import { euro, shortDate } from '@/lib/format';
import { t, tKey } from '@/lib/i18n';
import { planWith, usePlan } from '@/lib/plans';
import { errorText, supabase } from '@/lib/supabase';
import { invoiceTitle, type Invoice, type InvoiceSettings } from '@/lib/types';

function InvoiceBadge({ invoice: i }: { invoice: Invoice }) {
  if (i.status === 'sent') return <Badge tone="ok">{i.kind === 'receipt' ? t('Emesso') : t('Inviata')}</Badge>;
  if (i.status === 'error') return <Badge tone="bad">{t('Errore')}</Badge>;
  return <Badge tone="warn">{i.kind === 'receipt' ? t('Da emettere') : t('Da inviare')}</Badge>;
}

const RECEIPT_MODES: { value: InvoiceSettings['receipt_mode']; label: string; help: string }[] = [
  { value: 'manual', label: tKey('Lo batto io'), help: tKey('Batti lo scontrino sul registratore del campo e premi Battuto.') },
  {
    value: 'cloud',
    label: tKey('Registratore in cloud'),
    help: tKey('Lo trasmette da solo il registratore virtuale Openapi, anche quando non sei al campo. Va collegato seguendo il README.'),
  },
  {
    value: 'device',
    label: tKey('Registratore al campo'),
    help: tKey('Il telefono o il computer lo stampa sul registratore Epson RT del campo: devono essere sulla sua stessa rete.'),
  },
];

/** Stampa lo scontrino sul registratore Epson del campo e lo segna come emesso con il suo numero. */
function PrintReceipt({ invoice, printerUrl, onDone }: { invoice: Invoice; printerUrl: string; onDone: (e?: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      small
      title={t('Stampa sul registratore')}
      loading={busy}
      disabled={!printerUrl.trim()}
      onPress={async () => {
        setBusy(true);
        try {
          const num = await printEpsonReceipt(printerUrl, invoice.description, invoice.total_cents);
          const { error } = await supabase.rpc('mark_receipt_done', { p_id: invoice.id, p_number: num ?? '' });
          onDone(error ? errorText(error) : undefined);
        } catch (e) {
          onDone((e as Error).message);
        }
        setBusy(false);
      }}
    />
  );
}

/** Scontrino da battere sul registratore telematico: il proprietario lo segna come fatto. */
function ReceiptDone({ id, onDone }: { id: string; onDone: (e?: string) => void }) {
  const [num, setNum] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Row>
      <Field label={t('N. documento (facoltativo)')} value={num} onChangeText={setNum} placeholder="0001-0042" style={{ flex: 1, minWidth: 140 }} />
      <Button
        small
        title={t('Battuto')}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          const { error } = await supabase.rpc('mark_receipt_done', { p_id: id, p_number: num });
          setBusy(false);
          onDone(error ? errorText(error) : undefined);
        }}
      />
    </Row>
  );
}

/** Fatture dei pagamenti online: come si fattura, ultime fatture e invio a Fatture in Cloud. */
export function InvoicesPanel() {
  const plan = usePlan();
  const [cfg, setCfg] = useState<InvoiceSettings | null>(null);
  const [vat, setVat] = useState('22');
  const [list, setList] = useState<Invoice[]>([]);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const devices = plan.receiptDevices;
  const load = useCallback(
    () =>
      Promise.all([
        supabase.from('invoice_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('invoices').select('*').order('created_at', { ascending: false }).limit(20),
      ]).then(([c, l]) => {
        if (c.data) {
          const loaded = c.data as InvoiceSettings;
          // Dopo il passaggio a un piano senza registratori lo scontrino torna "Lo batto io".
          if (!devices && loaded.receipt_mode !== 'manual') {
            loaded.receipt_mode = 'manual';
            supabase.from('invoice_settings').update({ receipt_mode: 'manual' }).eq('id', 1).then(() => {});
          }
          setCfg(loaded);
          setVat(String(loaded.vat_rate).replace('.', ','));
        }
        setList((l.data ?? []) as Invoice[]);
      }),
    [devices],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!cfg) return;
    setErr('');
    setMsg('');
    const rate = Number(vat.replace(',', '.'));
    if (!Number.isFinite(rate) || rate < 0 || rate >= 100) return setErr(t('Aliquota IVA non valida.'));
    setSaving(true);
    const { error } = await supabase
      .from('invoice_settings')
      .update({
        tax_regime: cfg.tax_regime,
        vat_rate: rate,
        auto_invoice: cfg.auto_invoice,
        receipt_mode: cfg.receipt_mode,
        printer_url: cfg.printer_url.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);
    setSaving(false);
    if (error) return setErr(errorText(error));
    setMsg(t('Impostazioni fatture salvate.'));
  }

  async function sendNow() {
    setErr('');
    setMsg('');
    setSending(true);
    const [inv, rec] = await Promise.all([
      supabase.functions.invoke('fatture-in-cloud', { method: 'POST' }),
      cfg?.receipt_mode === 'cloud' ? supabase.functions.invoke('scontrini-openapi', { method: 'POST' }) : null,
    ]);
    setSending(false);
    const lines: string[] = [];
    if (inv.error) lines.push(t('Fatture in Cloud non è ancora collegato: segui i passi nel README.'));
    else if (inv.data?.sendForReal) lines.push(t('Fatture inviate allo SDI: {fatte}. Con errori: {errori}.', { fatte: inv.data.done, errori: inv.data.failed }));
    else lines.push(t('Prova riuscita per {n} fatture: le trovi su Fatture in Cloud, ma lo SDI non è ancora attivo.', { n: inv.data?.done ?? 0 }));
    if (rec?.error) lines.push(t('Il registratore in cloud non è ancora collegato: segui i passi nel README.'));
    else if (rec) {
      lines.push(
        t('Scontrini trasmessi: {fatti}, in lavorazione: {attesa}, con errori: {errori}', {
          fatti: rec.data?.done ?? 0,
          attesa: rec.data?.waiting ?? 0,
          errori: rec.data?.failed ?? 0,
        }) + (rec.data?.live ? '.' : ` (${t('ambiente di prova')}).`),
      );
    }
    setMsg(lines.join(' '));
    load();
  }

  async function retry(id: string) {
    const { error } = await supabase.rpc('retry_invoice', { p_id: id });
    if (error) return setErr(errorText(error));
    load();
  }

  if (!cfg) return <Muted>{t('Esegui la migrazione 0006_fatture.sql per attivare le fatture.')}</Muted>;
  const pending = list.filter((i) => i.status === 'pending' && (i.kind === 'invoice' || cfg.receipt_mode === 'cloud')).length;
  // I registratori (in cloud e al campo) sono nel piano Pro: negli altri si batte a mano.
  const modes = plan.receiptDevices ? RECEIPT_MODES : RECEIPT_MODES.filter((m) => m.value === 'manual');
  const mode = RECEIPT_MODES.find((m) => m.value === cfg.receipt_mode) ?? RECEIPT_MODES[0];

  return (
    <>
      <Muted>
        {t("Quando una lezione pagata online risulta incassata, l'app prepara la fattura con i dati del cliente e la invia a Fatture in Cloud, che la numera e la trasmette allo SDI. Se il cliente ha scelto lo scontrino, lo emetti nel modo scelto qui sotto. I pagamenti al campo restano come ora.")}
      </Muted>
      <Card>
        <Toggle label={t('Prepara fattura o scontrino per i pagamenti online')} value={cfg.auto_invoice} onChange={(v) => setCfg({ ...cfg, auto_invoice: v })} />
        <Muted style={{ fontSize: 13 }}>{t('Regime')}</Muted>
        <Chips
          items={[
            { value: 'RF01', label: t('Ordinario (con IVA)') },
            { value: 'RF19', label: t('Forfettario (senza IVA)') },
          ]}
          value={cfg.tax_regime}
          onChange={(v) => setCfg({ ...cfg, tax_regime: v })}
        />
        {cfg.tax_regime === 'RF01' && (
          <Field label={t('IVA (%) inclusa nei prezzi')} value={vat} onChangeText={setVat} keyboardType="decimal-pad" style={{ maxWidth: 160 }} />
        )}
        <Muted style={{ fontSize: 13 }}>{t('Scontrino')}</Muted>
        <Chips
          items={modes.map((m) => ({ value: m.value, label: t(m.label) }))}
          value={cfg.receipt_mode}
          onChange={(v) => setCfg({ ...cfg, receipt_mode: v })}
        />
        <Muted style={{ fontSize: 13 }}>{t(mode.help)}</Muted>
        {!plan.receiptDevices && (
          <Muted style={{ fontSize: 13 }}>{t('Registratore in cloud e registratore al campo sono compresi dal piano {piano}.', { piano: planWith('receiptDevices') })}</Muted>
        )}
        {cfg.receipt_mode === 'device' && (
          <Field
            label={t('Indirizzo del registratore')}
            value={cfg.printer_url}
            onChangeText={(v) => setCfg({ ...cfg, printer_url: v })}
            placeholder="192.168.1.50"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        )}
        <Button title={t('Salva')} onPress={save} loading={saving} small />
      </Card>

      <Row style={{ justifyContent: 'space-between' }}>
        <Body bold>{t('Ultime fatture e scontrini')}</Body>
        <Button small kind="ghost" title={pending ? `${t('Invia ora')} (${pending})` : t('Invia ora')} onPress={sendNow} loading={sending} />
      </Row>
      {list.length === 0 && <Muted>{t('Nessuna fattura: arrivano con i primi pagamenti online.')}</Muted>}
      {list.map((i) => (
        <Card key={i.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Body bold>{invoiceTitle(i)}</Body>
            <InvoiceBadge invoice={i} />
          </Row>
          <Muted>
            {i.buyer_name} · {euro(i.total_cents)} · {shortDate(i.issued_on)}
          </Muted>
          <Muted style={{ fontSize: 13 }}>{i.description}</Muted>
          {i.kind === 'receipt' && i.status === 'pending' && cfg.receipt_mode === 'cloud' && (
            <Muted style={{ fontSize: 13 }}>{t('Lo trasmette il registratore in cloud: premi Invia ora per controllare.')}</Muted>
          )}
          {i.kind === 'receipt' && i.status === 'pending' && cfg.receipt_mode === 'device' && (
            <PrintReceipt
              invoice={i}
              printerUrl={cfg.printer_url}
              onDone={(e) => {
                if (e) return setErr(e);
                load();
              }}
            />
          )}
          {i.kind === 'receipt' && i.status === 'pending' && cfg.receipt_mode !== 'cloud' && (
            <ReceiptDone
              id={i.id}
              onDone={(e) => {
                if (e) return setErr(e);
                load();
              }}
            />
          )}
          {i.status === 'error' && (
            <>
              <ErrorText>{i.error}</ErrorText>
              <Button small kind="ghost" title={t('Riprova')} onPress={() => retry(i.id)} />
            </>
          )}
        </Card>
      ))}
      <ErrorText>{err}</ErrorText>
      {!!msg && <Muted>{msg}</Muted>}
    </>
  );
}
