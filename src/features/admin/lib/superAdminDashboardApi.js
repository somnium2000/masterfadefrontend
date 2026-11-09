import { http } from '../../../services/httpClient.js';

export function getSuperAdminDashboardSummary(params = {}, options = {}) {
  const query = new URLSearchParams();
  if (params.fecha_desde) query.set('fecha_desde', params.fecha_desde);
  if (params.fecha_hasta) query.set('fecha_hasta', params.fecha_hasta);
  const suffix = query.toString();
  return http.get(`/v1/admin/super-dashboard/summary${suffix ? `?${suffix}` : ''}`, {
    cache: false,
    dedupe: false,
    signal: options.signal,
  });
}
