// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import PromotionsPage from '../PromotionsPage.jsx';

const api = vi.hoisted(() => ({ branches: vi.fn(), promotions: vi.fn() }));
const sync = vi.hoisted(() => ({ callback: null, unsubscribe: vi.fn() }));
vi.mock('../../lib/catalogApi.js', () => ({ listPublicCatalogBranches: api.branches, listPublicCatalogPromotions: api.promotions }));
vi.mock('../../../../lib/catalogSync.js', () => ({ subscribeCatalogSync: (callback) => { sync.callback = callback; return sync.unsubscribe; } }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => ({ isAuthenticated: false }) }));
vi.mock('../../../../components/branding/MasterfadeLogo.jsx', () => ({ default: () => null }));
vi.mock('../../../../components/theme/ThemeSwitcher.jsx', () => ({ default: () => null }));
vi.mock('../../../../components/navigation/PremiumBottomNav.jsx', () => ({ default: () => null }));

const branches = [{ id_sucursal: 'A', nombre_sucursal: 'Sucursal A' }, { id_sucursal: 'B', nombre_sucursal: 'Sucursal B' }];
const result = (title) => ({ promotions: [{ id_promocion: title, titulo: title }] });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const selectB = () => fireEvent.click(screen.getByRole('button', { name: 'Sucursal B' }));
const selectA = () => fireEvent.click(screen.getByRole('button', { name: 'Sucursal A' }));
beforeEach(() => {
  vi.resetAllMocks(); sync.callback = null;
  api.branches.mockResolvedValue({ branches });
  api.promotions.mockResolvedValue(result('Inicial A'));
});
afterEach(cleanup);

test('respuesta A tardía no sustituye B', async () => {
  const a = deferred(); api.promotions.mockReturnValueOnce(a.promise).mockResolvedValueOnce(result('Vigente B'));
  render(<PromotionsPage />);
  await screen.findByRole('button', { name: 'Sucursal B' }); selectB();
  await screen.findByText('Vigente B');
  await act(async () => a.resolve(result('Obsoleta A')));
  expect(screen.queryByText('Obsoleta A')).not.toBeInTheDocument();
  expect(screen.getByText('Vigente B')).toBeInTheDocument();
  expect(api.promotions).toHaveBeenCalledTimes(2);
});

test('error A tardío no altera el éxito B', async () => {
  const a = deferred(); api.promotions.mockReturnValueOnce(a.promise).mockResolvedValueOnce(result('Vigente B'));
  render(<PromotionsPage />); await screen.findByRole('button', { name: 'Sucursal B' }); selectB();
  await screen.findByText('Vigente B');
  await act(async () => a.reject(new Error('fallo antiguo')));
  expect(screen.getByText('Vigente B')).toBeInTheDocument();
  expect(screen.queryByText('Error de promociones')).not.toBeInTheDocument();
});

test('A → B → A descarta la primera A aunque vuelva a coincidir la sucursal', async () => {
  const a = deferred(), b = deferred();
  api.promotions.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise).mockResolvedValueOnce(result('Nueva A'));
  render(<PromotionsPage />); await screen.findByRole('button', { name: 'Sucursal B' }); selectB(); selectA();
  await screen.findByText('Nueva A');
  await act(async () => { a.resolve(result('Vieja A')); b.resolve(result('Vieja B')); });
  expect(screen.getByText('Nueva A')).toBeInTheDocument();
  expect(screen.queryByText('Vieja A')).not.toBeInTheDocument();
  expect(screen.queryByText('Vieja B')).not.toBeInTheDocument();
  expect(api.promotions).toHaveBeenCalledTimes(3);
});

test('catalogSync usa la misma generación y mantiene la sucursal vigente', async () => {
  render(<PromotionsPage />); await screen.findByText('Inicial A');
  const old = deferred(); api.promotions.mockReturnValueOnce(old.promise).mockResolvedValueOnce(result('Sync B'));
  act(() => { sync.callback(); }); selectB();
  await screen.findByText('Sync B');
  await act(async () => old.resolve(result('Sync A antigua')));
  expect(screen.queryByText('Sync A antigua')).not.toBeInTheDocument();
  expect(api.promotions).toHaveBeenLastCalledWith({ id_sucursal: 'B' });
  expect(api.promotions).toHaveBeenCalledTimes(3);
});

test('desmontaje ignora respuestas pendientes y cancela la suscripción', async () => {
  const pending = deferred(); api.promotions.mockReturnValueOnce(pending.promise);
  const view = render(<PromotionsPage />);
  await waitFor(() => expect(api.promotions).toHaveBeenCalledOnce()); view.unmount();
  await act(async () => pending.resolve(result('Respuesta desmontada')));
  act(() => { sync.callback(); });
  expect(sync.unsubscribe).toHaveBeenCalledOnce();
  expect(api.promotions).toHaveBeenCalledOnce();
});

test('error técnico vigente se reemplaza por mensaje seguro y permite reintento manual', async () => {
  api.promotions.mockRejectedValueOnce({ data: { error: { message: 'SQL host secreto stack token' } } });
  render(<PromotionsPage />); await screen.findByText('Error de promociones');
  expect(screen.queryByText('SQL host secreto stack token')).not.toBeInTheDocument();
  expect(screen.getByText('No se pudieron cargar las promociones. Inténtalo nuevamente.')).toBeInTheDocument();
  expect(api.promotions).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await screen.findByText('Inicial A');
  expect(api.promotions).toHaveBeenCalledTimes(2);
  expect(api.branches).toHaveBeenCalledOnce();
});

test('vacío legítimo no es un error ni genera reintentos', async () => {
  api.promotions.mockResolvedValue({ promotions: [] });
  render(<PromotionsPage />); await screen.findByText('Sin promociones publicadas');
  expect(screen.queryByText('Error de promociones')).not.toBeInTheDocument();
  expect(api.promotions).toHaveBeenCalledOnce();
});

test('reintento tras fallo de sucursales recupera selector sin consultar globalmente', async () => {
  api.branches.mockRejectedValueOnce(new Error('detalle privado de sucursales'));
  render(<PromotionsPage />); await screen.findByText('Error de promociones');
  expect(screen.queryByText('detalle privado de sucursales')).not.toBeInTheDocument();
  expect(api.promotions).not.toHaveBeenCalled();
  act(() => { sync.callback(); });
  expect(api.promotions).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await screen.findByText('Inicial A');
  expect(api.branches).toHaveBeenCalledTimes(2);
  expect(api.promotions).toHaveBeenCalledOnce();
  expect(api.promotions).toHaveBeenCalledWith({ id_sucursal: 'A' });
});

test('cambiar sucursal retira inmediatamente los datos anteriores mientras carga', async () => {
  render(<PromotionsPage />); await screen.findByText('Inicial A');
  const b = deferred(); api.promotions.mockReturnValueOnce(b.promise); selectB();
  expect(screen.queryByText('Inicial A')).not.toBeInTheDocument();
  expect(screen.getByText('Cargando promociones')).toBeInTheDocument();
  await act(async () => b.resolve(result('Nueva B')));
  expect(screen.getByText('Nueva B')).toBeInTheDocument();
});

test('StrictMode no duplica cargas iniciales', async () => {
  render(<StrictMode><PromotionsPage /></StrictMode>); await screen.findByText('Inicial A');
  expect(api.branches).toHaveBeenCalledOnce();
  expect(api.promotions).toHaveBeenCalledOnce();
});
