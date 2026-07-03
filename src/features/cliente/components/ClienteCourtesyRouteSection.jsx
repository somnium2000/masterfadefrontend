import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Coins, Gift, Loader2, RefreshCw, Sparkles, Users, UserRound } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import { Button } from '../../../components/ui/button.jsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog.jsx';
import { listPublicCatalogBranches } from '../../public/lib/catalogApi.js';
import {
  getClienteMe,
  getClientePuntosResumen,
  redeemClientePuntosReward,
} from '../lib/clienteApi.js';
import { CLIENT_BOOKING_ENABLED, CLIENT_LOCK_MESSAGE } from '../lib/clientFeatureFlags.js';

const DEFAULT_REWARD_TARGET = 10;
const REWARD_BOOKING_CONTEXT_STORAGE_KEY = 'mf_reward_redeem_context_v1';

function toSafeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toSafeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function isOperationalPlanState(value) {
  return normalizeText(value).toLowerCase() === 'activa';
}

function formatCompactDate(value) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleDateString('es-HN', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function formatSignedPoints(value) {
  const points = toSafeInteger(value, 0);
  return `${points >= 0 ? '+' : ''}${points}`;
}

function resolveMovementOriginLabel(origin) {
  const normalized = normalizeText(origin).toLowerCase();
  if (normalized === 'titular') return 'Titular';
  if (normalized === 'integrante') return 'Acompañante';
  return 'Sistema';
}

function resolveErrorMessage(error, fallbackMessage) {
  const status = Number(error?.status || 0);
  if (status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente.';
  if (status === 403) return 'No tienes permisos para realizar esta acción.';
  if (status === 409) return error?.data?.error?.message || error?.message || 'No fue posible completar la operación por un conflicto de saldo.';
  return error?.data?.error?.message || error?.message || fallbackMessage;
}

function normalizeBranchRecord(branch = {}) {
  const id = normalizeText(branch?.id_sucursal || branch?.id || branch?.value);
  const name = normalizeText(branch?.nombre_sucursal || branch?.nombre || branch?.label || 'Sucursal');
  if (!id) return null;
  return {
    id_sucursal: id,
    nombre_sucursal: name,
  };
}

function normalizeServiceRecord(service = {}) {
  const id = normalizeText(service?.id_servicio || service?.id || service?.value);
  const name = normalizeText(service?.nombre_servicio || service?.nombre || service?.label);
  if (!id || !name) return null;
  return {
    id_servicio: id,
    nombre_servicio: name,
  };
}

function uniqueServices(records = []) {
  const map = new Map();
  records.forEach((record) => {
    const normalized = normalizeServiceRecord(record);
    if (!normalized) return;
    if (map.has(normalized.id_servicio)) return;
    map.set(normalized.id_servicio, normalized);
  });
  return Array.from(map.values());
}

function persistRewardBookingContext(payload) {
  if (typeof window === 'undefined') return;
  const canjeContextToken = normalizeText(payload?.canje_context_token || payload?.id_points_tx_canje || payload?.id_points_tx);
  const context = {
    canje_context_token: canjeContextToken,
    id_points_tx_canje: canjeContextToken,
    id_servicio_canje: normalizeText(payload?.id_servicio_canje),
    servicio_nombre: normalizeText(payload?.servicio_nombre || 'Servicio de recompensa'),
    id_sucursal: normalizeText(payload?.id_sucursal),
    created_at: new Date().toISOString(),
  };
  if (!context.id_points_tx_canje || !context.id_servicio_canje || !context.id_sucursal) return;
  window.sessionStorage.setItem(REWARD_BOOKING_CONTEXT_STORAGE_KEY, JSON.stringify(context));
}

function normalizeMovementRecord(record = {}, index = 0) {
  const points = toSafeInteger(record?.puntos ?? record?.puntos_ajustados ?? record?.delta_puntos, 0);
  return {
    id: normalizeText(record?.id_points_tx || record?.id_movimiento || record?.id || `mov_${index}`),
    created_at: record?.created_at || record?.fecha || null,
    motivo: normalizeText(record?.motivo || record?.descripcion || record?.tipo_movimiento || 'Movimiento de puntos'),
    origen_punto_codigo: normalizeText(record?.origen_punto_codigo || record?.origen || record?.source || 'sistema').toLowerCase(),
    puntos: points,
  };
}

function normalizeSummary(payload) {
  const root = payload?.data || payload || {};
  const summarySource = root?.resumen || root?.summary || root;

  const rewardTarget = Math.max(1, toSafeInteger(summarySource?.puntos_para_premio ?? root?.puntos_para_premio, DEFAULT_REWARD_TARGET));
  const totalBalance = toSafeInteger(summarySource?.saldo_total ?? root?.saldo_total ?? summarySource?.balance_puntos, 0);
  const titularPoints = Math.max(0, toSafeInteger(summarySource?.puntos_titular ?? root?.puntos_titular, 0));
  const companionPoints = Math.max(0, toSafeInteger(summarySource?.puntos_integrante ?? root?.puntos_integrante, 0));
  const explicitProgress = summarySource?.progreso_actual ?? root?.progreso_actual;
  const progressCurrent = explicitProgress == null
    ? ((totalBalance % rewardTarget) + rewardTarget) % rewardTarget
    : Math.max(0, toSafeInteger(explicitProgress, 0));
  const rewardsAvailable = Math.max(0, toSafeInteger(summarySource?.recompensas_disponibles ?? root?.recompensas_disponibles, 0));
  const canRedeem = Boolean(summarySource?.puede_canjear ?? root?.puede_canjear ?? totalBalance >= rewardTarget);
  const summaryPlanStatus = summarySource?.estado_plan ?? root?.estado_plan;
  const hasActivePlan = summaryPlanStatus == null ? null : isOperationalPlanState(summaryPlanStatus);

  const remainingPoints = canRedeem ? 0 : Math.max(0, rewardTarget - progressCurrent);
  const movementSource = summarySource?.historial
    || summarySource?.movimientos
    || root?.historial
    || root?.movimientos
    || [];
  const history = Array.isArray(movementSource)
    ? movementSource.slice(0, 20).map((item, index) => normalizeMovementRecord(item, index))
    : [];

  const serviceCandidates = uniqueServices([
    ...(Array.isArray(summarySource?.servicios_redimibles) ? summarySource.servicios_redimibles : []),
    ...(Array.isArray(root?.servicios_redimibles) ? root.servicios_redimibles : []),
    ...(Array.isArray(summarySource?.servicios_canjeables) ? summarySource.servicios_canjeables : []),
    ...(Array.isArray(root?.servicios_canjeables) ? root.servicios_canjeables : []),
    ...(Array.isArray(summarySource?.servicios_recompensa) ? summarySource.servicios_recompensa : []),
    ...(Array.isArray(root?.servicios_recompensa) ? root.servicios_recompensa : []),
  ]);

  const branchCandidates = [
    summarySource?.id_sucursal,
    summarySource?.id_sucursal_preferida,
    root?.id_sucursal,
    root?.id_sucursal_preferida,
    root?.cliente?.id_sucursal_preferida,
  ]
    .map((item) => normalizeText(item))
    .filter(Boolean);

  return {
    totalBalance,
    titularPoints,
    companionPoints,
    rewardTarget,
    progressCurrent: Math.min(rewardTarget, progressCurrent),
    rewardsAvailable,
    canRedeem,
    remainingPoints,
    hasActivePlan,
    history,
    serviceCandidates,
    preferredBranchId: branchCandidates[0] || '',
  };
}

function resolveContributionWidths(summary) {
  const progress = Math.max(0, toSafeNumber(summary?.progressCurrent, 0));
  const target = Math.max(1, toSafeNumber(summary?.rewardTarget, DEFAULT_REWARD_TARGET));
  const titular = Math.max(0, toSafeNumber(summary?.titularPoints, 0));
  const companion = Math.max(0, toSafeNumber(summary?.companionPoints, 0));
  const totalContribution = titular + companion;

  if (progress <= 0) return { titular: 0, companion: 0 };
  if (totalContribution <= 0) return { titular: (progress / target) * 100, companion: 0 };

  const titularShare = titular / totalContribution;
  const titularProgress = progress * titularShare;
  const companionProgress = Math.max(0, progress - titularProgress);
  return {
    titular: Math.min(100, Math.max(0, (titularProgress / target) * 100)),
    companion: Math.min(100, Math.max(0, (companionProgress / target) * 100)),
  };
}

export default function ClienteCourtesyRouteSection() {
  const location = useLocation();
  const navigate = useNavigate();
  const notifications = useNotifications();
  const redeemNavigationLockRef = useRef(false);
  const autoRedeemHandledRef = useRef(false);
  const rewardPreparedShownRef = useRef(false);
  const rewardDiscountInfoShownRef = useRef(false);
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summaryError, setSummaryError] = useState('');

  const [redeemModalOpen, setRedeemModalOpen] = useState(false);
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemSubmitting, setRedeemSubmitting] = useState(false);
  const [redeemError, setRedeemError] = useState('');
  const [branchOptions, setBranchOptions] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [serviceOptions, setServiceOptions] = useState([]);
  const [selectedServiceId, setSelectedServiceId] = useState('');

  const loadSummary = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoadingSummary(true);
    }
    setSummaryError('');
    try {
      const payload = await getClientePuntosResumen();
      setSummary(normalizeSummary(payload));
    } catch (error) {
      const message = resolveErrorMessage(error, 'No se pudo cargar tu resumen de superpuntos.');
      setSummaryError(message);
    } finally {
      if (!silent) {
        setLoadingSummary(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const contributionWidths = useMemo(
    () => resolveContributionWidths(summary),
    [summary]
  );

  const resolveRedeemServices = useCallback(async ({ summaryServices }) => {
    return uniqueServices(summaryServices);
  }, []);

  const loadRedeemContext = useCallback(async () => {
    if (!summary?.canRedeem) return;

    setRedeemError('');
    setRedeemLoading(true);
    setServiceOptions([]);
    setSelectedServiceId('');

    try {
      const [branchesResult, meResult] = await Promise.allSettled([
        listPublicCatalogBranches(),
        getClienteMe(),
      ]);

      const branches = branchesResult.status === 'fulfilled'
        ? (Array.isArray(branchesResult.value?.branches) ? branchesResult.value.branches : [])
            .map(normalizeBranchRecord)
            .filter(Boolean)
        : [];
      setBranchOptions(branches);

      const mePayload = meResult.status === 'fulfilled' ? (meResult.value?.data || meResult.value || {}) : {};
      const mePreferredBranch = normalizeText(mePayload?.cliente?.id_sucursal_preferida || mePayload?.id_sucursal_preferida);
      const preferredBranchId = normalizeText(summary?.preferredBranchId || mePreferredBranch || branches[0]?.id_sucursal);
      setSelectedBranchId(preferredBranchId);

      const resolvedServices = await resolveRedeemServices({
        summaryServices: Array.isArray(summary?.serviceCandidates) ? summary.serviceCandidates : [],
      });
      setServiceOptions(resolvedServices);
      setSelectedServiceId(normalizeText(resolvedServices[0]?.id_servicio));
    } catch (error) {
      redeemNavigationLockRef.current = false;
      setRedeemError(resolveErrorMessage(error, 'No se pudo cargar la configuracion de canje.'));
    } finally {
      setRedeemLoading(false);
    }
  }, [resolveRedeemServices, summary]);

  const handleOpenRedeemModal = useCallback(async () => {
    rewardPreparedShownRef.current = false;
    rewardDiscountInfoShownRef.current = false;
    setRedeemModalOpen(true);
    await loadRedeemContext();
  }, [loadRedeemContext]);

  useEffect(() => {
    if (autoRedeemHandledRef.current) return;
    const searchParams = new URLSearchParams(location.search || '');
    const shouldAutoRedeem = normalizeText(searchParams.get('accion')).toLowerCase() === 'canjear';
    if (!shouldAutoRedeem) return;
    if (loadingSummary) return;
    autoRedeemHandledRef.current = true;

    if (summary?.canRedeem) {
      // AM: Autoapertura segura solo cuando backend/summary confirma recompensa disponible.
      void handleOpenRedeemModal();
      notifications.info('Canjea tu recompensa para continuar con tu cita.', {
        dedupeKey: 'cliente-auto-open-redeem',
      });
    }

    searchParams.delete('accion');
    const nextSearch = searchParams.toString();
    navigate(`/home/cliente${nextSearch ? `?${nextSearch}` : ''}`, { replace: true });
  }, [handleOpenRedeemModal, location.search, loadingSummary, navigate, notifications, summary?.canRedeem]);

  async function handleBranchChange(nextBranchId) {
    const safeBranchId = normalizeText(nextBranchId);
    setSelectedBranchId(safeBranchId);
    setRedeemError('');
    setRedeemLoading(true);
    try {
      const resolvedServices = await resolveRedeemServices({
        summaryServices: Array.isArray(summary?.serviceCandidates) ? summary.serviceCandidates : [],
      });
      setServiceOptions(resolvedServices);
      setSelectedServiceId(normalizeText(resolvedServices[0]?.id_servicio));
    } catch (error) {
      redeemNavigationLockRef.current = false;
      setRedeemError(resolveErrorMessage(error, 'No se pudieron cargar servicios para esta sucursal.'));
      setServiceOptions([]);
      setSelectedServiceId('');
    } finally {
      setRedeemLoading(false);
    }
  }

  async function handleRedeemReward() {
    if (!selectedServiceId || !selectedBranchId || redeemSubmitting || redeemNavigationLockRef.current) return;
    if (!CLIENT_BOOKING_ENABLED) {
      notifications.info('El agendamiento estara disponible proximamente.', { dedupeKey: 'cliente-booking-disabled' });
      return;
    }
    setRedeemSubmitting(true);
    setRedeemError('');
    try {
      const payload = await redeemClientePuntosReward({
        id_servicio: selectedServiceId,
        id_sucursal: selectedBranchId,
      });
      const response = payload?.data || payload || {};
      redeemNavigationLockRef.current = true;
      persistRewardBookingContext(response);

      if (!rewardPreparedShownRef.current) {
        notifications.success('Recompensa preparada. Agenda tu cita para usarla.', {
          dedupeKey: 'cliente-reward-prepared',
        });
        rewardPreparedShownRef.current = true;
      }
      if (!rewardDiscountInfoShownRef.current) {
        notifications.info('Tus puntos se descontaran cuando confirmes la cita.', {
          dedupeKey: 'cliente-reward-discount-info',
        });
        rewardDiscountInfoShownRef.current = true;
      }

      setRedeemModalOpen(false);
      await loadSummary({ silent: true });
      navigate('/agendar?modo=canje');
    } catch (error) {
      redeemNavigationLockRef.current = false;
      setRedeemError(resolveErrorMessage(error, 'No fue posible registrar tu canje.'));
    } finally {
      setRedeemSubmitting(false);
    }
  }

  const canSubmitRedeem = Boolean(CLIENT_BOOKING_ENABLED && selectedServiceId && selectedBranchId && !redeemLoading && !redeemSubmitting);
  const hasRedeemableServices = Boolean(Array.isArray(summary?.serviceCandidates) && summary.serviceCandidates.length > 0);
  const movementHistory = useMemo(() => {
    const source = Array.isArray(summary?.history) ? summary.history : [];
    // AM: Inicio Cliente muestra solo trazabilidad reciente (últimos 5 movimientos).
    return source
      .slice()
      .sort((left, right) => new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime())
      .slice(0, 5);
  }, [summary?.history]);

  return (
    <section className="mf-glass-surface relative overflow-hidden rounded-[24px] border border-[var(--mf-nav-border)] p-4 sm:p-5">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-10 top-10 h-40 w-40 rounded-full bg-[color:color-mix(in_srgb,var(--mf-accent)_20%,transparent)] blur-3xl" />
        <div className="absolute -right-12 bottom-0 h-36 w-36 rounded-full bg-cyan-400/10 blur-3xl" />
      </div>

      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-[var(--mf-accent)]">Superpuntos</p>
            <h2 className="mf-font-display mt-1 text-2xl text-[var(--mf-text)] sm:text-[32px]">Ruta a tu cortesía</h2>
          </div>
          <button
            type="button"
            onClick={() => void loadSummary()}
            disabled={loadingSummary}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--mf-text-2)] transition-colors hover:text-[var(--mf-text)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={14} className={loadingSummary ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>

        {loadingSummary ? (
          <div className="mt-4 space-y-3">
            <div className="mf-skeleton h-20 w-full rounded-2xl" />
            <div className="mf-skeleton h-28 w-full rounded-2xl" />
            <div className="mf-skeleton h-40 w-full rounded-2xl" />
          </div>
        ) : summaryError ? (
          <div className="mt-4 rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            <p>{summaryError}</p>
            <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void loadSummary()}>
              Reintentar
            </Button>
          </div>
        ) : summary ? (
          <>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <article className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Saldo total</p>
                <p className="mt-1 inline-flex items-center gap-1 text-2xl font-semibold text-[var(--mf-accent)]">
                  <Coins size={18} />
                  {summary.totalBalance}
                </p>
              </article>

              <article className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Recompensas disponibles</p>
                <p className="mt-1 inline-flex items-center gap-1 text-2xl font-semibold text-[var(--mf-text)]">
                  <Gift size={18} />
                  {summary.rewardsAvailable}
                </p>
              </article>

              <article className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Meta</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--mf-text)]">
                  {summary.progressCurrent}/{summary.rewardTarget}
                </p>
              </article>
            </div>

            <div className="mt-4 rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_74%,transparent)] p-4">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--mf-text-2)]">
                <span>Progreso hacia tu cortesía</span>
                <span>{summary.progressCurrent}/{summary.rewardTarget}</span>
              </div>

              <div className="mt-3 h-3 overflow-hidden rounded-full bg-[color:color-mix(in_srgb,var(--mf-nav-border)_72%,transparent)]">
                <div className="flex h-full w-full">
                  <div
                    className="h-full bg-[linear-gradient(90deg,#c79331,#f0d58f)] transition-all duration-300"
                    style={{ width: `${contributionWidths.titular}%` }}
                  />
                  <div
                    className="h-full bg-[linear-gradient(90deg,#2b93f4,#6bbcff)] transition-all duration-300"
                    style={{ width: `${contributionWidths.companion}%` }}
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <p className="inline-flex items-center gap-2 text-[var(--mf-text)]">
                  <UserRound size={14} className="text-[#d9a13b]" />
                  Tus visitas: <strong>{summary.titularPoints}</strong>
                </p>
                <p className="inline-flex items-center gap-2 text-[var(--mf-text)]">
                  <Users size={14} className="text-[#4aa6ff]" />
                  Puntos por acompañantes: <strong>{summary.companionPoints}</strong>
                </p>
              </div>

              <p className="mt-2 text-sm text-[var(--mf-text-2)]">
                {summary.canRedeem
                  ? 'Ya puedes canjear tu recompensa.'
                  : `Faltan ${summary.remainingPoints} puntos para tu cortesía.`}
              </p>

              {summary.canRedeem ? (
                <>
                  <Button
                    type="button"
                    className="mf-accent-gradient mt-4 h-10 rounded-xl px-4 text-sm font-semibold"
                    onClick={() => void handleOpenRedeemModal()}
                    disabled={redeemLoading || redeemSubmitting || !hasRedeemableServices}
                    title={hasRedeemableServices ? undefined : 'No hay servicios disponibles para canje en este momento.'}
                  >
                    <Sparkles size={14} className="mr-1.5" />
                    Canjear mi recompensa
                  </Button>
                  {!hasRedeemableServices ? (
                    <p className="mt-2 text-sm text-[var(--mf-text-2)]">
                      No hay servicios disponibles para canje en este momento.
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>

            <section className="mt-6 rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--mf-accent)]">Últimos movimientos</p>
              <p className="mt-1 text-xs text-[var(--mf-text-2)]">Revisa tus últimos 5 movimientos de puntos.</p>
              {movementHistory.length ? (
                <div className="mt-3 space-y-2">
                  {movementHistory.map((movement) => {
                    const positive = movement.puntos >= 0;
                    return (
                      <article
                        key={movement.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-[var(--mf-nav-border)] px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--mf-text)]">{movement.motivo}</p>
                          <p className="truncate text-xs text-[var(--mf-text-2)]">
                            {formatCompactDate(movement.created_at)} - {resolveMovementOriginLabel(movement.origen_punto_codigo)}
                          </p>
                        </div>
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${positive ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
                          {formatSignedPoints(movement.puntos)}
                        </span>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-2 text-sm text-[var(--mf-text-2)]">Aún no tienes movimientos. Tus puntos aparecerán aquí después de tus visitas.</p>
              )}
            </section>
          </>
        ) : null}
      </div>

      <Dialog open={redeemModalOpen} onOpenChange={setRedeemModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Canjear recompensa</DialogTitle>
            <DialogDescription>
              Selecciona la sucursal y servicio para preparar tu recompensa. Los puntos se descuentan al confirmar la cita.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3 text-sm text-[var(--mf-text-2)]">
              <p>Los servicios disponibles para canje se cargan desde tu resumen de MasterPuntos.</p>
            </div>

            <div>
              <label className="mf-label">Sucursal</label>
              <select
                className="mf-select mt-1"
                value={selectedBranchId}
                onChange={(event) => {
                  void handleBranchChange(event.target.value);
                }}
                disabled={redeemLoading || redeemSubmitting}
              >
                <option value="">Selecciona sucursal</option>
                {branchOptions.map((branch) => (
                  <option key={branch.id_sucursal} value={branch.id_sucursal}>
                    {branch.nombre_sucursal}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mf-label">Servicio de recompensa</label>
              {redeemLoading ? (
                <div className="mt-2 inline-flex items-center gap-2 text-sm text-[var(--mf-text-2)]">
                  <Loader2 size={15} className="animate-spin" />
                  Cargando opciones...
                </div>
              ) : serviceOptions.length ? (
                <div className="mt-2 space-y-2">
                  {serviceOptions.map((service) => {
                    const active = service.id_servicio === selectedServiceId;
                    return (
                      <button
                        key={service.id_servicio}
                        type="button"
                        onClick={() => setSelectedServiceId(service.id_servicio)}
                        className={[
                          'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                          active
                            ? 'border-[var(--mf-accent)] bg-[color:color-mix(in_srgb,var(--mf-accent)_18%,transparent)] text-[var(--mf-text)]'
                            : 'border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text-2)] hover:text-[var(--mf-text)]',
                        ].join(' ')}
                      >
                        <span>{service.nombre_servicio}</span>
                        {active ? <span className="text-xs font-semibold text-[var(--mf-accent)]">Seleccionado</span> : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-2 text-sm text-[var(--mf-text-2)]">
                  No hay servicios disponibles para canje en este momento.
                </p>
              )}
            </div>

            {redeemError ? (
              <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {redeemError}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRedeemModalOpen(false)}
              disabled={redeemSubmitting}
            >
              Cerrar
            </Button>
            <Button
              type="button"
              onClick={() => void handleRedeemReward()}
              disabled={!canSubmitRedeem}
              title={CLIENT_BOOKING_ENABLED ? undefined : 'El agendamiento estara disponible proximamente.'}
              className="gap-2"
            >
              {redeemSubmitting ? <Loader2 size={14} className="animate-spin" /> : null}
              {CLIENT_BOOKING_ENABLED ? 'Confirmar canje' : CLIENT_LOCK_MESSAGE}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

