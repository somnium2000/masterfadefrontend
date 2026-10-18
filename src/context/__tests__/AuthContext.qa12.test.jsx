// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useState } from 'react';
import { AuthProvider, useAuth, consumeIdleSessionMessage } from '../AuthContext.jsx';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), abort: vi.fn() }));
vi.mock('../../services/httpClient.js', () => ({ http: api, abortInFlightRequests: api.abort, registerSessionInvalidationHandler: () => () => {}, resetSessionInvalidation: vi.fn() }));
vi.mock('../../config/supabaseClient.js', () => ({ supabase: null }));
vi.mock('../../features/admin/lib/adminReportesApi.js', () => ({ setAdminReportesSessionScope: vi.fn() }));
const user = { ok: true, data: { user: { id_usuario: 'synthetic-user', nombres: 'Cuenta sintética' }, roles: ['cliente'] } };
function Probe() {
  const auth = useAuth(); const [result, setResult] = useState('');
  return <><p>{auth.user?.nombres || 'Sin sesión local'}</p><p data-testid="result">{result}</p>
    <button onClick={() => void auth.hydrateSession()}>Hidratar</button>
    <button onClick={() => void auth.logout().then(r => setResult(r.ok ? 'Confirmado' : 'No confirmado'))}>Salir</button></>;
}
function mount() { return render(<MemoryRouter initialEntries={['/home/cliente']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AuthProvider><Probe /></AuthProvider></MemoryRouter>); }
async function ready() { const view = mount(); fireEvent.click(screen.getByText('Hidratar')); await screen.findByText('Cuenta sintética'); return view; }
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
beforeEach(() => { vi.useRealTimers(); localStorage.clear(); localStorage.setItem('mf_session_last_backend_touch_at', String(Date.now())); sessionStorage.clear(); api.get.mockReset().mockResolvedValue(user); api.post.mockReset().mockResolvedValue({ ok: true, data: { logged_out: true } }); api.abort.mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

test('cierre confirmado limpia datos y comunica únicamente entonces el cierre entre pestañas', async () => {
  const pending = deferred(); api.post.mockReturnValue(pending.promise); await ready(); fireEvent.click(screen.getByText('Salir'));
  expect(screen.getByText('Cuenta sintética')).toBeInTheDocument(); expect(localStorage.getItem('mf_session_manual_logout_at')).toBeNull();
  await act(async () => pending.resolve({ ok: true, data: { logged_out: true } }));
  expect(screen.getByText('Sin sesión local')).toBeInTheDocument(); expect(screen.getByTestId('result')).toHaveTextContent('Confirmado');
  expect(localStorage.getItem('mf_session_manual_logout_at')).not.toBeNull();
});
test.each(['reject', 'unconfirmed'])('fallo %s conserva identidad y muestra advertencia sin anunciar revocación', async outcome => {
  if (outcome === 'reject') api.post.mockRejectedValue({ status: 503 }); else api.post.mockResolvedValue({ ok: true, data: { logged_out: false } });
  await ready(); fireEvent.click(screen.getByText('Salir'));
  await screen.findByRole('alert'); expect(screen.getByTestId('result')).toHaveTextContent('No confirmado'); expect(screen.getByText('Cuenta sintética')).toBeInTheDocument();
  expect(localStorage.getItem('mf_session_manual_logout_at')).toBeNull(); expect(api.abort).not.toHaveBeenCalled();
});
test('doble logout comparte una sola petición', async () => {
  const pending = deferred(); api.post.mockReturnValue(pending.promise); await ready();
  fireEvent.click(screen.getByText('Salir')); fireEvent.click(screen.getByText('Salir')); expect(api.post).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve({ ok: true, data: { logged_out: true } }));
});
test('hidratación pendiente no restaura datos después del cierre', async () => {
  await ready(); const pending = deferred(); api.get.mockReturnValue(pending.promise);
  fireEvent.click(screen.getByText('Hidratar')); fireEvent.click(screen.getByText('Salir')); await screen.findByText('Sin sesión local');
  await act(async () => pending.resolve(user)); expect(screen.getByText('Sin sesión local')).toBeInTheDocument();
});
test('señal entre pestañas de cierre confirmado invalida el estado local', async () => {
  await ready(); act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'mf_session_manual_logout_at', newValue: String(Date.now()) })));
  expect(screen.getByText('Sin sesión local')).toBeInTheDocument(); expect(api.post).not.toHaveBeenCalled();
});
test.each(['success', 'failure'])('inactividad oculta datos; confirmación servidor %s se distingue', async outcome => {
  await ready(); if (outcome === 'failure') api.post.mockRejectedValue({ status: 503 });
  vi.useFakeTimers();
  await act(async () => { localStorage.setItem('mf_session_last_activity_at', String(Date.now() - 21 * 60 * 1000)); window.dispatchEvent(new StorageEvent('storage', { key: 'mf_session_last_activity_at', newValue: localStorage.getItem('mf_session_last_activity_at') })); await vi.advanceTimersByTimeAsync(1); });
  expect(screen.getByText('Sin sesión local')).toBeInTheDocument();
  expect(consumeIdleSessionMessage()).toContain(outcome === 'failure' ? 'no se confirmó' : 'inactividad');
  if (outcome === 'failure') expect(screen.getByRole('alert')).toHaveTextContent('no se confirmó');
  expect(localStorage.getItem('mf_session_manual_logout_at')).toBeNull();
});
test('reintento confirmado elimina la advertencia anterior', async () => {
  api.post.mockRejectedValueOnce({ status: 503 }).mockResolvedValue({ ok: true, data: { logged_out: true } }); await ready(); fireEvent.click(screen.getByText('Salir'));
  await screen.findByRole('alert'); fireEvent.click(screen.getByText('Reintentar cierre')); await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});
