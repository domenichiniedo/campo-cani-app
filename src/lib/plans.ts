import { useLicense } from '@/lib/license-gate';
import type { License } from '@/lib/license';

// I tre piani dell'app venduta. Il piano sta nella licenza firmata (tools/licenza.mjs --piano):
// il centro non può cambiarlo da solo. Senza licenza (il tuo centro) l'app è completa.

export type PlanId = 'base' | 'professional' | 'pro';

export type Plan = {
  id: PlanId;
  label: string;
  /** Campi prenotabili; null = senza limite. */
  maxFields: number | null;
  /** Clienti iscritti; null = senza limite. */
  maxClients: number | null;
  trainers: boolean;
  packages: boolean;
  /** Fatture automatiche e scontrino battuto a mano. */
  invoices: boolean;
  /** Scontrino con registratore in cloud o registratore Epson al campo. */
  receiptDevices: boolean;
};

export const PLANS: Record<PlanId, Plan> = {
  base: { id: 'base', label: 'Base', maxFields: 1, maxClients: 50, trainers: false, packages: false, invoices: false, receiptDevices: false },
  professional: {
    id: 'professional',
    label: 'Professional',
    maxFields: 3,
    maxClients: 150,
    trainers: true,
    packages: true,
    invoices: true,
    receiptDevices: false,
  },
  pro: { id: 'pro', label: 'Pro', maxFields: null, maxClients: null, trainers: true, packages: true, invoices: true, receiptDevices: true },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

/** Le licenze fatte prima dei piani, e l'app senza licenza, valgono come Pro. */
export const planOf = (license: License | null): Plan => PLANS[license?.piano ?? 'pro'] ?? PLANS.pro;

export const usePlan = () => planOf(useLicense().license);

/** Il piano più piccolo che ha la funzione, per dire al centro cosa gli serve. */
export const planWith = (feature: keyof Omit<Plan, 'id' | 'label' | 'maxFields' | 'maxClients'>) =>
  PLAN_IDS.map((id) => PLANS[id]).find((p) => p[feature])!.label;
