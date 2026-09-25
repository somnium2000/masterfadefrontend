// @vitest-environment jsdom

import { beforeEach, describe, expect, test } from 'vitest';
import {
  BOOKING_PAYMENT_CONTEXT_STORAGE_KEY,
  readBookingPaymentContext,
  resolvePaymentResumeContext,
} from '../paymentResumeContext.js';

const GROUP_1 = '11111111-2222-4333-8444-555555555555';
const GROUP_2 = '22222222-3333-4444-8555-666666666666';
const INTENT_1 = '99999999-9999-4999-8999-999999999999';
const INTENT_2 = '88888888-8888-4888-8888-888888888888';
const EMAIL = 'qa@example.com';

function writeStandardContext({ groupId = GROUP_1, intentId = INTENT_1 } = {}) {
  window.sessionStorage.setItem(BOOKING_PAYMENT_CONTEXT_STORAGE_KEY, JSON.stringify({
    id_grupo_cita: groupId,
    id_intent: intentId,
    titular_email: EMAIL,
    paymentIntent: {
      id_grupo_cita: groupId,
      id_intent: intentId,
      estado_intent_codigo: 'link_generado',
    },
  }));
}

describe('payment resume context exact matching', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  test('standard-only conserva G1/I1 y su metadata', () => {
    writeStandardContext();

    expect(readBookingPaymentContext({ groupId: GROUP_1, intentId: INTENT_1 })).toMatchObject({
      id_grupo_cita: GROUP_1,
      id_intent: INTENT_1,
      titular_email: EMAIL,
      paymentIntent: { id_intent: INTENT_1, estado_intent_codigo: 'link_generado' },
    });
    expect(resolvePaymentResumeContext()).toMatchObject({
      id_grupo_cita: GROUP_1,
      id_intent: INTENT_1,
      titular_email: EMAIL,
    });
  });

  test('mismo group e intent permite reutilizar metadata standard', () => {
    writeStandardContext();

    expect(readBookingPaymentContext({ groupId: GROUP_1, intentId: INTENT_1 })?.paymentIntent)
      .toMatchObject({ id_grupo_cita: GROUP_1, id_intent: INTENT_1 });
  });

  test('mismo group con intent distinto ignora storage', () => {
    writeStandardContext();

    expect(readBookingPaymentContext({ groupId: GROUP_1, intentId: INTENT_2 })).toBeNull();
  });

  test('group distinto ignora storage completamente', () => {
    writeStandardContext();

    expect(readBookingPaymentContext({ groupId: GROUP_2, intentId: INTENT_2 })).toBeNull();
  });

  test('query G1/I2 conserva prioridad sobre pending y standard del mismo grupo', () => {
    writeStandardContext();

    expect(resolvePaymentResumeContext({
      search: `?id_grupo_cita=${GROUP_1}&id_intent=${INTENT_2}`,
      pendingContext: {
        id_grupo_cita: GROUP_1,
        id_intent: '77777777-7777-4777-8777-777777777777',
        titular_email: EMAIL,
      },
    })).toEqual({
      id_grupo_cita: GROUP_1,
      id_intent: INTENT_2,
      titular_email: EMAIL,
    });
  });
});
