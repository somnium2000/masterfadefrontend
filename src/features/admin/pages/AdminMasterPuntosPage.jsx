import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Coins, Loader2, Search, UserRound, Users } from 'lucide-react';
import ActionConfirmDialog from '../../../components/feedback/ActionConfirmDialog.jsx';
import { Button } from '../../../components/ui/button.jsx';
import { Input } from '../../../components/ui/input.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import { listAdminPersonasClientes } from '../lib/adminPersonasApi.js';
import {
  createAdminClientePuntosAjuste,
  getAdminClientePuntosResumen,
} from '../lib/adminMasterPuntosApi.js';

const MIN_REASON_LENGTH = 5;
const DEFAULT_REWARD_TARGET = 10;

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeSearchText(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function toSafeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatSignedPoints(value) {
  const points = toSafeInteger(value, 0);
  return `${points >= 0 ? '+' : ''}${points}`;
}

function formatDate(value) {
  if (!value) return 'Sin fecha';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Sin fecha';
  return parsed.toLocaleDateString('es-HN', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function resolveMovementOriginLabel(origin) {
  const normalized = normalizeText(origin).toLowerCase();
  if (normalized === 'titular') return 'Titular';
  if (normalized === 'integrante') return 'Acompanante';
  return 'Sistema';
}

function resolveApiErrorMessage(error, fallbackMessage) {
  const status = Number(error?.status || 0);
  if (status === 401) return 'Tu sesion expiro. Inicia sesion nuevamente.';
  if (status === 403) return 'No tienes permisos para administrar puntos.';
  if (status === 409) {
    return error?.data?.error?.message || error?.message || 'La operacion fue rechazada porque dejaria el saldo en negativo.';
  }
  return error?.data?.error?.message || error?.message || fallbackMessage;
}

function normalizeClienteRecord(cliente = {}, index = 0) {
  const idCliente = normalizeText(cliente?.id_cliente || cliente?.id || cliente?.value);
  if (!idCliente) return null;
  return {
    key: `${idCliente}_${index}`,
    id_cliente: idCliente,
    nombre_completo: normalizeText(cliente?.nombre_completo || cliente?.nombre || 'Cliente'),
    telefono_principal: normalizeText(cliente?.telefono_principal || cliente?.telefono || ''),
    correo_principal: normalizeText(cliente?.correo_principal || cliente?.correo || ''),
  };
}

function normalizeMovementRecord(record = {}, index = 0) {
  return {
    id: normalizeText(record?.id_points_tx || record?.id_movimiento || record?.id || `mov_${index}`),
    created_at: record?.created_at || record?.fecha || null,
    motivo: normalizeText(record?.motivo || record?.descripcion || record?.tipo_movimiento || 'Movimiento de puntos'),
    origen_punto_codigo: normalizeText(record?.origen_punto_codigo || record?.origen || 'sistema').toLowerCase(),
    puntos: toSafeInteger(record?.puntos ?? record?.puntos_ajustados ?? record?.delta_puntos, 0),
  };
}

function normalizeSummary(payload) {
  const root = payload?.data || payload || {};
  const summarySource = root?.resumen || root?.summary || root;
  const rewardTarget = Math.max(
    1,
    toSafeInteger(summarySource?.puntos_para_premio ?? root?.puntos_para_premio, DEFAULT_REWARD_TARGET)
  );
  const totalBalance = toSafeInteger(summarySource?.saldo_total ?? summarySource?.balance_puntos ?? root?.saldo_total, 0);
  const progressRaw = summarySource?.progreso_actual ?? root?.progreso_actual;
  const progressCurrent = progressRaw == null
    ? ((totalBalance % rewardTarget) + rewardTarget) % rewardTarget
    : Math.max(0, toSafeInteger(progressRaw, 0));
  const movementSource = summarySource?.historial || summarySource?.movimientos || root?.historial || root?.movimientos || [];

  return {
    cliente: {
      nombre_completo: normalizeText(root?.cliente?.nombre_completo || summarySource?.nombre_cliente || 'Cliente'),
      telefono_principal: normalizeText(root?.cliente?.telefono_principal || summarySource?.telefono_principal || ''),
      correo_principal: normalizeText(root?.cliente?.correo_principal || summarySource?.correo_principal || ''),
    },
    totalBalance,
    titularPoints: Math.max(0, toSafeInteger(summarySource?.puntos_titular ?? root?.puntos_titular, 0)),
    companionPoints: Math.max(0, toSafeInteger(summarySource?.puntos_integrante ?? root?.puntos_integrante, 0)),
    rewardTarget,
    progressCurrent: Math.min(rewardTarget, progressCurrent),
    canRedeem: Boolean(summarySource?.puede_canjear ?? root?.puede_canjear ?? totalBalance >= rewardTarget),
    history: Array.isArray(movementSource)
      ? movementSource.slice(0, 20).map((item, index) => normalizeMovementRecord(item, index))
      : [],
  };
}

export default function AdminMasterPuntosPage() {
  const navigate = useNavigate();
  const notifications = useNotifications();
  const { roles } = useAuth();

  const [clientes, setClientes] = useState([]);
  const [clientesLoading, setClientesLoading] = useState(true);
  const [clientesError, setClientesError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedClienteId, setSelectedClienteId] = useState('');

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');

  const [ajustePoints, setAjustePoints] = useState('');
  const [ajusteReason, setAjusteReason] = useState('');
  const [savingAdjustment, setSavingAdjustment] = useState(false);
  const [negativeConfirmOpen, setNegativeConfirmOpen] = useState(false);

  const canManagePoints = useMemo(() => {
    const roleList = Array.isArray(roles) ? roles.map((role) => normalizeText(role).toLowerCase()) : [];
    return roleList.includes('admin') || roleList.includes('super_admin');
  }, [roles]);

  const filteredClientes = useMemo(() => {
    const query = normalizeSearchText(search);
    if (!query) return clientes;
    return clientes.filter((cliente) => {
      const searchable = normalizeSearchText(
        `${cliente.nombre_completo} ${cliente.telefono_principal} ${cliente.correo_principal}`
      );
      return searchable.includes(query);
    });
  }, [clientes, search]);

  const parsedPoints = toSafeInteger(ajustePoints, 0);
  const reasonTrimmed = normalizeText(ajusteReason);
  const pointsAreValid = Number.isInteger(parsedPoints) && parsedPoints !== 0 && String(ajustePoints).trim() !== '';
  const reasonIsValid = reasonTrimmed.length >= MIN_REASON_LENGTH;
  const canSubmitAdjustment = Boolean(
    canManagePoints
    && selectedClienteId
    && pointsAreValid
    && reasonIsValid
    && !savingAdjustment
  );

  const loadClientes = useCallback(async () => {
    setClientesLoading(true);
    setClientesError('');
    try {
      const response = await listAdminPersonasClientes();
      const payload = response?.data || response || {};
      const nextClientes = Array.isArray(payload?.clientes)
        ? payload.clientes.map((item, index) => normalizeClienteRecord(item, index)).filter(Boolean)
        : [];
      setClientes(nextClientes);
      if (!selectedClienteId && nextClientes.length) {
        setSelectedClienteId(nextClientes[0].id_cliente);
      }
    } catch (error) {
      const status = Number(error?.status || 0);
      if (status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      if (status === 403) {
        navigate('/unauthorized', { replace: true });
        return;
      }
      setClientesError(resolveApiErrorMessage(error, 'No se pudo cargar la lista de clientes.'));
      setClientes([]);
    } finally {
      setClientesLoading(false);
    }
  }, [navigate, selectedClienteId]);

  const loadSummary = useCallback(async (idCliente) => {
    const safeId = normalizeText(idCliente);
    if (!safeId) {
      setSummary(null);
      return;
    }
    setSummaryLoading(true);
    setSummaryError('');
    try {
      const response = await getAdminClientePuntosResumen(safeId);
      setSummary(normalizeSummary(response?.data || response));
    } catch (error) {
      const status = Number(error?.status || 0);
      if (status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      if (status === 403) {
        navigate('/unauthorized', { replace: true });
        return;
      }
      setSummaryError(resolveApiErrorMessage(error, 'No se pudo cargar el resumen de puntos del cliente.'));
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (!canManagePoints) {
      navigate('/unauthorized', { replace: true });
      return;
    }
    void loadClientes();
  }, [canManagePoints, loadClientes, navigate]);

  useEffect(() => {
    if (!selectedClienteId) return;
    void loadSummary(selectedClienteId);
  }, [selectedClienteId, loadSummary]);

  const selectedCliente = useMemo(
    () => clientes.find((cliente) => cliente.id_cliente === selectedClienteId) || null,
    [clientes, selectedClienteId]
  );

  async function applyAdjustment() {
    if (!canSubmitAdjustment) return;
    setSavingAdjustment(true);
    setSummaryError('');
    try {
      await createAdminClientePuntosAjuste(selectedClienteId, {
        puntos: parsedPoints,
        motivo: reasonTrimmed,
      });
      notifications.success('Ajuste aplicado correctamente.');
      setAjustePoints('');
      setAjusteReason('');
      await loadSummary(selectedClienteId);
    } catch (error) {
      const status = Number(error?.status || 0);
      if (status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      if (status === 403) {
        navigate('/unauthorized', { replace: true });
        return;
      }
      setSummaryError(resolveApiErrorMessage(error, 'No fue posible aplicar el ajuste.'));
    } finally {
      setSavingAdjustment(false);
    }
  }

  function handleSubmitAdjustment(event) {
    event.preventDefault();
    if (!canSubmitAdjustment) return;
    if (parsedPoints < 0) {
      setNegativeConfirmOpen(true);
      return;
    }
    void applyAdjustment();
  }

  return (
    <div className="space-y-4 px-2 pb-4 sm:px-4 sm:pb-6">
      <header className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)] p-4 sm:p-5">
        <p className="text-xs uppercase tracking-[0.22em] text-[var(--mf-accent)]">Superpuntos</p>
        <h1 className="mf-font-display mt-1 text-3xl text-[var(--mf-text)] sm:text-4xl">Ruta a tu Cortesia</h1>
        <p className="mt-2 text-sm text-[var(--mf-text-2)]">
          Consulta el resumen de puntos por cliente y aplica ajustes manuales con auditoria.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[320px,1fr]">
        <article className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-card)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--mf-accent)]">Buscar cliente</p>
          <div className="relative mt-2">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mf-text-2)]" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
              placeholder="Nombre, telefono o correo"
            />
          </div>

          <div className="mt-3">
            <label className="mf-label">Cliente</label>
            <select
              className="mf-select mt-1"
              value={selectedClienteId}
              onChange={(event) => setSelectedClienteId(event.target.value)}
              disabled={clientesLoading}
            >
              {filteredClientes.length === 0 ? <option value="">Sin clientes</option> : null}
              {filteredClientes.map((cliente) => (
                <option key={cliente.key} value={cliente.id_cliente}>
                  {cliente.nombre_completo}
                  {cliente.telefono_principal ? ` · ${cliente.telefono_principal}` : ''}
                </option>
              ))}
            </select>
          </div>

          {clientesError ? (
            <p className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {clientesError}
            </p>
          ) : null}

          {selectedCliente ? (
            <div className="mt-3 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2 text-sm text-[var(--mf-text-2)]">
              <p className="font-semibold text-[var(--mf-text)]">{selectedCliente.nombre_completo || 'Cliente seleccionado'}</p>
              {selectedCliente.telefono_principal ? <p>{selectedCliente.telefono_principal}</p> : null}
              {selectedCliente.correo_principal ? <p>{selectedCliente.correo_principal}</p> : null}
            </div>
          ) : null}

          <Button
            type="button"
            variant="outline"
            className="mt-3 w-full"
            onClick={() => void loadSummary(selectedClienteId)}
            disabled={!selectedClienteId || summaryLoading}
          >
            {summaryLoading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Actualizando...
              </span>
            ) : (
              'Refrescar resumen'
            )}
          </Button>
        </article>

        <article className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-card)] p-4">
          {summaryLoading ? (
            <div className="space-y-3">
              <div className="mf-skeleton h-20 w-full rounded-xl" />
              <div className="mf-skeleton h-36 w-full rounded-xl" />
              <div className="mf-skeleton h-40 w-full rounded-xl" />
            </div>
          ) : summary ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <article className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[var(--mf-text-2)]">Saldo total</p>
                  <p className="mt-1 inline-flex items-center gap-1 text-2xl font-semibold text-[var(--mf-accent)]">
                    <Coins size={17} />
                    {summary.totalBalance}
                  </p>
                </article>
                <article className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[var(--mf-text-2)]">Titular</p>
                  <p className="mt-1 inline-flex items-center gap-1 text-2xl font-semibold text-[var(--mf-text)]">
                    <UserRound size={17} />
                    {summary.titularPoints}
                  </p>
                </article>
                <article className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[var(--mf-text-2)]">Acompanantes</p>
                  <p className="mt-1 inline-flex items-center gap-1 text-2xl font-semibold text-[var(--mf-text)]">
                    <Users size={17} />
                    {summary.companionPoints}
                  </p>
                </article>
              </div>

              <div className="mt-3 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.13em] text-[var(--mf-text-2)]">
                  <span>Progreso actual</span>
                  <span>{summary.progressCurrent}/{summary.rewardTarget}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[color:color-mix(in_srgb,var(--mf-nav-border)_70%,transparent)]">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,var(--mf-accent),color-mix(in_srgb,var(--mf-accent)_72%,white_28%))]"
                    style={{ width: `${Math.min(100, (summary.progressCurrent / summary.rewardTarget) * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-sm text-[var(--mf-text-2)]">
                  {summary.canRedeem
                    ? 'Cliente con recompensa disponible.'
                    : `Faltan ${Math.max(0, summary.rewardTarget - summary.progressCurrent)} puntos para la recompensa.`}
                </p>
              </div>

              <form onSubmit={handleSubmitAdjustment} className="mt-4 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[var(--mf-accent)]">Ajuste manual</p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mf-label">Puntos (+ / -)</label>
                    <Input
                      type="number"
                      step="1"
                      value={ajustePoints}
                      onChange={(event) => setAjustePoints(event.target.value)}
                      placeholder="Ej. 3 o -3"
                      disabled={savingAdjustment}
                    />
                  </div>
                  <div>
                    <label className="mf-label">Motivo (min. 5)</label>
                    <Input
                      value={ajusteReason}
                      onChange={(event) => setAjusteReason(event.target.value)}
                      placeholder="Describe el ajuste"
                      maxLength={280}
                      disabled={savingAdjustment}
                    />
                  </div>
                </div>
                <p className="mt-2 text-xs text-[var(--mf-text-2)]">
                  Usa valores enteros distintos de 0.
                </p>
                <Button type="submit" className="mt-3" disabled={!canSubmitAdjustment}>
                  {savingAdjustment ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" />
                      Aplicando...
                    </span>
                  ) : (
                    'Aplicar ajuste'
                  )}
                </Button>
              </form>

              <div className="mt-4 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[var(--mf-accent)]">Historial compacto</p>
                {summary.history.length ? (
                  <div className="mt-3 space-y-2">
                    {summary.history.map((movement) => {
                      const positive = movement.puntos >= 0;
                      return (
                        <article
                          key={movement.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-[var(--mf-nav-border)] px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[var(--mf-text)]">{movement.motivo}</p>
                            <p className="text-xs text-[var(--mf-text-2)]">
                              {formatDate(movement.created_at)} · {resolveMovementOriginLabel(movement.origen_punto_codigo)}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${positive ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
                              {formatSignedPoints(movement.puntos)}
                            </span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-[var(--mf-text-2)]">No hay movimientos registrados.</p>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-4 text-sm text-[var(--mf-text-2)]">
              Selecciona un cliente para ver su resumen de puntos.
            </div>
          )}

          {summaryError ? (
            <p className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {summaryError}
            </p>
          ) : null}
        </article>
      </section>

      <ActionConfirmDialog
        open={negativeConfirmOpen}
        onOpenChange={setNegativeConfirmOpen}
        tone="danger"
        title="Confirmar ajuste negativo"
        description="Estas por aplicar un ajuste negativo de puntos. Confirma para continuar."
        confirmLabel="Si, aplicar ajuste"
        cancelLabel="Cancelar"
        loading={savingAdjustment}
        onConfirm={() => {
          setNegativeConfirmOpen(false);
          void applyAdjustment();
        }}
      />
    </div>
  );
}
