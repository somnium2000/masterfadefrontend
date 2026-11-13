import { useEffect } from 'react';

export default function useRefreshOnReturn(refresh, enabled) {
  useEffect(() => {
    if (!enabled) return;
    let timer;
    const schedule = () => {
      if (document.visibilityState === 'hidden') return;
      clearTimeout(timer);
      // AM: Agrupa focus/visibility del regreso de la pasarela en una sola lectura.
      timer = setTimeout(() => void refresh({ silent: true }), 100);
    };
    const restored = event => { if (event.persisted) schedule(); };
    window.addEventListener('focus', schedule);
    window.addEventListener('pageshow', restored);
    document.addEventListener('visibilitychange', schedule);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', schedule);
      window.removeEventListener('pageshow', restored);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [refresh, enabled]);
}
