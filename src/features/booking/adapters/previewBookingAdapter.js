import { normalizeBookingActor, normalizeBookingCreationResult } from '../core/bookingModels.js';

function makePreviewId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}`;
}

export const previewBookingAdapter = Object.freeze({
  actor: normalizeBookingActor({ type: 'preview' }),
  writesBackend: false,
  requiresContact: true,
  supportsMembership: false,
  supportsRewards: false,
  async createHold({ totalHnl = 0, blocks = [], holdDurationMin = 5 } = {}) {
    const expiresAt = new Date(Date.now() + Math.max(1, Number(holdDurationMin || 5)) * 60 * 1000).toISOString();
    const requestId = makePreviewId('preview_request');
    const groupId = makePreviewId('preview_group');
    const total = Number(Math.max(0, Number(totalHnl || 0)).toFixed(2));
    const canonicalResult = normalizeBookingCreationResult({
      request_id: requestId,
      id_grupo_cita: groupId,
      estado_grupo_codigo: 'simulado',
      expires_at: expiresAt,
      subtotal_hnl: total,
      descuento_total_hnl: 0,
      total_pagar_hnl: total,
      extras_a_pagar_hnl: total,
      monto_total_hnl: total,
      total_hnl: total,
      bloques: blocks,
    });
    return Object.freeze({
      ...canonicalResult,
      request_id: requestId,
      id_grupo_cita: groupId,
      estado_grupo_codigo: 'simulado',
      expires_at: expiresAt,
      subtotal_hnl: total,
      descuento_total_hnl: 0,
      total_pagar_hnl: total,
      extras_a_pagar_hnl: total,
      monto_total_hnl: total,
      total_hnl: total,
      bloques: blocks,
    });
  },
});

export default previewBookingAdapter;
