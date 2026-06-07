import { normalizePromotionIds } from './bookingUtils.js';

function safeText(value) {
  return String(value || '').trim();
}

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function resolveActiveBookingBlock({
  bookingBlocks,
  activeBlockIndex,
} = {}) {
  const blocks = Array.isArray(bookingBlocks) ? bookingBlocks : [];
  const requestedIndex = Number(activeBlockIndex || 0);
  const effectiveActiveBlockIndex = blocks[requestedIndex] ? requestedIndex : 0;
  const activeBlock = blocks[effectiveActiveBlockIndex] || null;
  return {
    effectiveActiveBlockIndex,
    activeBlock,
    selectedBarberId: blocks[0]?.idBarbero || '',
    activeBlockBarberId: activeBlock?.idBarbero || '',
    selectionType: activeBlock?.selectionType || 'services',
    selectedPackageId: activeBlock?.packageId || '',
    serviceIds: Array.isArray(activeBlock?.serviceIds) ? activeBlock.serviceIds : [],
    selectedDate: activeBlock?.selectedDate || '',
    selectedTime: activeBlock?.selectedTime || '',
    titularSelectedDate: blocks[0]?.selectedDate || '',
  };
}

export function resolveItemsById(items, idField) {
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const id = safeText(item?.[idField]);
    if (!id) return;
    map.set(id, item);
  });
  return map;
}

export function resolveSelectedPromotions({
  activeBlock,
  promotionsById,
} = {}) {
  const selectedPromotionIds = normalizePromotionIds(activeBlock?.promotionIds, activeBlock?.promotionId);
  const selectedPromotionId = selectedPromotionIds[0] || '';
  const selectedPromotion = promotionsById?.get(selectedPromotionId) || null;
  const selectedPromotions = selectedPromotionIds
    .map((promotionId) => promotionsById?.get(promotionId) || null)
    .filter(Boolean);
  return {
    selectedPromotionIds,
    selectedPromotionId,
    selectedPromotion,
    selectedPromotions,
  };
}

export function resolveRequestedPromotionIds(blocks) {
  const requestedPromotionIds = new Set();
  (Array.isArray(blocks) ? blocks : []).forEach((block) => {
    normalizePromotionIds(block?.promotionIds, block?.promotionId)
      .forEach((id) => requestedPromotionIds.add(id));
  });
  return requestedPromotionIds;
}

export function resolveBookingTotals(bookingBlocksSummary) {
  const blocks = Array.isArray(bookingBlocksSummary) ? bookingBlocksSummary : [];
  const totalToPay = blocks.reduce((total, block) => total + safeNumber(block?.total_hnl), 0);
  const totalEstimatedPromotionDiscountHnl = blocks.reduce(
    (total, block) => total + safeNumber(block?.promocion_descuento_estimado_hnl),
    0
  );
  return {
    totalToPay,
    totalEstimatedPromotionDiscountHnl,
    totalEstimatedToPay: Math.max(0, totalToPay - totalEstimatedPromotionDiscountHnl),
  };
}

export function resolveHoldPricing(holdResult) {
  if (!holdResult || typeof holdResult !== 'object') return null;

  const subtotal = safeNumber(holdResult?.subtotal_hnl ?? holdResult?.monto_total_hnl);
  const coveredByPlan = safeNumber(holdResult?.membresia?.cubierto_por_plan_hnl);
  const coveredByReward = safeNumber(holdResult?.recompensa?.cubierto_hnl);
  const coveredTotal = safeNumber(holdResult?.descuento_total_hnl, coveredByPlan + coveredByReward);
  const total = safeNumber(
    holdResult?.total_pagar_hnl
    ?? holdResult?.monto_pendiente_hnl
    ?? holdResult?.total_hnl
  );
  const extras = safeNumber(
    holdResult?.recompensa?.extras_a_pagar_hnl
    ?? holdResult?.membresia?.extras_a_pagar_hnl
    ?? holdResult?.monto_pendiente_hnl
    ?? total
  );

  return {
    source: 'hold',
    subtotal_hnl: subtotal,
    cubierto_por_plan_hnl: coveredByPlan,
    cubierto_por_recompensa_hnl: coveredByReward,
    cubierto_total_hnl: coveredTotal,
    extras_a_pagar_hnl: extras,
    total_pagar_hnl: total,
    recompensa_aplicada: Boolean(holdResult?.recompensa?.aplicada),
    recompensa_servicio_nombre: safeText(holdResult?.recompensa?.servicio_nombre),
    recompensa_mensaje: safeText(holdResult?.recompensa?.mensaje),
  };
}

export function resolveHoldTotalToPay({
  holdPricing,
  holdResult,
} = {}) {
  return safeNumber(
    holdPricing?.total_pagar_hnl
    ?? holdResult?.total_pagar_hnl
    ?? holdResult?.total_hnl
  );
}

export function resolveConfirmWithoutPaymentState({
  canUseClienteHold,
  holdResult,
  holdTotalToPay,
} = {}) {
  return Boolean(
    canUseClienteHold
    && holdResult
    && safeText(holdResult?.id_grupo_cita)
    && holdTotalToPay === 0
  );
}

export function resolveHoldCountdownState({
  holdResult,
  paymentIntent,
  countdownNow,
} = {}) {
  const holdExpiresAtIso = holdResult?.expires_at || paymentIntent?.expires_at || null;
  if (!holdExpiresAtIso) {
    return {
      holdExpiresAtIso: null,
      holdRemainingMs: null,
      holdExpired: false,
    };
  }
  const expiresAt = new Date(holdExpiresAtIso);
  if (Number.isNaN(expiresAt.getTime())) {
    return {
      holdExpiresAtIso,
      holdRemainingMs: null,
      holdExpired: false,
    };
  }
  const holdRemainingMs = Math.max(expiresAt.getTime() - safeNumber(countdownNow), 0);
  return {
    holdExpiresAtIso,
    holdRemainingMs,
    holdExpired: holdRemainingMs <= 0,
  };
}
