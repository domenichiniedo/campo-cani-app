import { Redirect } from 'expo-router';

// Il link di attivazione (campocaniapp://attiva?codice=...) lo legge LicenseGate: qui si torna all'inizio.
export default function Attiva() {
  return <Redirect href="/" />;
}
