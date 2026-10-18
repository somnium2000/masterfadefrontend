// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import LandingPage from '../LandingPage.jsx';
import { ThemeProvider } from '../../../../context/ThemeContext.jsx';

afterEach(cleanup);
test('un único main y h1, sin incluir la navegación inferior', () => {
  render(<ThemeProvider><MemoryRouter><LandingPage /></MemoryRouter></ThemeProvider>);
  const main = screen.getByRole('main');
  expect(within(main).getByRole('heading', { level: 1 })).toHaveTextContent('MASTERFADE');
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(main).not.toContainElement(screen.getByRole('navigation'));
  expect(screen.getByRole('button', { name: 'Agendar', exact: true })).toBeInTheDocument();
});
