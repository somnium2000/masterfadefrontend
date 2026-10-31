// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import LandingPage from '../LandingPage.jsx';
import { ThemeProvider } from '../../../../context/ThemeContext.jsx';

afterEach(() => {
  cleanup();
  window.localStorage.removeItem('mf_theme_variant');
});

function LocationProbe() {
  const { pathname } = useLocation();
  return <output aria-label="Destino de navegación">{pathname}</output>;
}
test('un único main y h1, sin incluir la navegación inferior', () => {
  render(<ThemeProvider><MemoryRouter><LandingPage /></MemoryRouter></ThemeProvider>);
  const main = screen.getByRole('main');
  expect(within(main).getByRole('heading', { level: 1 })).toHaveTextContent('MASTERFADE');
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(main).not.toContainElement(screen.getByRole('navigation'));
  expect(screen.getByRole('button', { name: 'Agendar', exact: true })).toBeInTheDocument();
});

test('contraste y foco quedan delimitados a Landing, incluida su navegación', () => {
  render(<ThemeProvider><MemoryRouter><LandingPage /></MemoryRouter></ThemeProvider>);
  const root = screen.getByRole('main').parentElement;
  expect(root).toHaveClass('mf-landing');
  expect(root).toContainElement(screen.getByRole('navigation'));
  for (const label of screen.getAllByText('Oscuro Premium')) {
    expect(label).toHaveClass('mf-landing-muted');
  }
  const css = readFileSync(resolve(cwd(), 'src/index.css'), 'utf8');
  expect(css).toMatch(/\.mf-landing \.mf-landing-muted\s*\{\s*color: var\(--mf-landing-muted\);/);
  expect(css).toMatch(/:root\[data-theme="light"\] \.mf-landing\s*\{\s*--mf-landing-muted: #514b46;/);
  expect(css).toMatch(/\.mf-landing button:focus-visible\s*\{\s*outline: 3px solid var\(--mf-accent\);\s*outline-offset: 3px;/);
  expect(css).toMatch(/\.mf-focus-ring:focus-visible\s*\{\s*outline: none;\s*box-shadow: 0 0 0 3px color-mix/);
});

test('cambiar de tema conserva nombres y controles de Landing', () => {
  render(<ThemeProvider><MemoryRouter><LandingPage /></MemoryRouter></ThemeProvider>);
  fireEvent.click(screen.getAllByRole('button', { name: 'Cambiar a tema claro elegante' })[0]);
  expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  expect(screen.getAllByText('Claro Elegante')).toHaveLength(2);
  expect(screen.getAllByRole('button', { name: 'Cambiar a tema oscuro premium' })).toHaveLength(2);
  expect(screen.getAllByRole('button', { name: 'Barberos', exact: true })).toHaveLength(2);
  fireEvent.click(screen.getAllByRole('button', { name: 'Cambiar a tema oscuro premium' })[0]);
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
});

test('los destinos existentes de Landing se conservan sin ejecutar operaciones de negocio', () => {
  render(<ThemeProvider><MemoryRouter><LandingPage /><LocationProbe /></MemoryRouter></ThemeProvider>);
  for (const [name, destination] of [
    ['Servicios', '/servicios'],
    ['Barberos', '/barberos'],
    ['Planes de Membresía VIP', '/membresias-vip'],
    ['Promociones', '/promociones'],
    ['Iniciar sesión', '/login'],
    ['Agendar Cita', '/agendar/barberos'],
    ['Agendar', '/agendar/barberos'],
    ['Inicio', '/'],
  ]) {
    fireEvent.click(screen.getAllByRole('button', { name, exact: true })[0]);
    expect(screen.getByLabelText('Destino de navegación')).toHaveTextContent(destination);
  }
});

test('CTA entran desde abajo en orden, finalizan visibles y conservan interacción', async () => {
  render(<ThemeProvider><MemoryRouter><LandingPage /></MemoryRouter></ThemeProvider>);
  for (const label of ['Agendar Cita', 'Barberos', 'Planes de Membresía VIP']) {
    for (const button of screen.getAllByRole('button', { name: label, exact: true })) {
      expect(button).toHaveStyle({ opacity: '0', transform: 'translateY(18px)' });
      expect(button).toBeEnabled();
    }
  }
  await waitFor(() => {
    for (const label of ['Agendar Cita', 'Barberos', 'Planes de Membresía VIP']) {
      for (const button of screen.getAllByRole('button', { name: label, exact: true })) {
        expect(button).toBeVisible();
        expect(button).toHaveStyle({ opacity: '1', transform: 'none' });
      }
    }
  }, { timeout: 2500 });
  const source = readFileSync(resolve(cwd(), 'src/features/landing/pages/LandingPage.jsx'), 'utf8');
  expect(source).toMatch(/const CTA_ENTRY_DELAYS = \[0\.65, 0\.8, 0\.95\]/);
  expect(source).toMatch(/initial=\{reducedMotion \? false : \{ opacity: 0, y: 18 \}\}/);
  expect(source).toMatch(/animate=\{\{ opacity: 1, y: 0 \}\}/);
  expect(source).toMatch(/duration: 0\.6, delay: CTA_ENTRY_DELAYS\[order\], ease/);
  expect(source).toMatch(/transition=\{reducedMotion \? \{ duration: 0 \}/);
  expect(source).not.toMatch(/hover:-translate-y|hover:scale|active:scale/);
});

test('recargas repetidas siempre completan la entrada de los CTA', async () => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const view = render(<ThemeProvider><MemoryRouter><LandingPage /></MemoryRouter></ThemeProvider>);
    await waitFor(() => {
      for (const button of screen.getAllByRole('button', { name: 'Planes de Membresía VIP', exact: true })) {
        expect(button).toHaveStyle({ opacity: '1', transform: 'none' });
      }
    }, { timeout: 2500 });
    view.unmount();
  }
}, 10000);
