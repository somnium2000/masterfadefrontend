import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ChevronsUpDown, Coins, Loader2, Search, UserRound, Users } from 'lucide-react';
import ActionConfirmDialog from '../../../components/feedback/ActionConfirmDialog.jsx';
import { Button } from '../../../components/ui/button.jsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog.jsx';
import { Input } from '../../../components/ui/input.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import {
  createAdminClientePuntosAjuste,
  getAdminMasterPuntosRegalias,
  getAdminClientePuntosResumen,
  searchAdminClientesActivos,
  updateAdminMasterPuntosRegalias,
} from '../lib/adminMasterPuntosApi.js';

const MIN_REASON_LENGTH = 5;
const DEFAULT_REWARD_TARGET = 10;
const SEARCH_DEBOUNCE_MS = 320;
const CLIENT_SEARCH_MIN_LENGTH = 2;
const CLIENT_SEARCH_LIMIT = 10;
const HISTORY_PAGE_SIZE = 4;

function normalizeText(value) {
  return String(value || '').trim();
}

function toSafeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isPositiveIntegerString(value) {
  return /^\d+$/.test(normalizeText(value));
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
  const errorCode = String(error?.data?.error?.code || '').trim().toUpperCase();
  if (status === 401) return 'Tu sesion expiro. Inicia sesion nuevamente.';
  if (status === 403) return 'No tienes permisos para administrar puntos.';
  if (status === 422 || errorCode === 'POINTS_INSUFFICIENT_BALANCE') {
    return 'No hay puntos suficientes para completar la resta solicitada.';
  }
  if (status === 409) {
    return error?.data?.error?.message || error?.message || 'La operacion fue rechazada porque dejaria el saldo en negativo.';
  }
  return error?.data?.error?.message || error?.message || fallbackMessage;
}

function resolveClienteSecondaryLabel(cliente = {}) {
  if (cliente.telefono_principal) return cliente.telefono_principal;
  if (cliente.correo_principal) return cliente.correo_principal;
  return '';
}

