// Prove: deno test supabase/functions/nexi/
import { esito } from './esito.ts';

const uguale = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`atteso ${JSON.stringify(b)}, trovato ${JSON.stringify(a)}`);
};

Deno.test('esito di un ordine Nexi', () => {
  const op = (operationType: string, operationResult: string, operationAmount = '1500') => ({ operationId: 'op1', operationType, operationResult, operationAmount });
  // Contabilizzazione immediata: autorizzazione eseguita.
  uguale(esito({ orderStatus: { capturedAmount: '1500' }, operations: [op('AUTHORIZATION', 'EXECUTED')] }, 1500), { stato: 'paid', operazione: 'op1' });
  // Operazioni dentro orderStatus.
  uguale(esito({ orderStatus: { operations: [op('CAPTURE', 'EXECUTED')] } }, 1500), { stato: 'paid', operazione: 'op1' });
  // Solo autorizzata (contabilizzazione differita): non ancora pagata.
  uguale(esito({ orderStatus: { authorizedAmount: '1500', capturedAmount: '0' }, operations: [op('AUTHORIZATION', 'AUTHORIZED')] }, 1500), { stato: 'created', operazione: null });
  // Importo più basso: non vale.
  uguale(esito({ operations: [op('AUTHORIZATION', 'EXECUTED', '100')] }, 1500), { stato: 'created', operazione: null });
  // Carta rifiutata o 3DS fallito.
  uguale(esito({ operations: [op('AUTHORIZATION', 'DECLINED')] }, 1500), { stato: 'failed', operazione: null });
  uguale(esito({ operations: [op('AUTHORIZATION', 'THREEDS_FAILED')] }, 1500), { stato: 'failed', operazione: null });
  // Un tentativo rifiutato e poi uno riuscito: pagato.
  uguale(esito({ operations: [op('AUTHORIZATION', 'DECLINED'), { ...op('AUTHORIZATION', 'EXECUTED'), operationId: 'op2' }] }, 1500), { stato: 'paid', operazione: 'op2' });
  uguale(esito({}, 1500), { stato: 'created', operazione: null });
});
