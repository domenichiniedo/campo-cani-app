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
  /** Tipi di lezione prenotabili; null = senza limite. */
  maxLessonTypes: number | null;
  /** Pacchetti richiedibili dai clienti; null = senza limite. */
  maxPackages: number | null;
  /** Trainer attivi; 0 = niente trainer, null = senza limite. */
  maxTrainers: number | null;
  trainers: boolean;
  packages: boolean;
  /** Lezioni segnate come incassate, da incassare e pagina Incassi. */
  payments: boolean;
  /** Statistiche nella pagina Incassi: grafico, presenze, disdette, ripartizioni. */
  stats: boolean;
  /** Fatture automatiche e scontrino battuto a mano. */
  invoices: boolean;
  /** Scontrino con registratore in cloud o registratore Epson al campo. */
  receiptDevices: boolean;
  /** Programma per Windows e Mac. */
  desktop: boolean;
  /** Lezioni di gruppo: classi con più cani. */
  groups: boolean;
  /** Schede di valutazione del proprietario, compilate nel diario dei cani. */
  evals: boolean;
  /** Report mensile in Excel per email, l'ultimo venerdì del mese. */
  report: boolean;
};

export const PLANS: Record<PlanId, Plan> = {
  base: {
    id: 'base',
    label: 'Base',
    maxFields: 1,
    maxClients: 100,
    maxLessonTypes: 3,
    maxPackages: 3,
    maxTrainers: 0,
    trainers: false,
    packages: true,
    payments: false,
    stats: false,
    invoices: false,
    receiptDevices: false,
    desktop: false,
    groups: false,
    evals: false,
    report: false,
  },
  professional: {
    id: 'professional',
    label: 'Professional',
    maxFields: 2,
    maxClients: 100,
    maxLessonTypes: 5,
    maxPackages: 5,
    maxTrainers: 2,
    trainers: true,
    packages: true,
    payments: true,
    stats: false,
    invoices: false,
    receiptDevices: false,
    desktop: false,
    groups: false,
    evals: false,
    report: false,
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    maxFields: null,
    maxClients: null,
    maxLessonTypes: null,
    maxPackages: null,
    maxTrainers: null,
    trainers: true,
    packages: true,
    payments: true,
    stats: true,
    invoices: true,
    receiptDevices: true,
    desktop: true,
    groups: true,
    evals: true,
    report: true,
  },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

/** Le licenze fatte prima dei piani, e l'app senza licenza, valgono come Pro. */
export const planOf = (license: License | null): Plan => PLANS[license?.piano ?? 'pro'] ?? PLANS.pro;

export const usePlan = () => planOf(useLicense().license);

/** Il piano più piccolo che ha la funzione, per dire al centro cosa gli serve. */
export const planWith = (feature: { [K in keyof Plan]: Plan[K] extends boolean ? K : never }[keyof Plan]) =>
  PLAN_IDS.map((id) => PLANS[id]).find((p) => p[feature])!.label;

/** Il primo piano che permette più di `n` elementi di quel tipo. */
export const planAbove = (limit: 'maxFields' | 'maxClients' | 'maxLessonTypes' | 'maxPackages' | 'maxTrainers', n: number) =>
  PLAN_IDS.map((id) => PLANS[id]).find((p) => p[limit] === null || p[limit] > n)!.label;

/** I primi `max` elementi (tutti se il piano non ha limite). */
export const upTo = <T,>(list: T[], max: number | null) => (max === null ? list : list.slice(0, max));
