// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import ConsentAgreements from '../ConsentAgreements.jsx';
afterEach(cleanup);

test('ambos consentimientos comienzan desmarcados; enlaces independientes, explícitos y seguros', () => {
  render(<ConsentAgreements termsInputProps={{ name: 'acepta_terminos', required: true }} marketingInputProps={{ name: 'consentimiento_marketing' }} />);
  const [terms, marketing] = screen.getAllByRole('checkbox');
  expect(terms).not.toBeChecked(); expect(marketing).not.toBeChecked();
  expect(terms).toBeRequired(); expect(marketing).not.toBeRequired();
  for (const [name, anchor] of [['Términos y condiciones', 'terminos-y-condiciones'], ['Política de privacidad', 'politica-de-privacidad']]) {
    const link = screen.getByRole('link', { name, exact: true });
    expect(link.closest('label')).toBeNull();
    expect(link).toHaveAttribute('href', `/terminos-y-condiciones#${anchor}`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    fireEvent.click(link);
    expect(terms).not.toBeChecked(); expect(marketing).not.toBeChecked();
  }
  fireEvent.click(terms);
  expect(terms).toBeChecked(); expect(marketing).not.toBeChecked();
});

test('propaga control y estado de envío sin aceptación automática', () => {
  const change = vi.fn();
  const view = render(<ConsentAgreements termsInputProps={{ checked: false, onChange: change }} />);
  fireEvent.click(screen.getAllByRole('checkbox')[0]); expect(change).toHaveBeenCalledOnce();
  expect(screen.getAllByRole('checkbox')[0]).not.toBeChecked();
  view.rerender(<ConsentAgreements termsInputProps={{ checked: true, onChange: change, disabled: true }} marketingInputProps={{ disabled: true }} />);
  expect(screen.getAllByRole('checkbox')[0]).toBeChecked();
  screen.getAllByRole('checkbox').forEach(input => expect(input).toBeDisabled());
});

test('Administración solo consulta los consentimientos, nunca los acepta en nombre del cliente', () => {
  render(<ConsentAgreements readOnly termsInputProps={{ checked: true }} marketingInputProps={{ checked: false }} />);
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  expect(screen.getByText('Aceptación registrada')).toBeInTheDocument();
  expect(screen.getByText('Sin consentimiento registrado')).toBeInTheDocument();
  expect(screen.getByText(/Solo lectura/)).toBeInTheDocument();
  expect(screen.getAllByRole('link')).toHaveLength(2);
});