function normalizeClienteRecord(cliente = {}, index = 0) {
  const idCliente = normalizeText(cliente?.id_cliente || cliente?.id || cliente?.value);
  if (!idCliente) return null;
  return {
    key: `${idCliente}_${index}`,
    id_cliente: idCliente,
    id_usuario: normalizeText(cliente?.id_usuario || ''),
    nombre_completo: normalizeText(cliente?.nombre_completo || cliente?.nombre_cliente || cliente?.nombre || 'Cliente'),
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

function normalizeRewardConfigPayload(payload = {}) {
  const root = payload?.data || payload || {};
  const servicios = Array.isArray(root?.servicios_catalogo) ? root.servicios_catalogo : [];
  const configuracion = root?.configuracion || {};
  return {
    regla: root?.regla || null,
    serviciosCatalogo: servicios.map((service) => ({
      id_servicio: normalizeText(service?.id_servicio),
      nombre_servicio: normalizeText(service?.nombre_servicio || 'Servicio'),
      grupo_catalogo: normalizeText(service?.grupo_catalogo || ''),
      orden_visual: toSafeInteger(service?.orden_visual, 100),
    })).filter((service) => service.id_servicio),
    seleccion: {
      sin_membresia: new Set(
        (Array.isArray(configuracion?.sin_membresia) ? configuracion.sin_membresia : [])
          .filter((item) => item?.habilitado !== false && item?.visible_cliente !== false)
          .map((item) => normalizeText(item?.id_servicio))
          .filter(Boolean)
      ),
      con_membresia: new Set(
        (Array.isArray(configuracion?.con_membresia) ? configuracion.con_membresia : [])
          .filter((item) => item?.habilitado !== false && item?.visible_cliente !== false)
          .map((item) => normalizeText(item?.id_servicio))
          .filter(Boolean)
      ),
    },
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

  const [searchResults, setSearchResults] = useState([]);
  const [clientesError, setClientesError] = useState('');
  const [clientePickerOpen, setClientePickerOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchingClientes, setSearchingClientes] = useState(false);
  const [selectedClienteId, setSelectedClienteId] = useState('');
  const [selectedClienteData, setSelectedClienteData] = useState(null);
  const summaryRequestSeqRef = useRef(0);
  const searchRequestSeqRef = useRef(0);

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [historyPage, setHistoryPage] = useState(0);

  const [ajustePointsAdd, setAjustePointsAdd] = useState('');
  const [ajustePointsSubtract, setAjustePointsSubtract] = useState('');
  const [ajusteReason, setAjusteReason] = useState('');
  const [savingAdjustment, setSavingAdjustment] = useState(false);
  const [negativeConfirmOpen, setNegativeConfirmOpen] = useState(false);
  const [rewardServices, setRewardServices] = useState([]);
  const [rewardRule, setRewardRule] = useState(null);
  const [rewardSelection, setRewardSelection] = useState({
    sin_membresia: new Set(),
    con_membresia: new Set(),
  });
  const [rewardConfigLoading, setRewardConfigLoading] = useState(false);
  const [rewardConfigSaving, setRewardConfigSaving] = useState(false);
  const [rewardConfigError, setRewardConfigError] = useState('');

  const canManagePoints = useMemo(() => {
    const roleList = Array.isArray(roles) ? roles.map((role) => normalizeText(role).toLowerCase()) : [];
    return roleList.includes('admin') || roleList.includes('super_admin');
  }, [roles]);

  const addTrimmed = normalizeText(ajustePointsAdd);
  const subtractTrimmed = normalizeText(ajustePointsSubtract);
  const hasAddInput = addTrimmed !== '';
  const hasSubtractInput = subtractTrimmed !== '';
  const pointsInputConflict = hasAddInput && hasSubtractInput;
  const addIsValid = !hasAddInput || (isPositiveIntegerString(addTrimmed) && toSafeInteger(addTrimmed, 0) > 0);
  const subtractIsValid = !hasSubtractInput || (isPositiveIntegerString(subtractTrimmed) && toSafeInteger(subtractTrimmed, 0) > 0);
  const parsedPointsToAdd = addIsValid && hasAddInput ? toSafeInteger(addTrimmed, 0) : 0;
  const parsedPointsToSubtract = subtractIsValid && hasSubtractInput ? toSafeInteger(subtractTrimmed, 0) : 0;
  const canUseAdd = hasAddInput && !hasSubtractInput && addIsValid;
  const canUseSubtract = hasSubtractInput && !hasAddInput && subtractIsValid;
  const adjustmentAction = canUseAdd ? 'sumar' : canUseSubtract ? 'restar' : '';
  const adjustmentPoints = canUseAdd ? parsedPointsToAdd : canUseSubtract ? parsedPointsToSubtract : 0;
  const parsedPoints = adjustmentAction === 'restar' ? -adjustmentPoints : adjustmentPoints;
  const reasonTrimmed = normalizeText(ajusteReason);
  const pointsAreValid = !pointsInputConflict
    && (hasAddInput || hasSubtractInput)
    && addIsValid
    && subtractIsValid
    && Boolean(adjustmentAction)
    && adjustmentPoints > 0;
  const reasonIsValid = reasonTrimmed.length >= MIN_REASON_LENGTH;
  const canSubmitAdjustment = Boolean(
    canManagePoints
    && selectedClienteId
    && pointsAreValid
    && reasonIsValid
    && !savingAdjustment
  );

  const history = Array.isArray(summary?.history) ? summary.history : [];
  const totalHistoryPages = Math.max(1, Math.ceil(history.length / HISTORY_PAGE_SIZE));
  const currentHistoryPage = Math.min(historyPage, totalHistoryPages - 1);
  const pagedHistory = history.slice(
    currentHistoryPage * HISTORY_PAGE_SIZE,
    (currentHistoryPage + 1) * HISTORY_PAGE_SIZE
  );
  const hasHistoryPagination = history.length > HISTORY_PAGE_SIZE;

  const loadRewardConfig = useCallback(async () => {
    setRewardConfigLoading(true);
    setRewardConfigError('');
    try {
      const response = await getAdminMasterPuntosRegalias();
      const normalized = normalizeRewardConfigPayload(response?.data || response);
      setRewardRule(normalized.regla);
      setRewardServices(normalized.serviciosCatalogo);
      setRewardSelection(normalized.seleccion);
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
      setRewardConfigError(resolveApiErrorMessage(error, 'No se pudo cargar la configuracion de servicios canjeables.'));
    } finally {
      setRewardConfigLoading(false);
    }
  }, [navigate]);

  const loadSummary = useCallback(async (idCliente, options = {}) => {
    const safeId = normalizeText(idCliente);
    const keepCurrent = Boolean(options?.keepCurrent);
    if (!safeId) {
      summaryRequestSeqRef.current += 1;
      setSummary(null);
      setSummaryLoading(false);
      setSummaryError('');
      return;
    }
    const requestSeq = summaryRequestSeqRef.current + 1;
    summaryRequestSeqRef.current = requestSeq;
    setSummaryLoading(true);
    setSummaryError('');
    if (!keepCurrent) {
      setSummary(null);
    }
    try {
      const response = await getAdminClientePuntosResumen(safeId);
      if (summaryRequestSeqRef.current !== requestSeq) return;
      const nextSummary = normalizeSummary(response?.data || response);
      setSummary(nextSummary);
      setSelectedClienteData((current) => {
        const nextNombre = normalizeText(nextSummary?.cliente?.nombre_completo);
        const nextTelefono = normalizeText(nextSummary?.cliente?.telefono_principal);
        const nextCorreo = normalizeText(nextSummary?.cliente?.correo_principal);
        if (!nextNombre && !nextTelefono && !nextCorreo) {
          return current;
        }
        return {
          key: `${safeId}_selected`,
          id_cliente: safeId,
          nombre_completo: nextNombre || current?.nombre_completo || 'Cliente',
          telefono_principal: nextTelefono || current?.telefono_principal || '',
          correo_principal: nextCorreo || current?.correo_principal || '',
        };
      });
    } catch (error) {
      if (summaryRequestSeqRef.current !== requestSeq) return;
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
      if (summaryRequestSeqRef.current === requestSeq) {
        setSummaryLoading(false);
      }
    }
  }, [navigate]);

  useEffect(() => {
    if (!canManagePoints) {
      navigate('/unauthorized', { replace: true });
      return undefined;
    }
    void loadRewardConfig();
    return undefined;
  }, [canManagePoints, loadRewardConfig, navigate]);

  useEffect(() => {
    if (!selectedClienteId) {
      summaryRequestSeqRef.current += 1;
      setSummary(null);
      setSummaryLoading(false);
      return;
    }
    void loadSummary(selectedClienteId);
  }, [selectedClienteId, loadSummary]);

  useEffect(() => {
    const normalized = normalizeText(searchDraft);
    if (normalized === debouncedSearch) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setDebouncedSearch(normalized);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [debouncedSearch, searchDraft]);

  useEffect(() => {
    if (!clientePickerOpen) return;

    const query = normalizeText(debouncedSearch);
    if (query.length < CLIENT_SEARCH_MIN_LENGTH) {
      searchRequestSeqRef.current += 1;
      setSearchResults([]);
      setClientesError('');
      setSearchingClientes(false);
      return;
    }

    const requestSeq = searchRequestSeqRef.current + 1;
    searchRequestSeqRef.current = requestSeq;
    setSearchingClientes(true);
    setClientesError('');

    void (async () => {
      try {
        const response = await searchAdminClientesActivos(query, { limit: CLIENT_SEARCH_LIMIT });
        if (searchRequestSeqRef.current !== requestSeq) return;
        const payload = response?.data || response || {};
        const nextResults = Array.isArray(payload?.clientes)
          ? payload.clientes.map((item, index) => normalizeClienteRecord(item, index)).filter(Boolean)
          : [];
        setSearchResults(nextResults);
      } catch (error) {
        if (searchRequestSeqRef.current !== requestSeq) return;
        const status = Number(error?.status || 0);
        if (status === 401) {
          navigate('/login', { replace: true });
          return;
        }
        if (status === 403) {
          navigate('/unauthorized', { replace: true });
          return;
        }
        setClientesError(resolveApiErrorMessage(error, 'No se pudo buscar clientes activos.'));
        setSearchResults([]);
      } finally {
        if (searchRequestSeqRef.current === requestSeq) {
          setSearchingClientes(false);
        }
      }
    })();
  }, [clientePickerOpen, debouncedSearch, navigate]);

  useEffect(() => {
    setHistoryPage(0);
  }, [selectedClienteId, history.length]);

  const selectedCliente = useMemo(() => {
    if (selectedClienteData?.id_cliente && selectedClienteData.id_cliente === selectedClienteId) {
      return selectedClienteData;
    }
    if (!selectedClienteId) return null;
    if (!summary?.cliente) return null;
    return {
      key: `${selectedClienteId}_summary`,
      id_cliente: selectedClienteId,
      nombre_completo: normalizeText(summary.cliente.nombre_completo || 'Cliente'),
      telefono_principal: normalizeText(summary.cliente.telefono_principal || ''),
      correo_principal: normalizeText(summary.cliente.correo_principal || ''),
    };
  }, [selectedClienteData, selectedClienteId, summary]);

  async function applyAdjustment() {
    if (!canSubmitAdjustment) return;
    setSavingAdjustment(true);
    setSummaryError('');
    try {
      await createAdminClientePuntosAjuste(selectedClienteId, {
        accion: adjustmentAction,
        puntos: adjustmentPoints,
        motivo: reasonTrimmed,
      });
      notifications.success('Ajuste aplicado correctamente.');
      setAjustePointsAdd('');
      setAjustePointsSubtract('');
      setAjusteReason('');
      await loadSummary(selectedClienteId, { keepCurrent: true });
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
    if (adjustmentAction === 'restar') {
      setNegativeConfirmOpen(true);
      return;
    }
    void applyAdjustment();
  }

  function handleSelectCliente(cliente) {
    const safeId = normalizeText(cliente?.id_cliente);
    if (!safeId) return;
    setSelectedClienteId(safeId);
    setSelectedClienteData(normalizeClienteRecord(cliente, 0));
    setClientePickerOpen(false);
    setSearchDraft('');
    setDebouncedSearch('');
    setSearchResults([]);
    setClientesError('');
    setSearchingClientes(false);
  }

  function toggleRewardService(condition, serviceId) {
    const safeCondition = normalizeText(condition);
    const safeServiceId = normalizeText(serviceId);
    if (!safeServiceId || !['sin_membresia', 'con_membresia'].includes(safeCondition)) return;
    setRewardSelection((current) => {
      const nextSet = new Set(current?.[safeCondition] || []);
      if (nextSet.has(safeServiceId)) {
        nextSet.delete(safeServiceId);
      } else {
        nextSet.add(safeServiceId);
      }
      return {
        sin_membresia: safeCondition === 'sin_membresia' ? nextSet : new Set(current?.sin_membresia || []),
        con_membresia: safeCondition === 'con_membresia' ? nextSet : new Set(current?.con_membresia || []),
      };
    });
  }

  async function handleSaveRewardConfig() {
    if (rewardConfigSaving) return;
    setRewardConfigSaving(true);
    setRewardConfigError('');
    try {
      const response = await updateAdminMasterPuntosRegalias({
        sin_membresia: Array.from(rewardSelection.sin_membresia || []),
        con_membresia: Array.from(rewardSelection.con_membresia || []),
      });
      const normalized = normalizeRewardConfigPayload(response?.data || response);
      setRewardRule(normalized.regla);
      setRewardServices(normalized.serviciosCatalogo);
      setRewardSelection(normalized.seleccion);
      notifications.success('Configuracion de servicios canjeables guardada.');
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
      setRewardConfigError(resolveApiErrorMessage(error, 'No se pudo guardar la configuracion de servicios canjeables.'));
    } finally {
      setRewardConfigSaving(false);
    }
  }

  return (
    <div className="space-y-4 overflow-x-hidden px-2 pb-4 sm:px-4 sm:pb-6">
      <header className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)] p-4 sm:p-5">
        <p className="text-xs uppercase tracking-[0.22em] text-[var(--mf-accent)]">Superpuntos</p>
        <h1 className="mf-font-display mt-1 text-3xl text-[var(--mf-text)] sm:text-4xl">Ruta a tu Cortesia</h1>
        <p className="mt-2 text-sm text-[var(--mf-text-2)]">
          Consulta el resumen de puntos por cliente y aplica ajustes manuales con auditoria.
        </p>
      </header>

      <section className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-card)] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--mf-accent)]">
              Servicios canjeables con MasterPuntos
            </p>
            <p className="mt-1 text-sm text-[var(--mf-text-2)]">
              Estos servicios apareceran en Ruta a tu cortesia segun si el cliente tiene membresia activa o no.
            </p>
            {rewardRule?.puntos_para_premio ? (
              <p className="mt-1 text-xs text-[var(--mf-text-2)]">
                Regla global activa: {rewardRule.puntos_para_premio} puntos por recompensa.
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            onClick={handleSaveRewardConfig}
            disabled={rewardConfigLoading || rewardConfigSaving}
            className="w-full lg:w-auto"
          >
            {rewardConfigSaving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Guardando...
              </span>
            ) : (
              'Guardar configuracion'
            )}
          </Button>
        </div>

        {rewardConfigError ? (
          <p className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {rewardConfigError}
          </p>
        ) : null}

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {[
            ['sin_membresia', 'Clientes sin membresia'],
            ['con_membresia', 'Clientes con membresia'],
          ].map(([condition, label]) => (
            <article key={condition} className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--mf-text)]">{label}</p>
                <span className="rounded-full border border-[var(--mf-nav-border)] px-2 py-1 text-xs text-[var(--mf-text-2)]">
                  {rewardSelection?.[condition]?.size || 0} activos
                </span>
              </div>

              {rewardConfigLoading ? (
                <div className="mt-3 space-y-2">
                  <div className="mf-skeleton h-9 rounded-lg" />
                  <div className="mf-skeleton h-9 rounded-lg" />
                  <div className="mf-skeleton h-9 rounded-lg" />
                </div>
              ) : rewardServices.length ? (
                <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                  {rewardServices.map((service) => {
                    const checked = rewardSelection?.[condition]?.has(service.id_servicio) || false;
                    return (
                      <label
                        key={`${condition}_${service.id_servicio}`}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--mf-nav-border)] px-3 py-2 text-sm transition-colors hover:border-[var(--mf-btn-border)]"
                      >
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 accent-[var(--mf-accent)]"
                          checked={checked}
                          disabled={rewardConfigSaving}
                          onChange={() => toggleRewardService(condition, service.id_servicio)}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-[var(--mf-text)]">{service.nombre_servicio}</span>
                          {service.grupo_catalogo ? (
                            <span className="block truncate text-xs text-[var(--mf-text-2)]">{service.grupo_catalogo}</span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-3 rounded-lg border border-[var(--mf-nav-border)] px-3 py-2 text-sm text-[var(--mf-text-2)]">
                  No hay servicios agendables disponibles para configurar.
                </p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[320px,1fr]">
        <article className="min-w-0 rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-card)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--mf-accent)]">Cliente activo</p>
          <Button
            type="button"
            variant="outline"
            className="mt-2 w-full justify-between"
            onClick={() => setClientePickerOpen(true)}
          >
            <span className="min-w-0 truncate text-left">
              {selectedCliente?.nombre_completo || 'Seleccionar cliente activo'}
            </span>
            <ChevronsUpDown size={16} />
          </Button>

          {clientesError ? (
            <p className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {clientesError}
            </p>
          ) : null}

          {selectedCliente ? (
            <div className="mt-3 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2 text-sm text-[var(--mf-text-2)]">
              <p className="truncate font-semibold text-[var(--mf-text)]">{selectedCliente.nombre_completo || 'Cliente seleccionado'}</p>
              {resolveClienteSecondaryLabel(selectedCliente) ? (
                <p className="truncate">{resolveClienteSecondaryLabel(selectedCliente)}</p>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2 text-sm text-[var(--mf-text-2)]">
              Selecciona un cliente activo para cargar el resumen automaticamente.
            </p>
          )}

          {summaryLoading && selectedClienteId ? (
            <p className="mt-3 inline-flex items-center gap-2 text-xs text-[var(--mf-text-2)]">
              <Loader2 size={14} className="animate-spin" />
              Cargando resumen del cliente...
            </p>
          ) : null}
        </article>

        <article className="min-w-0 rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-card)] p-4">
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
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div>
                    <label className="mf-label">Sumar puntos</label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      value={ajustePointsAdd}
                      onChange={(event) => setAjustePointsAdd(event.target.value)}
                      placeholder="Ej. 10"
                      disabled={savingAdjustment || hasSubtractInput}
                    />
                  </div>
                  <div>
                    <label className="mf-label">Restar puntos</label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      value={ajustePointsSubtract}
                      onChange={(event) => setAjustePointsSubtract(event.target.value)}
                      placeholder="Ej. 3"
                      disabled={savingAdjustment || hasAddInput}
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
                  {pointsInputConflict
                    ? 'Ingresa solo sumar o restar, no ambos.'
                    : (hasAddInput || hasSubtractInput
                        ? (addIsValid && subtractIsValid
                            ? `Resultado neto: ${formatSignedPoints(parsedPoints)} puntos.`
                            : 'Ingresa solo enteros positivos en sumar/restar.')
                        : 'Ingresa enteros positivos en sumar o restar.')
                }
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
                {history.length ? (
                  <div className="mt-3 space-y-2">
                    {hasHistoryPagination ? (
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-xs text-[var(--mf-text-2)]">
                          Pagina {currentHistoryPage + 1} de {totalHistoryPages}
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setHistoryPage((page) => Math.max(0, page - 1))}
                            disabled={currentHistoryPage === 0}
                            aria-label="Pagina anterior"
                          >
                            <ChevronLeft size={14} />
                            Anterior
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setHistoryPage((page) => Math.min(totalHistoryPages - 1, page + 1))}
                            disabled={currentHistoryPage >= totalHistoryPages - 1}
                            aria-label="Pagina siguiente"
                          >
                            Siguiente
                            <ChevronRight size={14} />
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    {pagedHistory.map((movement) => {
                      const positive = movement.puntos >= 0;
                      return (
                        <article
                          key={movement.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-[var(--mf-nav-border)] px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[var(--mf-text)]">{movement.motivo}</p>
                            <p className="text-xs text-[var(--mf-text-2)]">
                              {formatDate(movement.created_at)} | {resolveMovementOriginLabel(movement.origen_punto_codigo)}
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

      <Dialog
        open={clientePickerOpen}
        onOpenChange={(nextOpen) => {
          setClientePickerOpen(nextOpen);
          if (!nextOpen) {
            searchRequestSeqRef.current += 1;
            setSearchDraft('');
            setDebouncedSearch('');
            setSearchResults([]);
            setClientesError('');
            setSearchingClientes(false);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Seleccionar cliente activo</DialogTitle>
            <DialogDescription>
              Busca por nombre, telefono o correo. Al seleccionar, el resumen se actualiza automaticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mf-text-2)]" />
            <Input
              autoFocus
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              className="pl-9"
              placeholder="Nombre, telefono o correo"
              aria-label="Buscar cliente activo"
            />
          </div>

          <div className="mt-3 max-h-[55vh] overflow-y-auto rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-2">
            {searchingClientes ? (
              <div className="flex items-center gap-2 px-2 py-3 text-sm text-[var(--mf-text-2)]">
                <Loader2 size={14} className="animate-spin" />
                Buscando clientes activos...
              </div>
            ) : null}

            {!searchingClientes && clientesError ? (
              <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {clientesError}
              </p>
            ) : null}

            {!searchingClientes && !clientesError && normalizeText(debouncedSearch).length < CLIENT_SEARCH_MIN_LENGTH ? (
              <p className="px-2 py-3 text-sm text-[var(--mf-text-2)]">
                Escribe al menos {CLIENT_SEARCH_MIN_LENGTH} caracteres para buscar.
              </p>
            ) : null}

            {!searchingClientes && !clientesError && normalizeText(debouncedSearch).length >= CLIENT_SEARCH_MIN_LENGTH && searchResults.length === 0 ? (
              <p className="px-2 py-3 text-sm text-[var(--mf-text-2)]">No se encontraron clientes activos.</p>
            ) : null}

            {!searchingClientes && !clientesError && searchResults.length > 0 ? (
              <ul className="space-y-1" role="listbox" aria-label="Resultados de clientes activos">
                {searchResults.map((cliente) => {
                  const selected = cliente.id_cliente === selectedClienteId;
                  const secondary = resolveClienteSecondaryLabel(cliente);
                  return (
                    <li key={cliente.key}>
                      <button
                        type="button"
                        className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                          selected
                            ? 'border-[var(--mf-accent)] bg-[color:color-mix(in_srgb,var(--mf-accent)_12%,transparent)]'
                            : 'border-[var(--mf-nav-border)] hover:border-[var(--mf-btn-border)] hover:bg-[var(--mf-card)]'
                        }`}
                        onClick={() => handleSelectCliente(cliente)}
                        aria-selected={selected}
                      >
                        <p className="truncate text-sm font-semibold text-[var(--mf-text)]">{cliente.nombre_completo}</p>
                        {secondary ? (
                          <p className="truncate text-xs text-[var(--mf-text-2)]">{secondary}</p>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

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


