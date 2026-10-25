import { useState } from 'react';

import { NewClass } from '@/components/new-class';
import { OwnerBook, type BookStart } from '@/components/owner-book';
import { Button } from '@/components/ui';
import { t } from '@/lib/i18n';
import { usePlan } from '@/lib/plans';
import { useSession } from '@/lib/session';

/**
 * "+ Prenota per un cliente" e "+ Nuova classe di gruppo" con le loro finestre, per il giorno e la settimana del
 * proprietario. `book` apre la prenotazione da un'altra parte dello schermo (una classe, una casella libera).
 */
export function useAddLesson(onDone: () => void) {
  const { settings } = useSession();
  const plan = usePlan();
  const [booking, setBooking] = useState<BookStart | null>(null);
  const [newClass, setNewClass] = useState<BookStart | null>(null);
  const done = () => {
    setBooking(null);
    setNewClass(null);
    onDone();
  };

  /** I due bottoni, che aprono le finestre sul giorno indicato all'ora di apertura. */
  const buttons = (day: string, fieldId?: string) => {
    const start = { day, start: settings?.open_min ?? 540, fieldId };
    return (
      <>
        <Button title={t('+ Prenota per un cliente')} onPress={() => setBooking(start)} />
        {plan.groups && <Button kind="ghost" title={t('+ Nuova classe di gruppo')} onPress={() => setNewClass(start)} />}
      </>
    );
  };

  const dialogs = (
    <>
      <NewClass start={newClass} onClose={() => setNewClass(null)} onDone={done} />
      <OwnerBook start={booking} onClose={() => setBooking(null)} onDone={done} />
    </>
  );

  return { book: setBooking, buttons, dialogs };
}
