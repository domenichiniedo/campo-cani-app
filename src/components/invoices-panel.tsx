import { useEffect, useState } from 'react';

import { Badge, Body, Button, Card, Chips, ErrorText, Field, Muted, Row, Toggle } from '@/components/ui';
import { euro, shortDate } from '@/lib/format';
import { errorText, supabase } from '@/lib/supabase';
import { invoiceTitle, type Invoice, type InvoiceSettings } from '@/lib/types';

export function InvoiceBadge({ status }: { status: Invoice['status'] }) {
  if (status === 'sent') return <Badge tone="ok">Inviata</Badge>;
  if (status === 'error') return <Badge tone="bad">Errore</Badge>;
  return <Badge tone="warn">Da inviare</Badge>;
}

/** Fatture dei pagamenti online: come si fattura, ultime fatture e invio a Fatture in Cloud. */
export function InvoicesPanel() {
  const [cfg, setCfg] = useState<InvoiceSettings | null>(null);
  const [vat, setVat] = useState('22');
  const [list, setList] = useState<Invoice[]>([]);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = () =>
    Promise.all([
      supabase.from('invoice_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('invoices').select('*').order('created_at', { ascending: false }).limit(20),
    ]).then(([c, l]) => {
      if (c.data) {
        setCfg(c.data as InvoiceSettings);
        setVat(String(c.data.vat_rate).replace('.', ','));
      }
      setList((l.data ?? []) as Invoice[]);
    });

  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!cfg) return;
    setErr('');
    setMsg('');
    const rate = Number(vat.replace(',', '.'));
    if (!Number.isFinite(rate) || rate < 0 || rate >= 100) return setErr('Aliquota IVA non valida.');
    setSaving(true);
    const { error } = await supabase
      .from('invoice_settings')
      .update({ tax_regime: cfg.tax_regime, vat_rate: rate, auto_invoice: cfg.auto_invoice, updated_at: new Date().toISOString() })
      .eq('id', 1);
    setSaving(false);
    if (error) return setErr(errorText(error));
    setMsg('Impostazioni fatture salvate.');
  }

  async function sendNow() {
    setErr('');
    setMsg('');
    setSending(true);
    const { data, error } = await supabase.functions.invoke('fatture-in-cloud', { method: 'POST' });
    setSending(false);
    if (error) return setErr('Fatture in Cloud non è ancora collegato: segui i passi nel README.');
    setMsg(
      data?.sendForReal
        ? `Inviate allo SDI: ${data.done}. Con errori: ${data.failed}.`
        : `Prova riuscita per ${data?.done ?? 0} fatture: le trovi su Fatture in Cloud, ma lo SDI non è ancora attivo.`,
    );
    load();
  }

  async function retry(id: string) {
    const { error } = await supabase.rpc('retry_invoice', { p_id: id });
    if (error) return setErr(errorText(error));
    load();
  }

  if (!cfg) return <Muted>Esegui la migrazione 0006_fatture.sql per attivare le fatture.</Muted>;
  const pending = list.filter((i) => i.status === 'pending').length;

  return (
    <>
      <Muted>
        Quando una lezione pagata online risulta incassata, l&apos;app prepara la fattura con i dati del cliente e la invia a
        Fatture in Cloud, che la numera e la trasmette allo SDI. I pagamenti al campo restano da fatturare come fai ora.
      </Muted>
      <Card>
        <Toggle label="Fattura in automatico i pagamenti online" value={cfg.auto_invoice} onChange={(v) => setCfg({ ...cfg, auto_invoice: v })} />
        <Muted style={{ fontSize: 13 }}>Regime</Muted>
        <Chips
          items={[
            { value: 'RF01', label: 'Ordinario (con IVA)' },
            { value: 'RF19', label: 'Forfettario (senza IVA)' },
          ]}
          value={cfg.tax_regime}
          onChange={(v) => setCfg({ ...cfg, tax_regime: v })}
        />
        {cfg.tax_regime === 'RF01' && (
          <Field label="IVA (%) inclusa nei prezzi" value={vat} onChangeText={setVat} keyboardType="decimal-pad" style={{ maxWidth: 160 }} />
        )}
        <Button title="Salva" onPress={save} loading={saving} small />
      </Card>

      <Row style={{ justifyContent: 'space-between' }}>
        <Body bold>Ultime fatture</Body>
        <Button small kind="ghost" title={pending ? `Invia ora (${pending})` : 'Invia ora'} onPress={sendNow} loading={sending} />
      </Row>
      {list.length === 0 && <Muted>Nessuna fattura: arrivano con i primi pagamenti online.</Muted>}
      {list.map((i) => (
        <Card key={i.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Body bold>{invoiceTitle(i)}</Body>
            <InvoiceBadge status={i.status} />
          </Row>
          <Muted>
            {i.buyer_name} · {euro(i.total_cents)} · {shortDate(i.issued_on)}
          </Muted>
          <Muted style={{ fontSize: 13 }}>{i.description}</Muted>
          {i.status === 'error' && (
            <>
              <ErrorText>{i.error}</ErrorText>
              <Button small kind="ghost" title="Riprova" onPress={() => retry(i.id)} />
            </>
          )}
        </Card>
      ))}
      <ErrorText>{err}</ErrorText>
      {!!msg && <Muted>{msg}</Muted>}
    </>
  );
}
