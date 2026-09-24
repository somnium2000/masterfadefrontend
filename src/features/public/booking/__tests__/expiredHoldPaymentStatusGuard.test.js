import { describe, expect, test } from 'vitest';
import {
  claimExpiredHoldPaymentStatusCheck,
  hasUnresolvedPaymentEvidence,
  shouldPreserveUnresolvedPaymentState,
} from '../PublicBookingFlow.jsx';

describe('expired hold payment status guard', () => {
  test('permite una sola secuencia automatica por grupo e intent', () => {
    const checkRef = { current: '' };
    const payment = {
      groupId: 'group-a',
      intentId: 'intent-a',
    };

    expect(claimExpiredHoldPaymentStatusCheck(checkRef, payment)).toBe(true);
    expect(claimExpiredHoldPaymentStatusCheck(checkRef, payment)).toBe(false);
    expect(checkRef.current).toBe('group-a|intent-a');
  });

  test('permite la secuencia de un intent nuevo sin bloquear verificaciones manuales', () => {
    const checkRef = { current: 'group-a|intent-a' };

    expect(claimExpiredHoldPaymentStatusCheck(checkRef, {
      groupId: 'group-a',
      intentId: 'intent-b',
    })).toBe(true);
    expect(checkRef.current).toBe('group-a|intent-b');
  });

  test('no reclama una secuencia sin grupo e intent completos', () => {
    const checkRef = { current: '' };

    expect(claimExpiredHoldPaymentStatusCheck(checkRef, { groupId: 'group-a' })).toBe(false);
    expect(claimExpiredHoldPaymentStatusCheck(checkRef, { intentId: 'intent-a' })).toBe(false);
    expect(checkRef.current).toBe('');
  });

  test('hold expirado conserva conciliacion manual sin volver a agenda', () => {
    expect(hasUnresolvedPaymentEvidence({
      manual_reconciliation_required: true,
      estado_intent_codigo: 'expirado',
    })).toBe(true);
    expect(shouldPreserveUnresolvedPaymentState({
      currentResult: { manual_reconciliation_required: true },
      nextResult: { estado_intent_codigo: 'expirado' },
    })).toBe(true);
  });

  test('hold expirado conserva un PixelPay incierto y no limpia su contexto', () => {
    expect(shouldPreserveUnresolvedPaymentState({
      currentResult: { pending_confirmation: true },
      nextResult: { estado_intent_codigo: 'expirado' },
      paymentIntent: { estado_intent_codigo: 'pendiente_confirmacion' },
    })).toBe(true);
  });

  test('estado terminal fallido permite volver a agenda', () => {
    expect(shouldPreserveUnresolvedPaymentState({
      currentResult: { pending_confirmation: true },
      nextResult: { estado_intent_codigo: 'fallido', pending_confirmation: false },
      paymentIntent: { estado_intent_codigo: 'pendiente_confirmacion' },
    })).toBe(false);
  });
});
