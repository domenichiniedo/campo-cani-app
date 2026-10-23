import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * Chiama `fn` quando l'app torna in primo piano e, con `every`, ogni `every` millisecondi mentre è aperta:
 * così cambi fatti da altri (un nuovo ruolo, una lezione prenotata, una licenza rinnovata) arrivano senza
 * chiudere e riaprire l'app.
 */
export function useWhenActive(fn: () => void, every?: number) {
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });
  useEffect(() => {
    let last = AppState.currentState;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && last !== 'active') latest.current();
      last = state;
    });
    const timer = every ? setInterval(() => AppState.currentState === 'active' && latest.current(), every) : undefined;
    return () => {
      sub.remove();
      if (timer) clearInterval(timer);
    };
  }, [every]);
}

/** Nuovo valore solo se è cambiato davvero: chi dipende da quel dato non si ricarica per niente. */
export const sameOr = <T,>(next: T) => (prev: T) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
