import { Muted } from '@/components/ui';
import { t } from '@/lib/i18n';
import { planAbove, usePlan } from '@/lib/plans';

/** Avviso sotto una lista che il piano limita, per esempio "fino a 3 lezioni prenotabili". */
export function LimitNote({ kind, count, what }: { kind: Parameters<typeof planAbove>[0]; count: number; what: string }) {
  const plan = usePlan();
  const max = plan[kind];
  if (max === null) return null;
  const other = planAbove(kind, max);
  return (
    <Muted style={{ fontSize: 13 }}>
      {count >= max && other
        ? t('Il piano {piano} comprende fino a {max} {cosa}. Per averne di più serve il piano {altro}.', { piano: plan.label, max, cosa: what, altro: other })
        : t('Il piano {piano} comprende fino a {max} {cosa}.', { piano: plan.label, max, cosa: what })}
    </Muted>
  );
}
