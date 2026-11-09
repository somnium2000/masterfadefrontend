// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import BookingLayout from '../components/BookingLayout.jsx';

vi.mock('../../../../components/branding/MasterfadeLogo.jsx', () => ({
  default: ({ variant, className }) => (
    <div role="img" aria-label="Masterfade script logo" data-variant={variant} className={className} />
  ),
}));

vi.mock('../../../../components/theme/ThemeSwitcher.jsx', () => ({
  default: ({ showLabel, className, buttonClassName }) => (
    <div className={className}>
      <button type="button" className={buttonClassName} aria-label="Cambiar a tema claro">
        Tema
      </button>
      <span data-testid="theme-label-setting">{String(showLabel)}</span>
    </div>
  ),
}));

function renderLayout(props = {}) {
  return render(
    <MemoryRouter>
      <BookingLayout homePath="/" {...props}>
        <main>Contenido</main>
      </BookingLayout>
    </MemoryRouter>,
  );
}

describe('BookingLayout navigation header', () => {
  it('uses the official navigation logo and keeps home and theme controls accessible', () => {
    renderLayout({ homePath: '/home/cliente', homeLabel: 'Inicio MasterFade' });

    expect(screen.getByRole('img', { name: 'Masterfade script logo' })).toHaveAttribute('data-variant', 'navigation');
    expect(screen.getByRole('link', { name: 'Inicio MasterFade' })).toHaveAttribute('href', '/home/cliente');
    expect(screen.getByRole('button', { name: 'Cambiar a tema claro' })).toBeInTheDocument();
    expect(screen.getByTestId('theme-label-setting')).toHaveTextContent('false');
  });

  it('runs the existing back callback only when the control is enabled', () => {
    const onBackToBarberos = vi.fn();
    const { rerender } = renderLayout({ showBackToBarberos: true, onBackToBarberos });

    fireEvent.click(screen.getByRole('button', { name: 'Volver a barberos' }));
    expect(onBackToBarberos).toHaveBeenCalledTimes(1);

    rerender(
      <MemoryRouter>
        <BookingLayout homePath="/" showBackToBarberos={false} onBackToBarberos={onBackToBarberos}>
          <main>Contenido</main>
        </BookingLayout>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: 'Volver a barberos' })).not.toBeInTheDocument();
  });
});
