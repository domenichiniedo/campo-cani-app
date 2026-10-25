// L'esito di un ordine letto da Nexi (GET /orders/{orderId}), senza database: così si prova da solo.

// deno-lint-ignore no-explicit-any
type Any = any;

export type Esito = { stato: 'paid' | 'failed' | 'created'; operazione: string | null };

/**
 * Pagato solo se Nexi ha un'operazione di pagamento riuscita (EXECUTED) per tutto l'importo, o se l'incassato copre
 * l'importo. Rifiutato se c'è un'operazione fallita e nessuna riuscita. Altrimenti ancora in corso.
 */
export function esito(r: Any, importo: number): Esito {
  const ops: Any[] = r?.operations ?? r?.orderStatus?.operations ?? [];
  const pagata = ops.find(
    (x) => ['AUTHORIZATION', 'CAPTURE'].includes(x.operationType) && x.operationResult === 'EXECUTED' && Number(x.operationAmount) >= importo,
  );
  if (pagata || Number(r?.orderStatus?.capturedAmount ?? 0) >= importo) return { stato: 'paid', operazione: pagata?.operationId ?? null };
  if (ops.some((x) => ['DECLINED', 'DENIED_BY_RISK', 'THREEDS_FAILED', 'FAILED', 'CANCELED'].includes(x.operationResult))) {
    return { stato: 'failed', operazione: null };
  }
  return { stato: 'created', operazione: null };
}
