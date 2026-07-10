import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(resolve(currentDir, '../AdminAgendamientoCitasPage.jsx'), 'utf8');

describe('AdminAgendamientoCitasPage scope', () => {
  test('no expone el flujo asistido Nueva cita', () => {
    expect(pageSource).not.toContain('Nueva cita');
    expect(pageSource).not.toContain('assistantOpen');
    expect(pageSource).not.toContain('openAssistantDialog');
    expect(pageSource).not.toContain('createAdminBookingAdapter');
  });
});
