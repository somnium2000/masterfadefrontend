import {
  BOOKING_COMPANION_ALIAS_PREFIX,
  BOOKING_HOLDER_ALIAS,
} from '../constants/bookingDefaults.js';
import {
  buildFullName,
  normalizeEmail,
  normalizePersonName,
  normalizePromotionIds,
  splitFullName,
} from '../bookingUtils.js';

export function toPromotionNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function evaluatePromotionForBlock({ block, promotion, servicesById, packagesById }) {
  if (!promotion) {
    return {
      canSelect: false,
      isTargetSelected: false,
      disabledReason: '',
      targetName: '',
      targetPrice: 0,
      estimatedDiscount: 0,
      requiresFinalCalculation: false,
    };
  }

  const appliesTo = String(promotion?.aplica_a || '').trim().toLowerCase();
  const mechanic = String(promotion?.mecanica || '').trim().toLowerCase();
  const targetServiceId = String(promotion?.id_servicio_objetivo || '').trim();
  const targetPackageId = String(promotion?.id_paquete_objetivo || '').trim();
  const selectedServiceIds = Array.isArray(block?.serviceIds) ? block.serviceIds : [];
  const selectedPackageId = String(block?.packageId || '').trim();
  const targetService = targetServiceId ? servicesById.get(targetServiceId) || null : null;
  const targetPackage = targetPackageId ? packagesById.get(targetPackageId) || null : null;

  let isTargetSelected = false;
  let targetName = '';
  let targetPrice = 0;
  if (appliesTo === 'servicio') {
    isTargetSelected = Boolean(targetServiceId && selectedServiceIds.includes(targetServiceId));
    targetName = String(targetService?.nombre_servicio || promotion?.servicio_objetivo_nombre || 'servicio').trim();
    targetPrice = toPromotionNumber(targetService?.precio_hnl);
  } else if (appliesTo === 'paquete') {
    isTargetSelected = Boolean(targetPackageId && selectedPackageId && selectedPackageId === targetPackageId);
    targetName = String(targetPackage?.nombre_paquete || promotion?.paquete_objetivo_nombre || 'paquete').trim();
    targetPrice = toPromotionNumber(targetPackage?.precio_hnl);
  }

  const discountValue = toPromotionNumber(promotion?.valor_descuento);
  let estimatedDiscount = 0;
  let requiresFinalCalculation = false;
  if (isTargetSelected) {
    if (mechanic === 'porcentaje') {
      estimatedDiscount = (targetPrice * discountValue) / 100;
    } else if (mechanic === 'monto_fijo') {
      estimatedDiscount = Math.min(targetPrice, discountValue);
    } else if (mechanic === 'dos_por_uno') {
      requiresFinalCalculation = true;
      estimatedDiscount = 0;
    }
  }

  const safeDiscount = Number.isFinite(estimatedDiscount) ? Math.max(0, Math.min(estimatedDiscount, targetPrice)) : 0;
  const disabledReason = isTargetSelected
    ? ''
    : `Requiere seleccionar ${targetName || (appliesTo === 'paquete' ? 'el paquete objetivo' : 'el servicio objetivo')}`;

  return {
    canSelect: isTargetSelected,
    isTargetSelected,
    disabledReason,
    targetName,
    targetPrice,
    estimatedDiscount: safeDiscount,
    requiresFinalCalculation,
  };
}

