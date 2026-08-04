import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Loader2, RefreshCw, Search } from "lucide-react";
import { useAuth } from "../../../context/AuthContext.jsx";
import { resolveHomePath } from "../../home/lib/roleRouting.js";
import { Button } from "../../../components/ui/button.jsx";
import {
  approveAdminAccountDeletionRequest,
  getAdminAccountDeletionRequestDetail,
  listAdminAccountDeletionRequests,
  rejectAdminAccountDeletionRequest,
  retryAdminAccountDeletionRequest,
} from "../lib/adminAccountDeletionApi.js";
import {
  countActiveAdminDeletionFilters,
  getAdminAccountDeletionStatusLabel,
  sanitizeAdminAccountDeletionError,
} from "../lib/adminAccountDeletionFlow.js";
import AdminAccountDeletionDetailDialog from "../components/AdminAccountDeletionDetailDialog.jsx";
import AdminAccountDeletionDecisionDialog from "../components/AdminAccountDeletionDecisionDialog.jsx";

const TAB_CONFIG = {
  personal: { label: "Personal", subject: "personal", status: "all" },
  clientes: { label: "Clientes", subject: "cliente", status: "all" },
  historial: { label: "Historial", subject: "all", status: "completada" },
};

function formatDate(value) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-HN", { dateStyle: "medium" }).format(new Date(value));
}

function dependenciesLabel(item) {
  const deps = item.dependency_summary || {};
  const total = Number(deps.future_operational_appointments || 0)
    + Number(deps.active_employee_service_rates || 0)
    + Number(deps.active_promotion_references || 0);
  return total > 0 ? `${total} pendientes` : "Sin bloqueos";
}

