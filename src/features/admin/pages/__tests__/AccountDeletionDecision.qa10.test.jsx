// AM: La promesa pendiente ahora corresponde a password real, nunca refresh de sesion.
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import Dialog from '../../components/AdminAccountDeletionDecisionDialog.jsx';
const signInWithPassword = vi.hoisted(() => vi.fn());
vi.mock('../../../../config/supabaseClient.js', () => ({ supabase: { auth: { signInWithPassword, refreshSession: vi.fn() } } }));
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => ({ user: { id_usuario: 'actor', email: 'qa@example.invalid' } }) }));
afterEach(cleanup);
test('reauth pendiente tras desmontar no envía aprobación', async () => {
  let resolve; signInWithPassword.mockReturnValue(new Promise(yes => { resolve = yes; })); const approve = vi.fn();
  const view = render(<Dialog open mode="approve" detail={{ permissions: { can_approve: true } }} onApprove={approve} onOpenChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByLabelText(/Escribe exactamente/), { target: { value: 'APROBAR ELIMINACION DE CUENTA' } });
  fireEvent.change(screen.getByLabelText(/Contrasena de la cuenta/), { target: { value: 'SYNTHETIC_ONLY' } });
  fireEvent.click(screen.getByRole('button', { name: 'Aprobar' })); view.unmount();
  await act(async () => resolve({ data: { session: null } })); expect(approve).not.toHaveBeenCalled();
});
test('doble rechazo real del diálogo no duplica callback y cierra al terminar', async () => {
  let resolve; const reject = vi.fn().mockReturnValue(new Promise(yes => { resolve = yes; })); const close = vi.fn();
  render(<Dialog open mode="reject" detail={{ request: { id_solicitud: 'A' } }} onReject={reject} onOpenChange={close} />);
  fireEvent.change(screen.getByLabelText('Motivo de rechazo'), { target: { value: 'Motivo sintético válido' } });
  const button = screen.getByRole('button', { name: 'Rechazar' }); act(() => { button.click(); button.click(); }); expect(reject).toHaveBeenCalledTimes(1);
  await act(async () => resolve({})); expect(close).toHaveBeenCalledWith(false);
});
