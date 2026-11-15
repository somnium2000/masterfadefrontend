import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { http } from '../services/httpClient.js';
import { requiresExplicitPixelPaySaleAuthorization, isQaPixelPay3dsDiagnosticAuthorized } from '../features/payments/pixelPaySaleCapability.js';

export default function usePrivateCommerce() {
  const { user, isAuthenticated, isHydrating } = useAuth();
  const identity = isAuthenticated && !isHydrating ? user?.id_usuario : null;
  const explicitSaleRequired = requiresExplicitPixelPaySaleAuthorization();
  const [confirmed, setConfirmed] = useState(null);
  const [refreshing, setRefreshing] = useState(null);
  if (confirmed && confirmed.identity !== identity) setConfirmed(null);
  useEffect(() => {
    if (!identity) return undefined;
    const controller = new AbortController();
    let generation = 0;
    const refresh = async () => {
      const current = ++generation;
      setRefreshing({ identity, generation: current });
      try {
        const response = await http.get('/v1/commerce/eligibility', {
          signal: controller.signal, cache: false, dedupe: false, skipAuthInvalidation: true,
        });
        if (!controller.signal.aborted && current === generation) setConfirmed({ identity, data: response?.data });
      } catch {
        if (!controller.signal.aborted && current === generation) {
          // AM: Preserve QA checkout context on refresh failure, but revoke any Sale grant.
          setConfirmed(previous => ({ identity, data: explicitSaleRequired && previous?.identity === identity
            && previous.data?.booking === true ? { ...previous.data, pixelpaySale: false, pixelpay3dsDiagnostic: false } : null }));
        }
      } finally {
        if (!controller.signal.aborted) {
          setRefreshing((active) => (
            active?.identity === identity && active?.generation === current ? null : active
          ));
        }
      }
    };
    void refresh();
    window.addEventListener('focus', refresh);
    return () => { controller.abort(); window.removeEventListener('focus', refresh); };
  }, [identity, explicitSaleRequired]);
  // AM: A previous user's eligibility must never survive logout or identity changes.
  const data = identity && confirmed?.identity === identity ? confirmed.data : null;
  const checking = Boolean(identity && (
    confirmed?.identity !== identity || refreshing?.identity === identity
  ));
  return { booking: data?.booking === true, vipPurchase: data?.vipPurchase === true,
    pixelpay3dsDiagnostic: !checking && data?.booking === true
      && isQaPixelPay3dsDiagnosticAuthorized(data?.pixelpay3dsDiagnostic),
    ...(explicitSaleRequired ? { pixelpaySale: !checking && data?.booking === true && data?.pixelpaySale === true }
      : typeof data?.pixelpaySale === 'boolean' ? { pixelpaySale: data.pixelpaySale } : {}),
    checking };
}
