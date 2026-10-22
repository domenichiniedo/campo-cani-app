import { Muted } from '@/components/ui';
import { planAbove, usePlan } from '@/lib/plans';

/** Avviso sotto una lista che il piano limita, per esempio "fino a 3 lezioni prenotabili". */
export function LimitNote({ kind, count, what }: { kind: Parameters<typeof planAbove>[0]; count: number; what: string }) {
  const plan = usePlan();
  const max = plan[kind];
  if (max === null) return null;
  return (
    <Muted style={{ fontSize: 13 }}>
      {count >= max
        ? `Il piano ${plan.label} comprende fino a ${max} ${what}. Per averne di più serve il piano ${planAbove(kind, max)}.`
        : `Il piano ${plan.label} comprende fino a ${max} ${what}.`}
    </Muted>
  );
}
