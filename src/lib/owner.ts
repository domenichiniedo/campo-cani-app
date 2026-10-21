import { supabase } from '@/lib/supabase';
import type { Booking } from '@/lib/types';

export type OwnerBooking = Booking & {
  profiles: { first_name: string; last_name: string; phone: string } | null;
  dogs: { name: string; breed: string; blocked: boolean } | null;
  lesson_types: { label: string } | null;
  penalties: { id: string }[];
};

/** Prenotazioni attive tra due giorni, con cliente, cane e penalità già date. */
export async function ownerBookings(from: string, to: string) {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, profiles(first_name, last_name, phone), dogs(name, breed, blocked), lesson_types(label), penalties(id)')
    .eq('status', 'active')
    .gte('day', from)
    .lte('day', to)
    .order('day')
    .order('start_min');
  if (error) throw error;
  return (data ?? []) as OwnerBooking[];
}

/** Lunedì della settimana che contiene il giorno dato. */
export function mondayOf(d: Date) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  x.setHours(0, 0, 0, 0);
  return x;
}
