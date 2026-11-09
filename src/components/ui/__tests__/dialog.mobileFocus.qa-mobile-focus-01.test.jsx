// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger,
} from '../dialog.jsx';

const originalMatchMedia = window.matchMedia;
const originalTouchPoints = navigator.maxTouchPoints;

function setInputMode({ touch }) {
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: touch ? 5 : 0 });
  window.matchMedia = vi.fn((query) => ({
    matches: touch && query === '(pointer: coarse)',
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

function TestDialog({ onOpenAutoFocus }) {
  return (
    <Dialog>
      <DialogTrigger>Abrir formulario</DialogTrigger>
      <DialogContent onOpenAutoFocus={onOpenAutoFocus}>
        <DialogTitle>Formulario de prueba</DialogTitle>
        <DialogDescription>Prueba de gestión de foco.</DialogDescription>
        <input aria-label="Campo de prueba" />
        <textarea aria-label="Texto de prueba" />
      </DialogContent>
    </Dialog>
  );
}

afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: originalTouchPoints });
});

describe('DialogContent focus táctil', () => {
  it('en móvil enfoca el diálogo y solo enfoca el campo tras un toque', async () => {
    setInputMode({ touch: true });
    render(<TestDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir formulario' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toHaveFocus());
    expect(screen.getByLabelText('Campo de prueba')).not.toHaveFocus();
    const input = screen.getByLabelText('Campo de prueba');
    fireEvent.pointerDown(input);
    input.focus();
    fireEvent.change(input, { target: { value: 'texto' } });
    expect(input).toHaveFocus();
    expect(input).toHaveValue('texto');
  });

  it('en escritorio conserva el autoenfoque y restaura el disparador al cerrar', async () => {
    setInputMode({ touch: false });
    render(<TestDialog />);
    const trigger = screen.getByRole('button', { name: 'Abrir formulario' });
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByLabelText('Campo de prueba')).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('respeta un onOpenAutoFocus del consumidor en dispositivos táctiles', async () => {
    setInputMode({ touch: true });
    const handler = vi.fn((event) => {
      event.preventDefault();
      document.querySelector('[aria-label="Campo de prueba"]')?.focus();
    });
    render(<TestDialog onOpenAutoFocus={handler} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir formulario' }));
    await waitFor(() => expect(screen.getByLabelText('Campo de prueba')).toHaveFocus());
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
