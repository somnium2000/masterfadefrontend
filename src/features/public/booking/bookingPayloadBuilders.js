import {
  normalizePhone,
  normalizePromotionIds,
} from './bookingUtils.js';

function safeText(value) {
  return String(value || '').trim();
}

function safeEmail(value) {
  return safeText(value).toLowerCase();
}

function withRewardContext(payload, rewardContextToken) {
  const token = safeText(rewardContextToken);
  if (!token) return payload;
  return {
    ...payload,
    canje_context_token: token,
  };
}

export function buildPublicBookingPromotionPayload({
  promotionId,
  promotion,
  blockPromotionId = '',
  blockPromotionRuleId = '',
  blockLegacyRuleId = '',
} = {}) {
  const normalizedPromotionId = safeText(promotionId);
  const legacyPromotionId = safeText(blockPromotionId);
  const promotionRuleId = safeText(
    promotion?.id_promocion_regla
    || (normalizedPromotionId === legacyPromotionId ? blockPromotionRuleId : '')
    || (normalizedPromotionId === legacyPromotionId ? blockLegacyRuleId : '')
    || ''
  );
  if (!normalizedPromotionId || !promotionRuleId) return null;
  return {
    id_promocion: normalizedPromotionId,
    id_promocion_regla: promotionRuleId,
  };
}

export function buildBookingMemberPayload({
  block,
  blockContactState,
  bookingMode,
  fechaInicio,
  hasResolvedBarber = false,
  resolvedBarberId = null,
} = {}) {
  const normalizedBlock = block && typeof block === 'object' ? block : {};
  const contact = blockContactState && typeof blockContactState === 'object' ? blockContactState : {};
  const isPublicBooking = bookingMode === 'public';
  const selectionType = normalizedBlock.selection_type;
  const integrantePayload = {
    orden_integrante: Number(normalizedBlock.index || 0) + 1,
    alias: contact.fullName || normalizedBlock.alias,
    id_barbero: hasResolvedBarber ? resolvedBarberId : (normalizedBlock.idBarbero || null),
    selection_type: selectionType,
    id_paquete: ['package', 'mixed'].includes(selectionType)
      ? (normalizedBlock.selectedPackage?.id_paquete || null)
      : null,
    fecha_inicio: fechaInicio,
    servicios: ['services', 'mixed'].includes(selectionType) && Array.isArray(normalizedBlock.selectedServices)
      ? normalizedBlock.selectedServices.map((service) => ({
        id_servicio: service.id_servicio,
      }))
      : [],
  };

  if (!isPublicBooking) return integrantePayload;

  integrantePayload.rol_integrante_codigo = Number(normalizedBlock.index || 0) === 0
    ? 'titular'
    : 'acompanante';

  const blockPromotionIds = normalizePromotionIds(normalizedBlock.promotionIds, normalizedBlock.promotionId);
  if (blockPromotionIds.length > 0) {
    const promotionsById = new Map(
      (Array.isArray(normalizedBlock.selectedPromotions) ? normalizedBlock.selectedPromotions : [])
        .map((promotion) => [safeText(promotion?.id_promocion), promotion])
        .filter(([idPromocion]) => Boolean(idPromocion))
    );
    const requestedPromotions = [];
    const requestedPromotionKeys = new Set();
    for (const promotionId of blockPromotionIds) {
      const promotion = promotionsById.get(promotionId)
        || (safeText(normalizedBlock.selectedPromotion?.id_promocion) === promotionId
          ? normalizedBlock.selectedPromotion
          : null);
      const promotionPayload = buildPublicBookingPromotionPayload({
        promotionId,
        promotion,
        blockPromotionId: normalizedBlock.promotionId,
        blockPromotionRuleId: normalizedBlock.promotionRuleId,
        blockLegacyRuleId: normalizedBlock.id_promocion_regla,
      });
      if (!promotionPayload) continue;
      const key = `${promotionPayload.id_promocion}:${promotionPayload.id_promocion_regla}`;
      if (requestedPromotionKeys.has(key)) continue;
      requestedPromotionKeys.add(key);
      requestedPromotions.push(promotionPayload);
    }
    if (requestedPromotions.length > 0) {
      integrantePayload.promociones = requestedPromotions;
    }
  }

  integrantePayload.contacto = {
    nombre: safeText(contact.fullName || normalizedBlock.alias),
    nombres: safeText(contact.firstName) || null,
    apellidos: safeText(contact.lastName) || null,
    email: safeEmail(contact.email) || null,
    telefono: safeText(contact.phone) || null,
  };

  return integrantePayload;
}

