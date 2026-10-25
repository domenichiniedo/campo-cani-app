import { Redirect } from 'expo-router';

import { useSession } from '@/lib/session';

// Il link di attivazione (campocaniapp://attiva?codice=...) lo legge LicenseGate: qui si torna all'inizio.
// Questa schermata è anche quella di riserva quando "/" non è disponibile (Expo Router prende la schermata col
// nome più corto): chi deve completare un passo va dritto a quel passo, altrimenti "/" e "attiva" si
// rimanderebbero l'una all'altra senza fine.
export default function Attiva() {
  const { session, needsSignup, needsTerms, needsPhone, needsBilling } = useSession();
  if (session && needsSignup) return <Redirect href="/welcome" />;
  if (session && needsTerms) return <Redirect href="/terms" />;
  if (session && needsPhone) return <Redirect href="/phone" />;
  if (session && needsBilling) return <Redirect href="/billing" />;
  return <Redirect href="/" />;
}