export default function AdminAccountDeletionPage() {
  const { roles } = useAuth();
  const basePath = resolveHomePath(roles) || "/home/admin";
  const [tab, setTab] = useState("personal");
  const [filters, setFilters] = useState({ search: "", subject: "personal", status: "all", page: 1, limit: 20 });
  const [listData, setListData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [decisionMode, setDecisionMode] = useState(null);
  const [retrying, setRetrying] = useState(false);

  const activeFilters = useMemo(() => countActiveAdminDeletionFilters(filters), [filters]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      setListData(await listAdminAccountDeletionRequests(filters));
    } catch (error) {
      setErrorMessage(sanitizeAdminAccountDeletionError(error, "No se pudo cargar el listado."));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadDetail = useCallback(async (requestId = detail?.request?.id_solicitud) => {
    if (!requestId) return;
    setDetailLoading(true);
    setErrorMessage("");
    try {
      const nextDetail = await getAdminAccountDeletionRequestDetail(requestId);
      setDetail(nextDetail);
      setDetailOpen(true);
    } catch (error) {
      setErrorMessage(sanitizeAdminAccountDeletionError(error, "No se pudo cargar el detalle."));
    } finally {
      setDetailLoading(false);
    }
  }, [detail?.request?.id_solicitud]);

  const handleTab = useCallback((nextTab) => {
    const config = TAB_CONFIG[nextTab];
    setTab(nextTab);
    setFilters((prev) => ({ ...prev, subject: config.subject, status: config.status, page: 1 }));
  }, []);

  const clearFilters = useCallback(() => {
    const config = TAB_CONFIG[tab];
    setFilters({ search: "", subject: config.subject, status: config.status, page: 1, limit: 20 });
  }, [tab]);

  const handleApprove = useCallback(async (payload) => {
    const result = await approveAdminAccountDeletionRequest(detail.request.id_solicitud, payload);
    setNotice(result.completed ? "Solicitud completada." : "Solicitud aprobada con proceso tecnico pendiente.");
    await loadList();
    await loadDetail(detail.request.id_solicitud);
  }, [detail?.request?.id_solicitud, loadDetail, loadList]);

  const handleReject = useCallback(async (comment) => {
    await rejectAdminAccountDeletionRequest(detail.request.id_solicitud, comment);
    setNotice("Solicitud rechazada. La cuenta permanece activa.");
    await loadList();
    await loadDetail(detail.request.id_solicitud);
  }, [detail?.request?.id_solicitud, loadDetail, loadList]);

  const handleRetry = useCallback(async () => {
    if (!detail?.request?.id_solicitud || retrying) return;
    setRetrying(true);
    setErrorMessage("");
    try {
      const result = await retryAdminAccountDeletionRequest(detail.request.id_solicitud);
      setNotice(result.completed ? "Proceso completado." : "Proceso reintentado; sigue pendiente tecnico.");
      await loadList();
      await loadDetail(detail.request.id_solicitud);
    } catch (error) {
      setErrorMessage(sanitizeAdminAccountDeletionError(error, "No se pudo reintentar el proceso."));
    } finally {
      setRetrying(false);
    }
  }, [detail?.request?.id_solicitud, loadDetail, loadList, retrying]);

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">Personas</p>
          <h1 className="mf-font-display mt-2 text-3xl font-semibold text-[var(--mf-text)]">Eliminacion de cuentas</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--mf-text-2)]">
            Administra solicitudes del personal, revisa eliminaciones autonomas de clientes y reintenta procesos tecnicos pendientes.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={loadList} className="gap-2">
          <RefreshCw size={16} />
          Actualizar
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(TAB_CONFIG).map(([key, config]) => (
          <button
            key={key}
            type="button"
            onClick={() => handleTab(key)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold ${tab === key ? "border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-accent)]" : "border-[var(--mf-nav-border)] text-[var(--mf-text-2)]"}`}
          >
            {config.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-card)] p-4 md:grid-cols-[1fr_180px_180px_auto]">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mf-text-2)]" />
          <input className="mf-input pl-9" placeholder="Buscar referencia o nombre activo" value={filters.search} onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value, page: 1 }))} />
        </div>
        <select className="mf-input" value={filters.subject} onChange={(event) => setFilters((prev) => ({ ...prev, subject: event.target.value, page: 1 }))}>
          <option value="all">Todos</option>
          <option value="personal">Personal</option>
          <option value="cliente">Clientes</option>
        </select>
        <select className="mf-input" value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value, page: 1 }))}>
          <option value="all">Todos los estados</option>
          {Object.keys({
            pendiente_aprobacion: true,
            aprobada: true,
            procesando: true,
            storage_pendiente: true,
            auth_pendiente: true,
            completada: true,
            rechazada: true,
            cancelada: true,
            bloqueada: true,
          }).map((status) => <option key={status} value={status}>{getAdminAccountDeletionStatusLabel(status)}</option>)}
        </select>
        <Button type="button" variant="outline" onClick={clearFilters}>
          Limpiar filtros{activeFilters ? ` (${activeFilters})` : ""}
        </Button>
      </div>

      {notice ? <div aria-live="polite" className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">{notice}</div> : null}
      {errorMessage ? <div role="alert" className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">{errorMessage}</div> : null}

      <div className="overflow-hidden rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-card)]">
        <div className="hidden grid-cols-[1.1fr_0.7fr_1.2fr_0.8fr_0.8fr_0.8fr_0.5fr] gap-3 border-b border-[var(--mf-nav-border)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--mf-text-2)] lg:grid">
          <span>Referencia</span><span>Tipo</span><span>Persona</span><span>Estado</span><span>Fecha</span><span>Dependencias</span><span>Acciones</span>
        </div>
        {loading ? (
          <div className="flex items-center gap-3 p-5 text-sm text-[var(--mf-text)]" aria-live="polite">
            <Loader2 size={18} className="animate-spin text-[var(--mf-accent)]" />
            Cargando solicitudes.
          </div>
        ) : listData?.items?.length ? (
          <div className="divide-y divide-[var(--mf-nav-border)]">
            {listData.items.map((item) => (
              <div key={item.id_solicitud} className="grid gap-3 p-4 text-sm text-[var(--mf-text)] lg:grid-cols-[1.1fr_0.7fr_1.2fr_0.8fr_0.8fr_0.8fr_0.5fr] lg:items-center">
                <span className="font-semibold">{item.referencia_publica}</span>
                <span>{item.tipo_sujeto === "personal" ? "Personal" : "Cliente"}</span>
                <span>{item.display_name}</span>
                <span>{getAdminAccountDeletionStatusLabel(item.estado_codigo)}</span>
                <span>{formatDate(item.solicitado_at)}</span>
                <span>{dependenciesLabel(item)}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => loadDetail(item.id_solicitud)} className="gap-2">
                  <Eye size={14} />
                  Ver
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-5 text-sm text-[var(--mf-text-2)]">Sin solicitudes para estos filtros.</div>
        )}
      </div>

      <AdminAccountDeletionDetailDialog
        open={detailOpen}
        detail={detail}
        basePath={basePath}
        loading={detailLoading}
        retrying={retrying}
        onOpenChange={setDetailOpen}
        onRefresh={() => loadDetail()}
        onApprove={() => setDecisionMode("approve")}
        onReject={() => setDecisionMode("reject")}
        onRetry={handleRetry}
      />
      <AdminAccountDeletionDecisionDialog
        open={Boolean(decisionMode)}
        mode={decisionMode}
        detail={detail}
        onOpenChange={(open) => { if (!open) setDecisionMode(null); }}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    </section>
  );
}
