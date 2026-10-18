// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import { Home, Plus } from 'lucide-react';
import { readFileSync } from 'node:fs';
import PremiumBottomNav from '../PremiumBottomNav.jsx';

afterEach(cleanup);

const labels = ['Inicio', 'Servicios', 'Iniciar sesión', 'Promociones'];
const createItems = () => labels.map((label, index) => ({
  id: String(index), label, icon: Home, onClick: vi.fn(),
}));

test('conserva destinos, orden, FAB, nombres accesibles y selección activa', () => {
  const items = createItems();
  const onFab = vi.fn();
  render(<PremiumBottomNav activeId="0" sideItems={items} fabItem={{ label: 'Agendar', icon: Plus, onClick: onFab }} />);
  expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label') || button.textContent))
    .toEqual(['Inicio', 'Servicios', 'Agendar', 'Iniciar sesión', 'Promociones']);
  expect(screen.getByRole('button', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');
  items.forEach((item) => {
    fireEvent.click(screen.getByRole('button', { name: item.label }));
    expect(item.onClick).toHaveBeenCalledOnce();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Agendar' }));
  expect(onFab).toHaveBeenCalledOnce();
});

test('permite encoger ambos grupos sin mínimos de 56px ni etiquetas truncadas', () => {
  render(<PremiumBottomNav sideItems={createItems()} fabItem={{ label: 'Agendar', icon: Plus, onClick: vi.fn() }} />);
  for (const label of labels) {
    const button = screen.getByRole('button', { name: label });
    expect(button).toHaveClass('min-w-0', 'basis-0', 'min-h-[44px]');
    expect(button).not.toHaveClass('min-w-[56px]');
    expect(button.parentElement).toHaveClass('min-w-0', 'basis-0');
    expect(screen.getByText(label)).not.toHaveClass('truncate');
  }
  expect(screen.getByRole('button', { name: 'Agendar' })).toHaveClass('h-14', 'w-14', 'mf-focus-ring');
});

test('preset barbero sin FAB conserva todos los destinos y el estado disabled', () => {
  const items = createItems().slice(0, 3);
  items[1].disabled = true;
  render(<PremiumBottomNav activeId="0" sideItems={items} mobilePreset="barber" />);
  expect(screen.getAllByRole('button')).toHaveLength(3);
  const disabled = screen.getByRole('button', { name: 'Servicios' });
  expect(disabled).toBeDisabled();
  fireEvent.click(disabled);
  expect(items[1].onClick).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Inicio' })).toHaveClass('rounded-xl');
});

test('sin destinos no crea una barra vacía', () => {
  render(<PremiumBottomNav sideItems={[]} />);
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
});

test('contraste AA incluso sobre el peor fondo compuesto de cada tema', () => {
  const css = readFileSync('src/index.css', 'utf8');
  const luminance = (rgb) => rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const themes = css.split(':root[data-theme="light"]', 2);
  for (const [index, block] of themes.entries()) {
    const foreground = block.match(/--mf-nav-inactive:\s*#([\da-f]{6})/i)[1]
      .match(/../g).map((hex) => parseInt(hex, 16));
    const [, r, g, b, alpha] = block.match(/--mf-nav-bg:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
    // AM: Blanco bajo la barra oscura y negro bajo la clara dan el contraste mínimo.
    const background = [r, g, b].map((channel) => Number(channel) * Number(alpha) + (index === 0 ? 255 : 0) * (1 - Number(alpha)));
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    expect((values[0] + 0.05) / (values[1] + 0.05)).toBeGreaterThanOrEqual(4.5);
  }
});
