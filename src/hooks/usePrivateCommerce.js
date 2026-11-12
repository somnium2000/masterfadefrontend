import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { http } from '../services/httpClient.js';

export default function usePrivateCommerce() {
  const { user, isAuthenticated, isHydrating } = useAuth();
  const identity = isAuthenticated && !isHydrating ? user?.id_usuario : null;
  const [confirmed, setConfirmed] = useState(null);
  if (confirmed && confirmed.identity !== identity) setConfirmed(null);
  useEffect(() => {
    if (!identity) return undefined;
    const controller = new AbortController();
    let generation = 0;
    const refresh = async () => {
      const current = ++generation;
      setConfirmed(null);
      try {
        const response = await http.get('/v1/commerce/eligibility', {
          signal: controller.signal, cache: false, dedupe: false, skipAuthInvalidation: true,
        });
        if (!controller.signal.aborted && current === generation) setConfirmed({ identity, data: response?.data });
      } catch {
        if (!controller.signal.aborted && current === generation) setConfirmed({ identity, data: null });
      }
    };
    void refresh();
    window.addEventListener('focus', refresh);
    return () => { controller.abort(); window.removeEventListener('focus', refresh); };
  }, [identity]);
  // AM: A previous user's eligibility must never survive logout or identity changes.
  const data = identity && confirmed?.identity === identity ? confirmed.data : null;
  return { booking: data?.booking === true, vipPurchase: data?.vipPurchase === true,
    checking: Boolean(identity && confirmed?.identity !== identity) };
}
