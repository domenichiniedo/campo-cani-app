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
  lesson_type: string;
  lesson_option: string;
  day: string;
  start_min: number;
  dur_min: number;
  price_cents: number;
  pay: 'online' | 'onsite';
  paid: boolean;
  checked_in_at: string | null;
  note: string;
  status: 'active' | 'cancelled';
};

export type Penalty = {
  id: string;
  dog_id: string;
  booking_id: string | null;
  reason: string;
  created_at: string;
};

export type BusySlot = { day: string; start_min: number; dur_min: number; mine: boolean };

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