export function createBlockId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `blk-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function areServiceIdsEqual(left, right) {
  if (left === right) return true;
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export function normalizeBookingBlock(block, index) {
  const fallbackAlias = index === 0 ? BOOKING_HOLDER_ALIAS : `${BOOKING_COMPANION_ALIAS_PREFIX} ${index}`;
  const nextServiceIds = Array.isArray(block?.serviceIds)
    ? Array.from(new Set(block.serviceIds.map((id) => String(id || '').trim()).filter(Boolean)))
    : [];
  const promotionIds = normalizePromotionIds(block?.promotionIds, block?.promotionId);
  const promotionId = promotionIds[0] || '';

  const splitLegacyName = splitFullName(block?.contactName || '');
  const contactFirstName = normalizePersonName(block?.contactFirstName || splitLegacyName.firstName || '');
  const contactLastName = normalizePersonName(block?.contactLastName || splitLegacyName.lastName || '');
  const contactName = buildFullName(contactFirstName, contactLastName) || normalizePersonName(block?.contactName || '');
  const resolvedAlias = contactName || String(block?.alias || '').trim() || fallbackAlias;

  const hasPackage = Boolean(String(block?.packageId || '').trim());
  const requestedType = String(block?.selectionType || '').trim().toLowerCase();
  let normalizedSelectionType = 'services';
  if (requestedType === 'mixed' || (hasPackage && nextServiceIds.length > 0)) {
    normalizedSelectionType = 'mixed';
  } else if (requestedType === 'package' || hasPackage) {
    normalizedSelectionType = 'package';
  }

  return {
    id: String(block?.id || '').trim() || createBlockId(),
    alias: resolvedAlias,
    idBarbero: String(block?.idBarbero || '').trim(),
    selectionType: normalizedSelectionType,
    packageId: String(block?.packageId || '').trim(),
    serviceIds: nextServiceIds,
    promotionId,
    promotionIds,
    selectedDate: String(block?.selectedDate || '').trim(),
    selectedTime: String(block?.selectedTime || '').trim(),
    selectedDateTime: String(block?.selectedDateTime || '').trim(),
    contactFirstName,
    contactLastName,
    contactName,
    contactEmail: normalizeEmail(block?.contactEmail || ''),
    contactPhone: String(block?.contactPhone || '').trim(),
  };
}

export function areBlocksEqual(left, right) {
  if (!left || !right) return false;
  return left.id === right.id
    && left.alias === right.alias
    && left.idBarbero === right.idBarbero
    && left.selectionType === right.selectionType
    && left.packageId === right.packageId
    && left.promotionId === right.promotionId
    && areServiceIdsEqual(left.promotionIds, right.promotionIds)
    && left.selectedDate === right.selectedDate
    && left.selectedTime === right.selectedTime
    && left.selectedDateTime === right.selectedDateTime
    && left.contactFirstName === right.contactFirstName
    && left.contactLastName === right.contactLastName
    && left.contactName === right.contactName
    && left.contactEmail === right.contactEmail
    && left.contactPhone === right.contactPhone
    && areServiceIdsEqual(left.serviceIds, right.serviceIds);
}

export function createBookingBlock({ alias = '', idBarbero = '' } = {}) {
  return normalizeBookingBlock(
    {
      id: createBlockId(),
      alias,
      idBarbero,
      selectionType: 'services',
      packageId: '',
      serviceIds: [],
      promotionId: '',
      promotionIds: [],
      selectedDate: '',
      selectedTime: '',
      selectedDateTime: '',
      contactFirstName: '',
      contactLastName: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
    },
    alias === BOOKING_HOLDER_ALIAS ? 0 : 1
  );
}

export function normalizeMembershipServiceId(value) {
  return String(value || '').trim();
}

export function getMembershipBenefitItems(planActivo) {
  if (!planActivo || typeof planActivo !== 'object') return [];
  const benefitSources = [
    planActivo?.beneficios_snapshot,
    planActivo?.plan_snapshot?.beneficios,
    planActivo?.beneficios,
  ];
  for (const source of benefitSources) {
    if (!source) continue;
    if (Array.isArray(source)) return source;
    if (Array.isArray(source?.items)) return source.items;
    if (Array.isArray(source?.servicios) || Array.isArray(source?.cortesias)) {
      return [
        ...(Array.isArray(source?.servicios) ? source.servicios : []),
        ...(Array.isArray(source?.cortesias) ? source.cortesias : []),
      ];
    }
  }
  return [];
}

export function extractPlanIncludedServiceIds(planActivo) {
  const items = getMembershipBenefitItems(planActivo);
  return Array.from(
    new Set(
      items
        .filter((item) => String(item?.tipo || '').trim().toLowerCase() === 'servicio')
        .map((item) => normalizeMembershipServiceId(item?.id_servicio))
        .filter(Boolean)
    )
  );
}

export function extractPlanRemainingServiceIds(planActivo) {
  const remanentes = Array.isArray(planActivo?.remanentes?.servicios)
    ? planActivo.remanentes.servicios
    : [];
  return Array.from(
    new Set(
      remanentes
        .filter((item) => Number(item?.restante || 0) > 0)
        .map((item) => normalizeMembershipServiceId(item?.id_servicio))
        .filter(Boolean)
    )
  );
}

export function extractConfirmedAppointments(payload) {
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  if (Array.isArray(safePayload?.citas_confirmadas)) return safePayload.citas_confirmadas;
  if (Array.isArray(safePayload?.citas)) return safePayload.citas;
  if (Array.isArray(safePayload?.data?.citas_confirmadas)) return safePayload.data.citas_confirmadas;
  if (Array.isArray(safePayload?.data?.citas)) return safePayload.data.citas;
  if (Array.isArray(safePayload?.confirmation?.citas_confirmadas)) return safePayload.confirmation.citas_confirmadas;
  if (Array.isArray(safePayload?.confirmation?.citas)) return safePayload.confirmation.citas;
  return [];
}

export function extractBookingCode(payload) {
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  const candidates = [
    safePayload?.codigo_cita,
    safePayload?.data?.codigo_cita,
    safePayload?.confirmation?.codigo_cita,
    safePayload?.confirmation?.data?.codigo_cita,
  ];
  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    if (normalized) return normalized;
  }
  const citasConfirmadas = extractConfirmedAppointments(safePayload);
  for (const cita of citasConfirmadas) {
    const normalized = String(cita?.codigo_cita || '').trim();
    if (normalized) return normalized;
  }
  return '';
}
