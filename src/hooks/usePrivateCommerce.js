import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { http } from '../services/httpClient.js';

export default function usePrivateCommerce() {
  const { user, isAuthenticated, isHydrating } = useAuth();
  const identity = isAuthenticated ? user?.id_usuario : null;
  const identityKey = identity || (isAuthenticated ? 'unresolved' : 'guest');
  const [confirmed, setConfirmed] = useState(null);
  if (confirmed && confirmed.identity !== identityKey) setConfirmed(null);
  useEffect(() => {
    if (isHydrating) return undefined;
    const controller = new AbortController();
    let generation = 0;
    const refresh = async () => {
      const current = ++generation;
      try {
        const response = await http.get('/v1/commerce/eligibility', {
          signal: controller.signal, cache: false, dedupe: false, skipAuthInvalidation: true,
        });
        if (!controller.signal.aborted && current === generation) setConfirmed({ identity: identityKey, data: response?.data });
      } catch {
        if (!controller.signal.aborted && current === generation) setConfirmed({ identity: identityKey, data: null });
      }
    };
    void refresh();
    window.addEventListener('focus', refresh);
    return () => { controller.abort(); window.removeEventListener('focus', refresh); };
  }, [identityKey, isHydrating]);
  // AM: A previous user's eligibility must never survive logout or identity changes.
  const data = confirmed?.identity === identityKey ? confirmed.data : null;
  // AM: Keep a settled decision during same-identity refresh; explicit denial or errors revoke it.
  return { booking: Boolean(identity) && data?.booking === true,
    vipPurchase: Boolean(identity) && data?.vipPurchase === true,
    publicBooking: data?.publicBooking === true, publicVipPurchase: data?.publicVipPurchase === true,
    checking: Boolean(isHydrating || confirmed?.identity !== identityKey) };
}
