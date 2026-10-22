// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Page from '../AdminAccountDeletionPage.jsx';
const auth = vi.hoisted(() => ({ roles: ['root'], user: { id_usuario: 'actor-a' } }));
const api = vi.hoisted(() => Object.fromEntries(['listAdminAccountDeletionRequests','getAdminAccountDeletionRequestDetail','approveAdminAccountDeletionRequest','rejectAdminAccountDeletionRequest','retryAdminAccountDeletionRequest'].map(name => [name, vi.fn()])));
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../../lib/adminAccountDeletionApi.js', () => api);
vi.mock('../../components/AdminAccountDeletionDetailDialog.jsx', () => ({ default: p => p.open ? <div role="dialog"><span>{p.detail?.request?.id_solicitud}</span><button onClick={p.onRetry}>Reintentar mock</button><button onClick={p.onApprove}>Aprobar mock</button><button onClick={p.onReject}>Rechazar mock</button><button onClick={() => p.onOpenChange(false)}>Cerrar mock</button></div> : null }));
vi.mock('../../components/AdminAccountDeletionDecisionDialog.jsx', () => ({ default: p => p.open ? <button onClick={() => { const fn = p.mode === 'approve' ? p.onApprove : p.onReject; void fn({ synthetic: true }).catch(() => {}); }}>Confirmar mock</button> : null }));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const list = label => ({ items: [{ id_solicitud: label, referencia_publica: label, display_name: 'Sintético', solicitado_at: null }], pagination: { page: 1, total_pages: 1 } });
beforeEach(() => { auth.user = { id_usuario: 'actor-a' }; Object.values(api).forEach(mock => mock.mockReset()); api.listAdminAccountDeletionRequests.mockResolvedValue(list('A')); api.getAdminAccountDeletionRequestDetail.mockResolvedValue({ request: { id_solicitud: 'A' } }); });
afterEach(cleanup);
async function ready() { const view = render(<Page />); await screen.findByText('A'); return view; }
test('listado obsoleto no reemplaza filtros vigentes', async () => {
  const a = deferred(); api.listAdminAccountDeletionRequests.mockReturnValueOnce(a.promise).mockResolvedValue(list('B'));
  render(<Page />); fireEvent.click(screen.getByRole('button', { name: 'Clientes' })); await screen.findByText('B');
  await act(async () => a.resolve(list('OLD'))); expect(screen.queryByText('OLD')).not.toBeInTheDocument(); expect(screen.getByText('B')).toBeInTheDocument();
});
test('detalle pendiente no se reabre después de cambiar identidad', async () => {
  const pending = deferred(); api.getAdminAccountDeletionRequestDetail.mockReturnValue(pending.promise); const view = await ready(); fireEvent.click(screen.getByRole('button', { name: 'Ver' }));
  auth.user = { id_usuario: 'actor-b' }; view.rerender(<Page />); await act(async () => pending.resolve({ request: { id_solicitud: 'OLD' } })); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
test.each(['approve','reject','retry'])('doble operación %s emite una sola solicitud', async kind => {
  const method = api[{ approve: 'approveAdminAccountDeletionRequest', reject: 'rejectAdminAccountDeletionRequest', retry: 'retryAdminAccountDeletionRequest' }[kind]];
  const pending = deferred(); method.mockReturnValue(pending.promise); await ready(); fireEvent.click(screen.getByRole('button', { name: 'Ver' })); await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('button', { name: kind === 'approve' ? 'Aprobar mock' : kind === 'reject' ? 'Rechazar mock' : 'Reintentar mock' }));
  const button = screen.getByRole('button', { name: kind === 'retry' ? 'Reintentar mock' : 'Confirmar mock' });
  // AM: Retry ya se inició con el primer clic.
  if (kind !== 'retry') act(() => { button.click(); button.click(); });
  else act(() => button.click());
  expect(method).toHaveBeenCalledTimes(1); await act(async () => pending.resolve({ completed: true }));
});
test('error arbitrario no se muestra al usuario', async () => {
  api.listAdminAccountDeletionRequests.mockRejectedValue({ message: 'ECONNREFUSED private.internal password=SYNTHETIC' }); render(<Page />);
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el listado.');
});
test.each(['approve','reject','retry'])('operación %s desmontada no emite avisos ni recarga', async kind => {
  const pending = deferred(); const method = api[{ approve: 'approveAdminAccountDeletionRequest', reject: 'rejectAdminAccountDeletionRequest', retry: 'retryAdminAccountDeletionRequest' }[kind]];
  method.mockReturnValue(pending.promise); const view = await ready(); fireEvent.click(screen.getByRole('button', { name: 'Ver' })); await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('button', { name: kind === 'approve' ? 'Aprobar mock' : kind === 'reject' ? 'Rechazar mock' : 'Reintentar mock' }));
  if (kind !== 'retry') fireEvent.click(screen.getByRole('button', { name: 'Confirmar mock' }));
  view.unmount(); await act(async () => pending.resolve({ completed: true }));
  expect(api.listAdminAccountDeletionRequests).toHaveBeenCalledTimes(1); expect(api.getAdminAccountDeletionRequestDetail).toHaveBeenCalledTimes(1);
});
