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
    return normalizeBookingCreationResult({
      request_id: makePreviewId('preview_request'),
      id_grupo_cita: makePreviewId('preview_group'),
      estado_grupo_codigo: 'simulado',
      expires_at: expiresAt,
      subtotal_hnl: totalHnl,
      descuento_total_hnl: 0,
      total_pagar_hnl: totalHnl,
      extras_a_pagar_hnl: totalHnl,
      bloques: blocks,
    });
  },
});

export default previewBookingAdapter;
