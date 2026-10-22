export type Settings = {
  id: 1;
  field_name: string;
  field_address: string;
  logo_path: string | null;
  open_min: number;
  close_min: number;
  cancel_hours: number;
  penalty_limit: number;
  online_payments: boolean;
  rules: string;
  privacy: string;
  rules_ver: number;
  privacy_ver: number;
};

export type Field = {
  id: string;
  name: string;
  address: string;
  sort: number;
  active: boolean;
};

export type Trainer = {
  id: string;
  name: string;
  /** Tipi di lezione che segue; vuoto vuol dire tutti. */
  lessons: string[];
  sort: number;
  active: boolean;
};

export type LessonType = {
  id: string;
  label: string;
  description: string;
  duration_min: number;
  price_cents: number;
  options: string[];
  sort: number;
  active: boolean;
};

export type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  role: 'client' | 'owner';
  rules_ver: number | null;
  privacy_ver: number | null;
  rules_accepted_at: string | null;
  privacy_accepted_at: string | null;
  created_at: string;
  tax_code: string;
  billing_street: string;
  billing_zip: string;
  billing_city: string;
  billing_province: string;
};

export type Dog = {
  id: string;
  owner_id: string;
  name: string;
  breed: string;
  birth: string | null;
  blocked: boolean;
  archived: boolean;
};

export type Booking = {
  id: string;
  user_id: string;
  dog_id: string;
  field_id: string;
  trainer_id: string | null;
  lesson_type: string;
  lesson_option: string;
  day: string;
  start_min: number;
  dur_min: number;
  price_cents: number;
  pay: 'online' | 'onsite' | 'package';
  package_id: string | null;
  paid: boolean;
  checked_in_at: string | null;
  note: string;
  status: 'active' | 'cancelled';
};

export type Package = {
  id: string;
  name: string;
  /** Tipo di lezione a cui vale; null = tutte. */
  lesson_type: string | null;
  lessons: number;
  price_cents: number;
  /** Giorni di validità dall'attivazione; null = non scade. */
  valid_days: number | null;
  sort: number;
  active: boolean;
};

export type ClientPackage = {
  id: string;
  user_id: string;
  package_id: string | null;
  name: string;
  lesson_type: string | null;
  lessons_total: number;
  lessons_used: number;
  price_cents: number;
  status: 'requested' | 'active' | 'cancelled';
  requested_at: string;
  activated_at: string | null;
  expires_at: string | null;
};

/** Pacchetto attivo, non scaduto e con lezioni rimaste. */
export const usable = (cp: ClientPackage, now = Date.now()) =>
  cp.status === 'active' && cp.lessons_used < cp.lessons_total && (!cp.expires_at || new Date(cp.expires_at).getTime() > now);

export type Penalty = {
  id: string;
  dog_id: string;
  booking_id: string | null;
  reason: string;
  created_at: string;
};

export type BusySlot = { field_id: string; day: string; start_min: number; dur_min: number; mine: boolean };

export const PENALTY_REASONS = ['Assenza senza disdetta', 'Ritardo', 'Disdetta tardiva', 'Comportamento'];

export const fullName = (p: Pick<Profile, 'first_name' | 'last_name'> | null | undefined) =>
  p ? `${p.first_name} ${p.last_name}`.trim() : '';

/** Testo completo del regolamento: regole automatiche più quelle scritte dal proprietario. */
export function rulesLines(s: Settings, types: LessonType[]): string[] {
  const auto = [
    `Si prenota solo negli orari aperti dal campo. ${types.map((t) => `${t.label}: turni da ${t.duration_min} minuti`).join('. ')}.`,
    `La disdetta è possibile fino a ${s.cancel_hours} ore prima dell'inizio del turno.` +
      (s.penalty_limit > 0 ? ` Assenze e ritardi comportano penalità: alla ${s.penalty_limit}ª le prenotazioni del cane vengono sospese.` : ''),
  ];
  return [...auto, ...s.rules.split('\n').map((l) => l.trim()).filter(Boolean)];
}
