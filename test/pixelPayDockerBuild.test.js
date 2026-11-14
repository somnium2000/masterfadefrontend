import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';

test('el builder Docker transmite destino, proveedor y entorno PixelPay antes de compilar Vite', async () => {
  const dockerfile = (await readFile(new URL('../Dockerfile', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  const builder = dockerfile.split(/FROM nginx:/)[0];
  const build = builder.indexOf('RUN npm run build');
  expect(build).toBeGreaterThan(0);
  for (const name of ['VITE_APP_URL', 'VITE_PAYMENT_PROVIDER', 'VITE_PIXELPAY_ENV']) {
    const arg = builder.indexOf(`ARG ${name}\n`);
    const env = builder.indexOf(`ENV ${name}=$${name}`);
    expect(arg, `ARG ${name} debe existir en builder`).toBeGreaterThan(0);
    expect(env, `ENV ${name} debe existir en builder`).toBeGreaterThan(arg);
    expect(env).toBeLessThan(build);
  }
  expect(builder).not.toMatch(/ARG VITE_PIXELPAY_ENV=/);
});
