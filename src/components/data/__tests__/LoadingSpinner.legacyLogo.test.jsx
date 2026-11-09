// @vitest-environment jsdom

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test } from 'vitest';
import LoadingSpinner from '../LoadingSpinner.jsx';

const retiredAssets = /(?:favicon-mf\.png|mf-logo\.png|mf-logo-circle\.svg)/;
const textExtensions = /\.(?:css|html|js|jsx|json|svg|webmanifest)$/;

function collectActiveFiles(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(path, entry.name);

    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : collectActiveFiles(entryPath);
    }

    return textExtensions.test(entry.name) ? [entryPath] : [];
  });
}

afterEach(cleanup);

test('muestra un indicador accesible sin imagen de marca', () => {
  const { container } = render(<LoadingSpinner label="Cargando datos" />);

  expect(screen.getByRole('status')).toHaveTextContent('Cargando datos');
  expect(container.querySelector('img')).not.toBeInTheDocument();
});

test('no quedan referencias activas a los recursos retirados', () => {
  const projectRoot = resolve(import.meta.dirname, '../../../..');
  const activeFiles = [
    resolve(projectRoot, 'index.html'),
    ...collectActiveFiles(resolve(projectRoot, 'src')),
    ...collectActiveFiles(resolve(projectRoot, 'public')),
  ];
  const references = activeFiles.filter((file) => retiredAssets.test(readFileSync(file, 'utf8')));

  expect(references).toEqual([]);
});
