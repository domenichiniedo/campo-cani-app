import { t, tKey } from '@/lib/i18n';

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
  /** Chi si iscrive conferma il cellulare con un codice SMS (serve un servizio SMS su Supabase). */
  sms_check: boolean;
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
  /** Foto nello spazio pubblico "branding"; null = iniziali al posto della foto. */
  photo_path: string | null;
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
  /** Lezione di gruppo: posti proposti per le classi. null = lezione singola. */
  group_seats: number | null;
};

export type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  role: 'client' | 'owner' | 'trainer';
  rules_ver: number | null;
  privacy_ver: number | null;
  rules_accepted_at: string | null;
  privacy_accepted_at: string | null;
  created_at: string;
  tax_code: string;
  /** Fattura (con codice fiscale e indirizzo) o scontrino: chi non vuole la fattura non dà il codice fiscale. */
  doc_pref: 'invoice' | 'receipt';
  billing_street: string;
  billing_zip: string;
  billing_city: string;
  billing_province: string;
  /** Persona (solo scontrino) o associazione/società (scontrino o fattura, con i dati qui sotto). */
  client_kind: 'persona' | 'societa';
  company_name: string;
  vat_number: string;
  sdi_code: string;
  pec: string;
  /** Foto nello spazio "foto", messa dal cliente; null = iniziali. */
  photo_path: string | null;
  /** Consenso facoltativo a pubblicare foto e video sui social del centro, con la data dell'ultima scelta. */
  social_consent: boolean;
  social_consent_at: string | null;
  /** Falso per chi si è iscritto con la conferma SMS accesa e non ha ancora messo il codice. */
  phone_ok: boolean;
};

export type Dog = {
  id: string;
  owner_id: string;
  name: string;
  breed: string;
  birth: string | null;
  /** Numero di microchip, 15 cifre; vuoto se non c'è. */
  chip: string;
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
  pay: 'online' | 'onsite' | 'package' | 'transfer';
  package_id: string | null;
  paid: boolean;
  checked_in_at: string | null;
  /** Nota scritta dal cliente quando prenota (piani Professional e Pro). */
  note: string;
  status: 'active' | 'cancelled';
  /** Classe di gruppo a cui è iscritto il cane; null = lezione singola. */
  class_id: string | null;
};

/** Lezione di gruppo messa in calendario dal proprietario. */
export type GroupClass = {
  id: string;
  lesson_type: string;
  lesson_option: string;
  field_id: string;
  trainer_id: string | null;
  day: string;
  start_min: number;
  dur_min: number;
  seats: number;
  status: 'active' | 'cancelled';
};

/** Classe vista dalla lista: posti presi e cani propri già iscritti. */
export type ClassSlot = Omit<GroupClass, 'status'> & { taken: number; my_dogs: string[] };

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

export type InvoiceSettings = {
  tax_regime: 'RF01' | 'RF19';
  vat_rate: number;
  auto_invoice: boolean;
  receipt_mode: 'manual' | 'cloud' | 'device';
  printer_url: string;
};

export type Invoice = {
  id: string;
  kind: 'invoice' | 'receipt';
  receipt_number: string | null;
  year: number;
  number: number | null;
  issued_on: string;
  user_id: string | null;
  booking_id: string | null;
  package_id: string | null;
  buyer_name: string;
  description: string;
  total_cents: number;
  status: 'pending' | 'sent' | 'error';
  error: string | null;
  sent_at: string | null;
};

export const invoiceTitle = (i: Invoice) =>
  i.kind === 'receipt'
    ? i.status === 'sent'
      ? i.receipt_number
        ? t('Scontrino {numero}', { numero: i.receipt_number })
        : t('Scontrino')
      : t('Scontrino da emettere')
    : i.number
      ? t('Fattura {numero}', { numero: `${i.number}/${i.year}` })
      : t('Fattura in preparazione');

/** Pacchetto attivo, non scaduto e con lezioni rimaste. */
export const usable = (cp: ClientPackage, now = Date.now()) =>
  cp.status === 'active' && cp.lessons_used < cp.lessons_total && (!cp.expires_at || new Date(cp.expires_at).getTime() > now);

/** Pagina del diario di allenamento di un cane: cosa si è fatto a una lezione e i commenti. */
export type DogNote = {
  id: string;
  dog_id: string;
  booking_id: string | null;
  trainer_id: string | null;
  author_name: string;
  day: string;
  lesson: string;
  work: string;
  comment: string;
  /** Scheda di valutazione compilata, copiata com'era quel giorno. */
  evaluation: Evaluation | null;
  created_at: string;
  updated_at: string;
};

/** Voce di una scheda di valutazione: voto da 1 a 5, sì/no, testo o scelta tra le risposte in options. */
export type EvalItem = { label: string; kind: 'score' | 'yesno' | 'text' | 'choice'; options?: string[] };

/** Scheda di valutazione preparata dal proprietario, da compilare nel diario (piano Pro). */
export type EvalForm = { id: string; name: string; items: EvalItem[]; active: boolean; sort: number };

export type Evaluation = { form_id: string; name: string; items: (EvalItem & { value: number | boolean | string | null })[] };

/** Account con cui un trainer entra nell'app (lo collega il proprietario con l'email). */
export type TrainerAccount = { trainer_id: string; email: string; user_id: string | null };

export type Penalty = {
  id: string;
  dog_id: string;
  booking_id: string | null;
  reason: string;
  created_at: string;
};

export type BusySlot = { field_id: string; day: string; start_min: number; dur_min: number; mine: boolean };

/** Motivi delle penalità: si salvano in italiano, si mostrano tradotti con t(). */
export const PENALTY_REASONS = [tKey('Assenza senza disdetta'), tKey('Ritardo'), tKey('Disdetta tardiva'), tKey('Comportamento')];

export const fullName = (p: Pick<Profile, 'first_name' | 'last_name'> | null | undefined) =>
  p ? `${p.first_name} ${p.last_name}`.trim() : '';

/** Testo completo del regolamento: regole automatiche più quelle scritte dal proprietario. */
export function rulesLines(s: Settings, types: LessonType[]): string[] {
  const auto = [
    `${t('Si prenota solo negli orari aperti dal campo.')} ${types.map((l) => t('{lezione}: turni da {min} minuti', { lezione: l.label, min: l.duration_min })).join('. ')}.`,
    t("La disdetta è possibile fino a {ore} ore prima dell'inizio del turno.", { ore: s.cancel_hours }) +
      (s.penalty_limit > 0 ? ` ${t('Assenze e ritardi comportano penalità: alla {n}ª le prenotazioni del cane vengono sospese.', { n: s.penalty_limit })}` : ''),
  ];
  return [...auto, ...s.rules.split('\n').map((l) => l.trim()).filter(Boolean)];
}

/** Conto del proprietario per il bonifico istantaneo; lo leggono solo i clienti con un account. */
export type TransferSettings = { id: 1; enabled: boolean; holder: string; iban: string };

/** Voto da 1 a 5 che il cliente dà a una lezione fatta, con un commento facoltativo. */
export type LessonRating = {
  booking_id: string;
  user_id: string;
  day: string;
  score: number;
  comment: string;
  created_at: string;
  updated_at: string;
};
