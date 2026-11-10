import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

describe('AdminCitasPage calendar availability loading contract', () => {
  test('uses the shared spinner inside the calendar and blocks month navigation', async () => {
    const source = await readFile(new URL('../AdminCitasPage.jsx', import.meta.url), 'utf8');

    expect(source).toContain('<LoadingSpinner label="Buscando fechas disponibles..." />');
    expect(source).toMatch(/aria-label="Mes anterior" disabled=\{previewAvailabilityLoading\}/);
    expect(source).toMatch(/aria-label="Mes siguiente" disabled=\{previewAvailabilityLoading\}/);
    expect(source).toMatch(/previewAvailabilityLoading \? \([\s\S]*LoadingSpinner[\s\S]*: \([\s\S]*citas-calendar-grid/);
  });
});
