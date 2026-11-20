import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { http } from '../services/httpClient.js';
import { requiresExplicitPixelPaySaleAuthorization } from '../features/payments/pixelPaySaleCapability.js';

export default function usePrivateCommerce() {
  const { user, isAuthenticated, isHydrating } = useAuth();
  const identity = isAuthenticated && !isHydrating ? user?.id_usuario : null;
  const identityKey = identity || (isAuthenticated ? 'unresolved' : 'guest');
  const explicitSaleRequired = requiresExplicitPixelPaySaleAuthorization();
  const [confirmed, setConfirmed] = useState(null);
  const [refreshing, setRefreshing] = useState(null);
  if (confirmed && confirmed.identity !== identityKey) setConfirmed(null);
  useEffect(() => {
    if (isHydrating) return undefined;
    const controller = new AbortController();
    let generation = 0;
    const refresh = async () => {
      const current = ++generation;
      setRefreshing({ identity: identityKey, generation: current });
      try {
        const response = await http.get('/v1/commerce/eligibility', {
          signal: controller.signal, cache: false, dedupe: false, skipAuthInvalidation: true,
        });
        if (!controller.signal.aborted && current === generation) setConfirmed({ identity: identityKey, data: response?.data });
      } catch {
        if (!controller.signal.aborted && current === generation) {
          // AM: Preserve QA checkout context on refresh failure, but revoke any Sale grant.
          setConfirmed(previous => ({ identity: identityKey, data: explicitSaleRequired && previous?.identity === identityKey
            && previous.data?.booking === true ? { ...previous.data, pixelpaySale: false, pixelpay3dsDiagnostic: false, pixelpaySongbirdBridge: false } : null }));
        }
      } finally {
        if (!controller.signal.aborted) {
          setRefreshing((active) => (
            active?.identity === identityKey && active?.generation === current ? null : active
          ));
        }
      }
    };
    void refresh();
    window.addEventListener('focus', refresh);
    return () => { controller.abort(); window.removeEventListener('focus', refresh); };
  }, [identityKey, isHydrating, explicitSaleRequired]);
  // AM: A previous user's eligibility must never survive logout or identity changes.
  const data = !isHydrating && confirmed?.identity === identityKey ? confirmed.data : null;
  const checking = Boolean(isHydrating || confirmed?.identity !== identityKey
    || (identity && refreshing?.identity === identityKey));
  return { booking: Boolean(identity) && data?.booking === true, vipPurchase: Boolean(identity) && data?.vipPurchase === true,
    publicBooking: data?.publicBooking === true, publicVipPurchase: data?.publicVipPurchase === true,
    // AM: Retired experimental capabilities stay closed even against an older QA backend.
    pixelpaySongbirdBridge: false,
    pixelpay3dsDiagnostic: false,
    ...(explicitSaleRequired ? { pixelpaySale: !checking && Boolean(identity) && data?.booking === true && data?.pixelpaySale === true }
      : identity && typeof data?.pixelpaySale === 'boolean' ? { pixelpaySale: data.pixelpaySale } : {}),
    ...(identity && typeof data?.pixelpayPublic3dsRequired === 'boolean'
      ? { pixelpayPublic3dsRequired: data.pixelpayPublic3dsRequired } : {}),
    ...(identity && typeof data?.pixelpayPublic3ds === 'boolean'
      ? { pixelpayPublic3ds: !checking && data.pixelpayPublic3ds } : {}),
    checking };
}
