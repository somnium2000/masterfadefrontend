import { useCallback, useEffect, useMemo } from 'react';
import {
  BOOKING_COMPANION_ALIAS_PREFIX,
  BOOKING_HOLDER_ALIAS,
} from '../constants/bookingDefaults.js';
import {
  areBlocksEqual,
  createBookingBlock,
  normalizeBookingBlock,
} from '../utils/bookingMappers.js';
import {
  buildFullName,
  normalizeEmail,
  normalizePersonName,
  normalizePersonNameForValidation,
  sanitizePersonNameInput,
  sanitizePhoneInput,
  splitFullName,
  timeKeyToMinutes,
  toLocalDateTimeWithOffset,
} from '../bookingUtils.js';
import { buildBookingMemberPayload } from '../bookingPayloadBuilders.js';

const LARGE_COMPANION_TIME_GAP_MINUTES = 60;

function getTimeGapMinutes(leftTime, rightTime) {
  const left = timeKeyToMinutes(leftTime);
  const right = timeKeyToMinutes(rightTime);
  if (left == null || right == null) return null;
  return Math.abs(left - right);
}

export default function useBookingCompanions({
  allowCompanions,
  maxCompanions,
  bookingBlocks,
  setBookingBlocks,
  selectedBranchId,
  activeBlockIndex,
  setActiveBlockIndex,
  effectiveActiveBlockIndex,
  titularSelectedDate,
  pendingCompanionFocusId,
  setPendingCompanionFocusId,
  setFieldErrors,
  buildFieldErrorKey,
  clearSlotConflict,
  resetAvailabilityViewState,
  resolveBlockContactState,
  bookingMode,
} = {}) {
  const canAddCompanionBlock = useMemo(
    () => Boolean(allowCompanions) && Array.isArray(bookingBlocks) && bookingBlocks.length < (Number(maxCompanions || 0) + 1),
    [allowCompanions, bookingBlocks, maxCompanions]
  );

  const companionRuleValidation = useMemo(() => {
    const source = Array.isArray(bookingBlocks) ? bookingBlocks : [];
    const titular = normalizeBookingBlock(source[0] || {}, 0);
    const titularDate = String(titular?.selectedDate || '').trim();
    const titularTime = String(titular?.selectedTime || '').trim();
    const dateViolations = [];
    const largeTimeGapViolations = [];

    source.slice(1).forEach((rawBlock, rawIndex) => {
      const index = rawIndex + 1;
      const block = normalizeBookingBlock(rawBlock || {}, index);
      if (block.selectedDate && titularDate && block.selectedDate !== titularDate) {
        dateViolations.push({ index, blockId: block.id, selectedDate: block.selectedDate, titularDate });
      }
      const timeGapMinutes = getTimeGapMinutes(titularTime, block.selectedTime);
      if (timeGapMinutes != null && timeGapMinutes > LARGE_COMPANION_TIME_GAP_MINUTES) {
        largeTimeGapViolations.push({ index, blockId: block.id, timeGapMinutes });
      }
    });

    return {
      sameBranch: true,
      branchId: String(selectedBranchId || '').trim(),
      sameDate: dateViolations.length === 0,
      dateViolations,
      largeTimeGapViolations,
    };
  }, [bookingBlocks, selectedBranchId]);

  const updateBlockAtIndex = useCallback((index, updater) => {
    if (typeof setBookingBlocks !== 'function') return;
    setBookingBlocks((prev) => {
      if (!prev[index]) return prev;
      const currentBlock = prev[index];
      const nextRaw = typeof updater === 'function'
        ? updater(currentBlock)
        : { ...currentBlock, ...updater };
      const nextBlock = normalizeBookingBlock(nextRaw, index);

      if (areBlocksEqual(currentBlock, nextBlock)) {
        return prev;
      }

      const nextBlocks = [...prev];
      nextBlocks[index] = nextBlock;
      return nextBlocks;
    });
  }, [setBookingBlocks]);

  const setActiveBlock = useCallback((nextIndex) => {
    const parsed = Number(nextIndex);
    if (!Number.isFinite(parsed) || !Array.isArray(bookingBlocks)) return;
    const clamped = Math.max(0, Math.min(bookingBlocks.length - 1, Math.trunc(parsed)));
    setActiveBlockIndex(clamped);
    if (typeof resetAvailabilityViewState === 'function') {
      resetAvailabilityViewState();
    }
  }, [bookingBlocks, resetAvailabilityViewState, setActiveBlockIndex]);

  const addCompanionBlock = useCallback(() => {
    let createdBlockId = '';
    setBookingBlocks((prev) => {
      if (!allowCompanions || prev.length >= (Number(maxCompanions || 0) + 1)) return prev;
      const source = prev.length > 0 ? prev : [createBookingBlock({ alias: BOOKING_HOLDER_ALIAS })];
      const companionNumber = source.length;
      const inheritedBarberId = source[effectiveActiveBlockIndex]?.idBarbero || source[0]?.idBarbero || '';
      const inheritedDate = source[0]?.selectedDate || '';
      const nextBlock = normalizeBookingBlock(
        {
          ...createBookingBlock({
            alias: `${BOOKING_COMPANION_ALIAS_PREFIX} ${companionNumber}`,
            idBarbero: inheritedBarberId,
          }),
          selectedDate: inheritedDate,
          selectedTime: '',
          selectedDateTime: '',
        },
        companionNumber
      );
      createdBlockId = nextBlock.id;
      const nextBlocks = [...source, nextBlock];
      setActiveBlockIndex(nextBlocks.length - 1);
      return nextBlocks;
    });
    if (createdBlockId) {
      setPendingCompanionFocusId(createdBlockId);
    }
    if (typeof resetAvailabilityViewState === 'function') {
      resetAvailabilityViewState();
    }
  }, [
    allowCompanions,
    effectiveActiveBlockIndex,
    maxCompanions,
    resetAvailabilityViewState,
    setActiveBlockIndex,
    setBookingBlocks,
    setPendingCompanionFocusId,
  ]);

  const consumePendingCompanionFocus = useCallback((blockId) => {
    const normalizedId = String(blockId || '').trim();
    setPendingCompanionFocusId((current) => {
      if (!current) return '';
      if (!normalizedId || current === normalizedId) return '';
      return current;
    });
  }, [setPendingCompanionFocusId]);

  const removeCompanionBlock = useCallback((blockId) => {
    const normalizedId = String(blockId || '').trim();
    if (!normalizedId) return;
    let removedIndex = -1;
    setBookingBlocks((prev) => {
      if (prev.length <= 1) return prev;
      const targetIndex = prev.findIndex((item, index) => index > 0 && item.id === normalizedId);
      if (targetIndex < 1) return prev;
      removedIndex = targetIndex;
      const nextRaw = prev.filter((item) => item.id !== normalizedId);
      const nextBlocks = nextRaw.map((item, index) => normalizeBookingBlock({
        ...item,
        alias: index === 0 ? BOOKING_HOLDER_ALIAS : (item.contactName || `${BOOKING_COMPANION_ALIAS_PREFIX} ${index}`),
      }, index));
      setActiveBlockIndex((current) => {
        if (current > targetIndex) return current - 1;
        if (current === targetIndex) return Math.max(0, current - 1);
        return current;
      });
      return nextBlocks;
    });
    if (removedIndex > 0 && typeof setFieldErrors === 'function') {
      setFieldErrors((prev) => {
        const next = {};
        Object.entries(prev).forEach(([key, value]) => {
          const [rawIndex, field] = key.split(':');
          const parsedIndex = Number(rawIndex);
          if (!Number.isFinite(parsedIndex)) return;
          if (parsedIndex === removedIndex) return;
          const newIndex = parsedIndex > removedIndex ? parsedIndex - 1 : parsedIndex;
          next[`${newIndex}:${field}`] = value;
        });
        return next;
      });
    }
    if (typeof clearSlotConflict === 'function') {
      clearSlotConflict();
    }
    if (typeof resetAvailabilityViewState === 'function') {
      resetAvailabilityViewState();
    }
  }, [
    clearSlotConflict,
    resetAvailabilityViewState,
    setActiveBlockIndex,
    setBookingBlocks,
    setFieldErrors,
  ]);

  const updateActiveBlockBarber = useCallback((barberId) => {
    updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
      ...currentBlock,
      idBarbero: String(barberId || '').trim(),
      selectedDate: currentBlock.selectedDate || '',
      selectedTime: '',
      selectedDateTime: '',
    }));

    if (typeof resetAvailabilityViewState === 'function') {
      resetAvailabilityViewState();
    }
  }, [effectiveActiveBlockIndex, resetAvailabilityViewState, updateBlockAtIndex]);

  const updateActiveBlockContact = useCallback((patch) => {
    const normalizedPatch = { ...patch };
    if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'contactPhone')) {
      normalizedPatch.contactPhone = sanitizePhoneInput(normalizedPatch.contactPhone || '');
    }
    if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'contactEmail')) {
      normalizedPatch.contactEmail = normalizeEmail(normalizedPatch.contactEmail || '');
    }
    if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'contactFirstName')) {
      normalizedPatch.contactFirstName = sanitizePersonNameInput(normalizedPatch.contactFirstName || '');
      normalizedPatch.contactFirstNameDirty = true;
    }
    if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'contactLastName')) {
      normalizedPatch.contactLastName = sanitizePersonNameInput(normalizedPatch.contactLastName || '');
      normalizedPatch.contactLastNameDirty = true;
    }
    if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'contactName')) {
      const split = splitFullName(normalizedPatch.contactName || '');
      normalizedPatch.contactFirstName = normalizePersonNameForValidation(split.firstName);
      normalizedPatch.contactLastName = normalizePersonNameForValidation(split.lastName);
      normalizedPatch.contactName = buildFullName(normalizedPatch.contactFirstName, normalizedPatch.contactLastName)
        || normalizePersonName(normalizedPatch.contactName || '');
    }
    updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => {
      const next = {
        ...currentBlock,
        ...normalizedPatch,
      };
      const normalizedName = buildFullName(next.contactFirstName, next.contactLastName)
        || normalizePersonName(next.contactName || '');
      next.contactName = normalizedName;
      next.alias = normalizedName || (effectiveActiveBlockIndex === 0 ? BOOKING_HOLDER_ALIAS : `${BOOKING_COMPANION_ALIAS_PREFIX} ${effectiveActiveBlockIndex}`);
      return next;
    });
    if (typeof setFieldErrors !== 'function' || typeof buildFieldErrorKey !== 'function') return;
    if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'contactName')
      || Object.prototype.hasOwnProperty.call(normalizedPatch, 'contactFirstName')) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[buildFieldErrorKey(effectiveActiveBlockIndex, 'contactFirstName')];
        delete next[buildFieldErrorKey(effectiveActiveBlockIndex, 'contactName')];
        return next;
      });
    }
    if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'contactLastName')) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[buildFieldErrorKey(effectiveActiveBlockIndex, 'contactLastName')];
        return next;
      });
    }
    if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'contactEmail')) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[buildFieldErrorKey(effectiveActiveBlockIndex, 'contactEmail')];
        return next;
      });
    }
    if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'contactPhone')) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[buildFieldErrorKey(effectiveActiveBlockIndex, 'contactPhone')];
        return next;
      });
    }
  }, [
    buildFieldErrorKey,
    effectiveActiveBlockIndex,
    setFieldErrors,
    updateBlockAtIndex,
  ]);

  const buildIntegrantesPayload = useCallback(({
    blocksToSubmit,
    resolvedBarberByBlockId,
  } = {}) => {
    const integrantes = [];
    const source = Array.isArray(blocksToSubmit) ? blocksToSubmit : [];
    const titularDate = String(source[0]?.selectedDate || '').trim();
    for (const block of source) {
      const blockDate = String(block?.selectedDate || '').trim();
      if (Number(block?.index || 0) > 0 && titularDate && blockDate && blockDate !== titularDate) {
        return {
          ok: false,
          errorCode: 'COMPANION_DATE_MISMATCH',
          integrantes: [],
        };
      }
      const preservedFechaInicio = String(block?.selectedDateTime || '').trim();
      const expectedPrefix = `${String(block?.selectedDate || '').trim()}T${String(block?.selectedTime || '').trim()}`;
      const fechaInicioNormalizada = (preservedFechaInicio && expectedPrefix && preservedFechaInicio.startsWith(expectedPrefix))
        ? preservedFechaInicio
        : toLocalDateTimeWithOffset(block.selectedDate, block.selectedTime);
      if (!fechaInicioNormalizada) {
        return {
          ok: false,
          errorCode: 'BOOKING_DATETIME_INVALID',
          integrantes: [],
        };
      }
      const blockContactState = resolveBlockContactState(block, block.index);
      const hasResolvedBarber = resolvedBarberByBlockId?.has(block.id) === true;
      const integrantePayload = buildBookingMemberPayload({
        block,
        blockContactState,
        bookingMode,
        fechaInicio: fechaInicioNormalizada,
        hasResolvedBarber,
        resolvedBarberId: hasResolvedBarber ? resolvedBarberByBlockId.get(block.id) : null,
      });
      integrantes.push(integrantePayload);
    }
    return { ok: true, integrantes };
  }, [bookingMode, resolveBlockContactState]);

  useEffect(() => {
    if (!Array.isArray(bookingBlocks) || bookingBlocks[activeBlockIndex]) return;
    setActiveBlockIndex(0);
  }, [activeBlockIndex, bookingBlocks, setActiveBlockIndex]);

  useEffect(() => {
    const nextTitularDate = String(titularSelectedDate || '').trim();
    setBookingBlocks((prev) => {
      let changed = false;
      const next = prev.map((block, index) => {
        if (index === 0) return block;
        if (block.selectedDate === nextTitularDate) return block;
        changed = true;
        return normalizeBookingBlock(
          {
            ...block,
            selectedDate: nextTitularDate,
            selectedTime: '',
            selectedDateTime: '',
          },
          index
        );
      });
      return changed ? next : prev;
    });
  }, [setBookingBlocks, titularSelectedDate]);

  return {
    canAddCompanionBlock,
    companionRuleValidation,
    companionLargeTimeGapViolations: companionRuleValidation.largeTimeGapViolations,
    pendingCompanionFocusId,
    updateBlockAtIndex,
    setActiveBlock,
    addCompanionBlock,
    consumePendingCompanionFocus,
    removeCompanionBlock,
    updateActiveBlockBarber,
    updateActiveBlockContact,
    buildIntegrantesPayload,
  };
}