export function buildPublicHoldPayload({
  idSucursal,
  integrantes,
  titularNombre,
  titularEmail,
  titularTelefono,
  rewardContextToken = '',
} = {}) {
  return withRewardContext({
    id_sucursal: idSucursal,
    integrantes,
    titular: {
      nombre: titularNombre,
      email: titularEmail,
      telefono: normalizePhone(titularTelefono),
    },
  }, rewardContextToken);
}

export function buildAuthenticatedHoldPayload({
  idSucursal,
  integrantes,
  titularState,
  normalizedTitularBlock,
  guardarNombresApellidos = false,
  guardarTelefono = false,
  rewardContextToken = '',
} = {}) {
  const missingFields = Array.isArray(titularState?.missingFields)
    ? titularState.missingFields
    : [];
  const titularBlock = normalizedTitularBlock && typeof normalizedTitularBlock === 'object'
    ? normalizedTitularBlock
    : {};
  return withRewardContext({
    id_sucursal: idSucursal,
    integrantes,
    titular: {
      nombres: missingFields.includes('nombres')
        ? (titularBlock.contactFirstName || null)
        : null,
      apellidos: missingFields.includes('apellidos')
        ? (titularBlock.contactLastName || null)
        : null,
      telefono: missingFields.includes('telefono_principal')
        ? (normalizePhone(titularBlock.contactPhone || '') || null)
        : null,
      guardar_nombres_apellidos: guardarNombresApellidos,
      guardar_telefono: guardarTelefono,
    },
  }, rewardContextToken);
}

export function buildReleaseHoldPayload(releaseToken) {
  return {
    release_token: safeText(releaseToken),
  };
}

export function buildCreatePaymentIntentPayload({
  groupId,
  titularEmail,
  titularContact,
} = {}) {
  const contact = titularContact && typeof titularContact === 'object' ? titularContact : {};
  return {
    id_grupo_cita: safeText(groupId),
    titular_email: safeEmail(titularEmail),
    nombre_apellido: safeText(contact.fullName) || null,
    telefono: normalizePhone(contact.phone || '') || null,
  };
}

export function buildPaymentStatusParams({
  groupId,
  intentId,
  titularEmail,
} = {}) {
  return {
    id_grupo_cita: safeText(groupId),
    id_intent: safeText(intentId),
    titular_email: safeEmail(titularEmail),
  };
}

export function buildPaymentContextPayload({
  groupId,
  intentId,
  titularEmail,
  paymentIntent,
} = {}) {
  return {
    id_grupo_cita: safeText(groupId),
    id_intent: safeText(intentId),
    titular_email: safeEmail(titularEmail),
    paymentIntent: paymentIntent && typeof paymentIntent === 'object'
      ? paymentIntent
      : null,
  };
}

export function buildMockPaymentPayload({
  groupId,
  intentId,
  titularEmail,
  status = 'paid',
} = {}) {
  return {
    ...buildPaymentStatusParams({ groupId, intentId, titularEmail }),
    status,
  };
}

export function buildSimulatorPaymentPayload({
  groupId,
  intentId,
  titularEmail,
  status = 'success',
  amountForSimulation = null,
} = {}) {
  const amount = Number(amountForSimulation);
  return {
    ...buildPaymentStatusParams({ groupId, intentId, titularEmail }),
    status,
    ...(Number.isFinite(amount) && amount > 0 ? { monto_prueba_hnl: amount } : {}),
  };
}

export function buildConfirmWithoutPaymentPayload({ rewardContextToken = '' } = {}) {
  const token = safeText(rewardContextToken);
  return token ? { canje_context_token: token } : {};
}
