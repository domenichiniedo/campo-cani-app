import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { Body, Button, Card, Chips, ConfirmButton, ErrorText, Field, H1, Muted, Row, Screen, Stat, Step } from '@/components/ui';
import { parseDay } from '@/lib/board';
import { cap, dayKey, euro, monthName, today } from '@/lib/format';
import { t, tKey } from '@/lib/i18n';
import { dayText, PAY_METHODS, payMethodLabel, type PayMethod } from '@/lib/membership';
import { errorText, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import type { Expense } from '@/lib/types';

/** Le categorie proposte; se ne può scrivere un'altra. Si salvano in italiano e si mostrano tradotte. */
const CATEGORIES = [tKey('Affitto'), tKey('Utenze'), tKey('Attrezzatura'), tKey('Manutenzione'), tKey('Compensi trainer'), tKey('Assicurazione'), tKey('Tasse'), tKey('Pubblicità'), tKey('Altro')];

const catLabel = (c: string) => (CATEGORIES.includes(c) ? t(c) : c);

/** Le spese e le uscite del centro, mese per mese: le vede solo il proprietario. */
export default function OwnerExpenses() {
  const c = useColors();
  const [month, setMonth] = useState(() => new Date(today().getFullYear(), today().getMonth(), 1));
  const [rows, setRows] = useState<Expense[]>([]);
  const [day, setDay] = useState(dayText(dayKey(today())));
  const [cat, setCat] = useState(CATEGORIES[0]);
  const [other, setOther] = useState('');
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PayMethod>('bonifico');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const from = dayKey(month);
  const to = dayKey(new Date(month.getFullYear(), month.getMonth() + 1, 0));

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('expenses').select('*').gte('day', from).lte('day', to).order('day', { ascending: false });
    if (error) setErr(errorText(error));
    setRows((data ?? []) as Expense[]);
    setLoading(false);
  }, [from, to]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function add() {
    setErr('');
    setMsg('');
    const d = parseDay(day);
    const cents = Math.round(Number(amount.replace(',', '.')) * 100);
    const category = cat === 'Altro' && other.trim() ? other.trim() : cat;
    if (!d) return setErr(t('Data non valida: usa il formato 31/12/2026.'));
    if (!Number.isFinite(cents) || cents <= 0) return setErr(t('Scrivi quanto hai speso.'));
    setSaving(true);
    const { error } = await supabase.from('expenses').insert({ day: d, category, description: desc.trim(), amount_cents: cents, pay_method: method });
    setSaving(false);
    if (error) return setErr(errorText(error));
    setDesc('');
    setAmount('');
    setOther('');
    setMsg(t('Spesa segnata.'));
    // Si vede subito il mese in cui è finita.
    const [y, m] = d.split('-').map(Number);
    if (y !== month.getFullYear() || m - 1 !== month.getMonth()) setMonth(new Date(y, m - 1, 1));
    else load();
  }

  const total = rows.reduce((s, x) => s + x.amount_cents, 0);
  const byCat = [...rows.reduce((m, x) => m.set(x.category, (m.get(x.category) ?? 0) + x.amount_cents), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]);
  const top = Math.max(1, ...byCat.map(([, v]) => v));

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <H1>{`${t('Spese')} · ${cap(monthName(month.getMonth()))} ${month.getFullYear()}`}</H1>
      <Row>
        <Button small kind="ghost" title={t('‹ Prima')} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} />
        <Button small kind="ghost" title={t('Adesso')} onPress={() => setMonth(new Date(today().getFullYear(), today().getMonth(), 1))} />
        <Button small kind="ghost" title={t('Dopo ›')} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} />
      </Row>
      <Row>
        <Stat label={t('Uscite del mese')} value={euro(total)} />
        <Stat label={t('Spese segnate')} value={rows.length} />
      </Row>
      <Muted style={{ fontSize: 12 }}>{t('Nella pagina Incassi le uscite si tolgono dall\'incassato per il saldo del periodo.')}</Muted>

      <Step title={t('Nuova spesa')} />
      <Card>
        <Chips items={CATEGORIES.map((x) => ({ value: x, label: t(x) }))} value={cat} onChange={setCat} />
        {cat === 'Altro' && <Field label={t('Categoria (facoltativa)')} value={other} onChangeText={setOther} placeholder={t('Veterinario, gara, ...')} />}
        <Row>
          <Field label={t('Giorno')} value={day} onChangeText={setDay} placeholder="31/12/2026" style={{ width: 130 }} />
          <Field label={t('Importo (€)')} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={{ width: 120 }} />
          <Field label={t('Descrizione (facoltativa)')} value={desc} onChangeText={setDesc} style={{ flex: 1, minWidth: 160 }} />
        </Row>
        <Chips items={PAY_METHODS.map((m) => ({ value: m, label: payMethodLabel(m) }))} value={method} onChange={setMethod} />
        <ErrorText>{err}</ErrorText>
        {!!msg && <Muted>{msg}</Muted>}
        <Button title={t('Segna la spesa')} onPress={add} loading={saving} />
      </Card>

      {byCat.length > 0 && (
        <>
          <Step title={t('Per categoria')} />
          <Card>
            {byCat.map(([k, v]) => (
              <View key={k} style={{ gap: 4 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ color: c.text, fontWeight: '700', flex: 1 }}>{catLabel(k)}</Text>
                  <Text style={{ color: c.muted }}>{euro(v)}</Text>
                </Row>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: c.line, overflow: 'hidden' }}>
                  <View style={{ width: `${(v / top) * 100}%`, height: '100%', borderRadius: 3, backgroundColor: c.danger }} />
                </View>
              </View>
            ))}
          </Card>
        </>
      )}

      <Step title={t('Elenco')} />
      {rows.length === 0 && !loading && <Muted>{t('Nessuna spesa in questo mese.')}</Muted>}
      {rows.length > 0 && (
        <Card>
          {rows.map((x) => (
            <Row key={x.id} style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1, minWidth: 160 }}>
                <Body>{[catLabel(x.category), x.description].filter(Boolean).join(' · ')}</Body>
                <Muted style={{ fontSize: 13 }}>{[dayText(x.day), payMethodLabel(x.pay_method)].filter(Boolean).join(' · ')}</Muted>
              </View>
              <Body bold>{euro(x.amount_cents)}</Body>
              <ConfirmButton
                title={t('Elimina')}
                onConfirm={async () => {
                  const { error } = await supabase.from('expenses').delete().eq('id', x.id);
                  if (error) setErr(errorText(error));
                  load();
                }}
              />
            </Row>
          ))}
        </Card>
      )}
    </Screen>
  );
}
