// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import CardsCarousel from '../CardsCarousel.jsx';

const items = [{ id: 'one' }, { id: 'two' }, { id: 'three' }];

function mount({ enableSwipe = true, onAction = vi.fn() } = {}) {
  render(
    <CardsCarousel
      items={items}
      getItemKey={(item) => item.id}
      pageSizeByViewport={{ mobile: 1, tablet: 1, desktop: 1 }}
      enableSwipe={enableSwipe}
      renderItem={(item) => <button type="button" onClick={() => onAction(item.id)}>{item.id}</button>}
    />
  );
  return { region: screen.getByTestId('cards-carousel-swipe-region'), onAction };
}

function swipe(region, { from = [240, 100], to = [80, 104] } = {}) {
  fireEvent.touchStart(region, { touches: [{ clientX: from[0], clientY: from[1] }] });
  fireEvent.touchMove(region, { touches: [{ clientX: to[0], clientY: to[1] }] });
  fireEvent.touchEnd(region, { changedTouches: [{ clientX: to[0], clientY: to[1] }] });
}

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  vi.stubGlobal('requestAnimationFrame', (callback) => { callback(); return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

test('swipe izquierda avanza y derecha retrocede respetando límites', async () => {
  const { region } = mount();
  expect(screen.getByRole('button', { name: 'one' })).toBeInTheDocument();
  swipe(region);
  expect(await screen.findByRole('button', { name: 'two' })).toBeInTheDocument();
  swipe(region);
  expect(await screen.findByRole('button', { name: 'three' })).toBeInTheDocument();
  swipe(region);
  expect(screen.getByRole('button', { name: 'three' })).toBeInTheDocument();
  swipe(region, { from: [80, 100], to: [240, 104] });
  expect(await screen.findByRole('button', { name: 'two' })).toBeInTheDocument();
});

test('tap, movimiento corto y gesto vertical no cambian de página', async () => {
  const { region, onAction } = mount();
  swipe(region, { from: [100, 100], to: [100, 100] });
  swipe(region, { from: [100, 100], to: [125, 102] });
  swipe(region, { from: [100, 80], to: [112, 220] });
  expect(screen.getByRole('button', { name: 'one' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'one' }));
  expect(onAction).toHaveBeenCalledExactlyOnceWith('one');
  await waitFor(() => expect(screen.getByRole('button', { name: 'one' })).toBeInTheDocument());
});

test('un swipe produce un solo cambio y suprime el clic posterior accidental', async () => {
  const { region, onAction } = mount();
  const button = screen.getByRole('button', { name: 'one' });
  swipe(region);
  fireEvent.click(button);
  expect(onAction).not.toHaveBeenCalled();
  expect(await screen.findByRole('button', { name: 'two' })).toBeInTheDocument();
});

test('flechas e indicadores conservan navegación existente', async () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  expect(await screen.findByRole('button', { name: 'two' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ir a pagina 3' }));
  expect(await screen.findByRole('button', { name: 'three' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
});

test('controles opt-in solo icono conservan nombre accesible y titulo sin renderizar etiquetas visibles', () => {
  render(
    <CardsCarousel
      items={items}
      getItemKey={(item) => item.id}
      pageSizeByViewport={{ mobile: 1, tablet: 1, desktop: 1 }}
      compactControls
      iconOnlyControls
      renderItem={(item) => <span>{item.id}</span>}
    />
  );
  const previous = screen.getByRole('button', { name: 'Anterior' });
  const next = screen.getByRole('button', { name: 'Siguiente' });
  expect(previous).toHaveAttribute('title', 'Anterior');
  expect(next).toHaveAttribute('title', 'Siguiente');
  expect(previous.querySelector('span')).not.toBeInTheDocument();
  expect(next.querySelector('span')).not.toBeInTheDocument();
});

test('swipe permanece desactivado por defecto para consumidores administrativos', () => {
  const { region } = mount({ enableSwipe: false });
  swipe(region);
  expect(screen.getByRole('button', { name: 'one' })).toBeInTheDocument();
  expect(region).not.toHaveClass('touch-pan-y');
});
