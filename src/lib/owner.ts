import { supabase } from '@/lib/supabase';
import type { Booking, GroupClass } from '@/lib/types';

export type OwnerBooking = Booking & {
  profiles: { first_name: string; last_name: string; phone: string; photo_path: string | null } | null;
  dogs: { name: string; breed: string; blocked: boolean } | null;
  lesson_types: { label: string } | null;
  fields: { name: string } | null;
  trainers: { name: string } | null;
  penalties: { id: string }[];
};

/** Prenotazioni attive tra due giorni, con cliente, cane e penalità già date. */
export async function ownerBookings(from: string, to: string) {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, profiles(first_name, last_name, phone, photo_path), dogs(name, breed, blocked), lesson_types(label), fields(name), trainers(name), penalties(id)')
    .eq('status', 'active')
    .gte('day', from)
    .lte('day', to)
    .order('day')
    .order('start_min');
  if (error) throw error;
  return (data ?? []) as OwnerBooking[];
}

export type OwnerClass = GroupClass & {
  lesson_types: { label: string } | null;
  fields: { name: string } | null;
  trainers: { name: string } | null;
};

/** Classi di gruppo in calendario tra due giorni (i cani iscritti arrivano con ownerBookings). */
export async function ownerClasses(from: string, to: string) {
  const { data, error } = await supabase
    .from('classes')
    .select('*, lesson_types(label), fields(name), trainers(name)')
    .eq('status', 'active')
    .gte('day', from)
    .lte('day', to)
    .order('day')
    .order('start_min');
  if (error) throw error;
  return (data ?? []) as OwnerClass[];
}

/** Lunedì della settimana che contiene il giorno dato. */
export function mondayOf(d: Date) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  x.setHours(0, 0, 0, 0);
  return x;
}
