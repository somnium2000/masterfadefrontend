import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dockerfile = readFileSync(new URL('../../../../Dockerfile', import.meta.url), 'utf8');
const buildStage = dockerfile.split(/^FROM nginx:/m)[0];

function expectBuildArgument(name) {
  const declaration = new RegExp(`^ARG ${name}$`, 'm');
  const propagation = new RegExp(`^ENV ${name}=\\$${name}$`, 'm');
  expect(buildStage).toMatch(declaration);
  expect(buildStage).toMatch(propagation);
  expect(buildStage.search(declaration)).toBeLessThan(buildStage.indexOf('RUN npm run build'));
  expect(buildStage.search(propagation)).toBeLessThan(buildStage.indexOf('RUN npm run build'));
}

describe('PixelPay environment at Docker build time', () => {
  it('passes the explicit PixelPay environment to Vite in the builder stage', () => {
    expectBuildArgument('VITE_PIXELPAY_ENV');
    expectBuildArgument('VITE_PAYMENT_PROVIDER');
  });

  it('retains independent QA simulator and demonstration build arguments', () => {
    for (const name of [
      'VITE_ENTORNO',
      'VITE_TODOPAGO_MODE',
      'VITE_TODOPAGO_SIMULATED_ENABLED',
      'VITE_ENABLE_PAYMENT_SIMULATOR',
      'VITE_ENABLE_QA_PAYMENT_SIMULATION',
      'VITE_MEMBERSHIP_PAYMENT_SIMULATOR_ENABLED',
      'VITE_ENABLE_QA_VIP_PURCHASE_SIMULATION',
      'VITE_QA_VIDEO_DEMO_MODE',
    ]) expectBuildArgument(name);
  });

  it('does not select Live or enable QA simulators through Docker defaults', () => {
    expect(buildStage).not.toMatch(/^ARG VITE_(?:PIXELPAY_ENV|.*SIMULAT.*)=/m);
  });
});
