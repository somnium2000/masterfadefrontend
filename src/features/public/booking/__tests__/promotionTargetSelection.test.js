import { describe, expect, test } from 'vitest';

import {
  evaluatePromotionForBlock,
  preparePromotionTargetSelection,
} from '../utils/bookingMappers.js';

const SERVICE_A = 'service-a';
const SERVICE_B = 'service-b';
const PACKAGE_A = 'package-a';

const servicesById = new Map([
  [SERVICE_A, { id_servicio: SERVICE_A, nombre_servicio: 'Corte', precio_hnl: 200 }],
  [SERVICE_B, { id_servicio: SERVICE_B, nombre_servicio: 'Barba', precio_hnl: 100 }],
]);
const packagesById = new Map([
  [PACKAGE_A, {
    id_paquete: PACKAGE_A,
    nombre_paquete: 'Corte y barba',
    precio_hnl: 250,
    items: [{ id_servicio: SERVICE_A }],
  }],
]);

function block(overrides = {}) {
  return {
    id: 'booking-block',
    serviceIds: [],
    packageId: '',
    promotionIds: [],
    selectedDate: '2026-11-10',
    selectedTime: '10:00',
    selectedDateTime: '2026-11-10T10:00:00',
    ...overrides,
  };
}

function servicePromotion(overrides = {}) {
  return {
    id_promocion: 'promotion-service',
    aplica_a: 'servicio',
    mecanica: 'porcentaje',
    valor_descuento: 10,
    id_servicio_objetivo: SERVICE_A,
    ...overrides,
  };
}

describe('selección directa del objetivo de promociones', () => {
  test('agrega el servicio objetivo sin selección previa y lo deja evaluable', () => {
    const prepared = preparePromotionTargetSelection({
      block: block(),
      promotion: servicePromotion(),
      servicesById,
      packagesById,
    });

    expect(prepared.canSelect).toBe(true);
    expect(prepared.targetAdded).toBe(true);
    expect(prepared.block.serviceIds).toEqual([SERVICE_A]);
    expect(prepared.block.selectedTime).toBe('');
    expect(evaluatePromotionForBlock({
      block: prepared.block,
      promotion: servicePromotion(),
      servicesById,
      packagesById,
    }).canSelect).toBe(true);
  });

  test('reintentos y dos promociones compatibles no duplican el servicio objetivo', () => {
    const first = preparePromotionTargetSelection({
      block: block(), promotion: servicePromotion(), servicesById, packagesById,
    });
    const second = preparePromotionTargetSelection({
      block: first.block,
      promotion: servicePromotion({ id_promocion: 'promotion-compatible' }),
      servicesById,
      packagesById,
    });

    expect(second.canSelect).toBe(true);
    expect(second.targetAdded).toBe(false);
    expect(second.block.serviceIds).toEqual([SERVICE_A]);
  });

  test('selecciona paquete objetivo y elimina únicamente servicios ya incluidos', () => {
    const prepared = preparePromotionTargetSelection({
      block: block({ serviceIds: [SERVICE_A, SERVICE_B] }),
      promotion: { id_promocion: 'promotion-package', aplica_a: 'paquete', id_paquete_objetivo: PACKAGE_A },
      servicesById,
      packagesById,
    });

    expect(prepared.canSelect).toBe(true);
    expect(prepared.block.packageId).toBe(PACKAGE_A);
    expect(prepared.block.serviceIds).toEqual([SERVICE_B]);
    expect(prepared.block.selectionType).toBe('mixed');
  });

  test('objetivo inexistente o incompatible con paquete no altera la selección', () => {
    const original = block({ serviceIds: [SERVICE_B], packageId: PACKAGE_A, selectionType: 'mixed' });
    const missing = preparePromotionTargetSelection({
      block: original,
      promotion: servicePromotion({ id_servicio_objetivo: 'missing' }),
      servicesById,
      packagesById,
    });
    const included = preparePromotionTargetSelection({
      block: original,
      promotion: servicePromotion(),
      servicesById,
      packagesById,
    });

    expect(missing.canSelect).toBe(false);
    expect(included.canSelect).toBe(false);
    expect(missing.block.serviceIds).toEqual([SERVICE_B]);
    expect(included.block.serviceIds).toEqual([SERVICE_B]);
    expect(included.block.packageId).toBe(PACKAGE_A);
  });

  test('2x1 agrega una sola unidad objetivo y no inventa acompañantes ni bonificaciones', () => {
    const prepared = preparePromotionTargetSelection({
      block: block(),
      promotion: servicePromotion({ mecanica: 'dos_por_uno', cantidad_requerida: 2, cantidad_bonificada: 1 }),
      servicesById,
      packagesById,
    });

    expect(prepared.block.serviceIds).toEqual([SERVICE_A]);
    expect(prepared.block).not.toHaveProperty('companions');
    const evaluation = evaluatePromotionForBlock({
      block: prepared.block,
      promotion: servicePromotion({ mecanica: 'dos_por_uno', cantidad_requerida: 2, cantidad_bonificada: 1 }),
      servicesById,
      packagesById,
    });
    expect(evaluation.requiresFinalCalculation).toBe(true);
    expect(evaluation.estimatedDiscount).toBe(0);
  });

  test('al eliminar el servicio requerido la promoción vuelve a ser inválida', () => {
    expect(evaluatePromotionForBlock({
      block: block({ serviceIds: [] }),
      promotion: servicePromotion(),
      servicesById,
      packagesById,
    }).canSelect).toBe(false);
  });
});
