import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock3, Gift, Search, Settings2, SlidersHorizontal, Star, X } from "lucide-react";
import { Button } from "../../../components/ui/button.jsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog.jsx";
import { Input } from "../../../components/ui/input.jsx";
import { Label } from "../../../components/ui/label.jsx";
import ViewToggle from "../../../components/data/ViewToggle.jsx";
import DataCard from "../../../components/data/DataCard.jsx";
import CardsCarousel from "../../../components/data/CardsCarousel.jsx";
import HoverActionButton from "../../../components/data/HoverActionButton.jsx";
import EmptyState from "../../../components/data/EmptyState.jsx";
import ErrorBanner from "../../../components/data/ErrorBanner.jsx";
import LoadingSpinner from "../../../components/data/LoadingSpinner.jsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table.jsx";
import { useNotifications } from "../../../context/NotificationsContext.jsx";
import { useAuth } from "../../../context/AuthContext.jsx";
import { replaceItemById } from "../../../lib/collectionState.js";
import {
  listAdminPersonasClientes,
} from "../lib/adminPersonasApi.js";
import {
  createAdminMasterPuntosCanje,
  createAdminMasterPuntosLegacyMigracion,
  getAdminMasterPuntosClienteMovimientos,
  getAdminMasterPuntosContexto,
  listAdminMasterPuntosClientes,
  updateAdminMasterPuntosRegla,
} from "../lib/adminMasterPuntosApi.js";

const CLIENTES_LIMIT = 20;
const MOV_LIMIT = 10;

const RULE_DEFAULTS = { scope: "global", id_sucursal: "", umbral_monto_hnl: 250, puntos_para_premio: 10, activo: true, servicios_redimibles: [] };
function extractMessage(err) {
  return err?.data?.error?.message || err?.message || "Error desconocido.";
}

function normalizeText(value) {
  return String(value || "").trim();
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("es-HN");
}

function formatDays(days) {
  if (days == null) return "Sin ciclo";
  if (days <= 0) return "Caduca hoy";
  if (days === 1) return "1 dÃ­a";
  return `${days} dÃ­as`;
}

function findRule(contexto, scope, idSucursal = "") {
  if (scope === "sucursal" && idSucursal) {
    return (contexto?.reglas_sucursal || []).find((item) => item?.id_sucursal === idSucursal) || null;
  }
  return contexto?.regla_global || null;
}

function toRuleForm(contexto, scope, idSucursal = "") {
  const rule = findRule(contexto, scope, idSucursal);
  return {
    scope,
    id_sucursal: scope === "sucursal" ? idSucursal : "",
    umbral_monto_hnl: Number(rule?.umbral_monto_hnl ?? 250),
    puntos_para_premio: Number(rule?.puntos_para_premio ?? 10),
    activo: rule?.activo !== false,
    servicios_redimibles: Array.isArray(rule?.servicios_redimibles) ? rule.servicios_redimibles.map((s) => s.id_servicio) : [],
  };
}

function PremioBadge({ available }) {
  return (
    <span className={`mf-badge ${available ? "mf-badge-green" : "mf-badge-muted"}`}>
      {available ? "Premio disponible" : "En progreso"}
    </span>
  );
}

function StarsInfo({ count }) {
  const total = Math.max(0, Number(count || 0));
  const shown = Math.min(total, 8);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: shown }).map((_, index) => (
          <Star key={index} size={12} className="text-[var(--mf-accent)]" fill="currentColor" strokeWidth={1.8} />
        ))}
      </div>
      <span className="text-xs text-[var(--mf-text-2)]">{total} pts</span>
    </div>
  );
}

export default function AdminMasterPuntosPage() {
  const navigate = useNavigate();
  const notifications = useNotifications();
  const { roles, isAuthenticated } = useAuth();

  const [contexto, setContexto] = useState({
    sucursales: [],
    servicios_catalogo: [],
    regla_global: null,
    reglas_sucursal: [],
    parametros: { migracion_manual_habilitada: false },
  });
  const [clientes, setClientes] = useState([]);
  const [clientesPage, setClientesPage] = useState(1);
  const [clientesTotalPages, setClientesTotalPages] = useState(1);
  const [clientesTotal, setClientesTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("all");
  const [soloPremioDisponible, setSoloPremioDisponible] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState(() => localStorage.getItem("mf-view-masterpuntos") || "cards");

  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleSaving, setRuleSaving] = useState(false);
  const [ruleError, setRuleError] = useState("");
  const [ruleForm, setRuleForm] = useState(RULE_DEFAULTS);

  const [canjeOpen, setCanjeOpen] = useState(false);
  const [canjeTarget, setCanjeTarget] = useState(null);
  const [canjeForm, setCanjeForm] = useState({ id_servicio: "", motivo: "" });
  const [canjeSaving, setCanjeSaving] = useState(false);
  const [canjeError, setCanjeError] = useState("");

  const [movOpen, setMovOpen] = useState(false);
  const [movLoading, setMovLoading] = useState(false);
  const [movError, setMovError] = useState("");
  const [movCliente, setMovCliente] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [movPage, setMovPage] = useState(1);
  const [movTotalPages, setMovTotalPages] = useState(1);

  const [legacyOpen, setLegacyOpen] = useState(false);
  const [legacyTarget, setLegacyTarget] = useState(null);
  const [legacyForm, setLegacyForm] = useState({ puntos: "", motivo: "" });
  const [legacySaving, setLegacySaving] = useState(false);
  const [legacyError, setLegacyError] = useState("");
  const [legacyCandidates, setLegacyCandidates] = useState([]);
  const [legacyCandidatesLoading, setLegacyCandidatesLoading] = useState(false);
  const [legacyClientPickerOpen, setLegacyClientPickerOpen] = useState(false);
  const [legacyClientQuery, setLegacyClientQuery] = useState("");

  const scopeBranch = selectedBranch === "all" ? undefined : selectedBranch;

  const canManageLegacyPoints = useMemo(() => {
    const roleList = Array.isArray(roles) ? roles.map((role) => String(role || "").toLowerCase()) : [];
    return roleList.includes("admin") || roleList.includes("super_admin");
  }, [roles]);

  const legacyMigrationEnabled = Boolean(contexto?.parametros?.migracion_manual_habilitada);

  const filteredClientes = useMemo(() => {
    let result = [...clientes];
    if (selectedBranch !== "all") {
      result = result.filter((c) => c.id_sucursal === selectedBranch);
    }
    if (soloPremioDisponible) {
      result = result.filter((c) => Boolean(c.premio_disponible));
    }
    const q = normalizeText(search).toLowerCase();
    if (q) {
      result = result.filter((c) => 
        normalizeText(c.nombre_completo).toLowerCase().includes(q) ||
        normalizeText(c.telefono_principal).includes(q)
      );
    }
    return result;
  }, [clientes, search, selectedBranch, soloPremioDisponible]);

  const legacyCandidatesFiltered = useMemo(() => {
    const query = normalizeText(legacyClientQuery).toLowerCase();
    if (!query) return legacyCandidates;
    return legacyCandidates.filter((cliente) => {
      const searchable = [
        cliente?.nombre_completo,
        cliente?.telefono_principal,
        cliente?.correo_principal,
        cliente?.dni,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchable.includes(query);
    });
  }, [legacyCandidates, legacyClientQuery]);

  const getRewardServices = useCallback((cliente) => {
    const branchRule = (contexto.reglas_sucursal || []).find((item) => item?.id_sucursal === cliente?.id_sucursal_origen && item?.activo !== false);
    const rule = branchRule || contexto.regla_global;
    return Array.isArray(rule?.servicios_redimibles) ? rule.servicios_redimibles : [];
  }, [contexto]);

  

  const loadContexto = useCallback(async () => {
    try {
      const response = await getAdminMasterPuntosContexto();
      const payload = response?.data ?? response;
      setContexto({
        sucursales: Array.isArray(payload?.sucursales) ? payload.sucursales : [],
        servicios_catalogo: Array.isArray(payload?.servicios_catalogo) ? payload.servicios_catalogo : [],
        regla_global: payload?.regla_global || null,
        reglas_sucursal: Array.isArray(payload?.reglas_sucursal) ? payload.reglas_sucursal : [],
        parametros: payload?.parametros || { migracion_manual_habilitada: false },
      });
    } catch (err) {
      if (err.status === 401) return navigate("/login");
      if (err.status === 403) return navigate("/unauthorized");
      notifications.error(extractMessage(err), { dedupeKey: "masterpuntos-context-error" });
    }
  }, [navigate, notifications]);

  const loadClientes = useCallback(async () => {
    setLoading(true);
    setListError("");
    try {
      const response = await listAdminMasterPuntosClientes({
        search: search.trim() || undefined,
        id_sucursal: scopeBranch,
        solo_premio: soloPremioDisponible,
        page: clientesPage,
        limit: 50,
      });
      const payload = response?.data ?? response;
      setClientes(Array.isArray(payload?.clientes) ? payload.clientes : []);
      if (payload?.meta) {
        setClientesTotalPages(payload.meta.totalPages ?? 1);
        setClientesTotal(payload.meta.total ?? 0);
      }
      if (payload?.parametros) {
        setContexto((prev) => ({ ...prev, parametros: payload.parametros }));
      }
    } catch (err) {
      if (err.status === 401) return navigate("/login");
      if (err.status === 403) return navigate("/unauthorized");
      setListError(extractMessage(err));
    } finally {
      setLoading(false);
    }
  }, [navigate, scopeBranch, search, clientesPage]);

  
  useEffect(() => {
    setClientesPage(1);
  }, [search, selectedBranch, soloPremioDisponible]);
  
  useEffect(() => { void loadContexto(); }, [loadContexto]);
  useEffect(() => {
    const timer = setTimeout(() => { void loadClientes(); }, 250);
    return () => clearTimeout(timer);
  }, [loadClientes, soloPremioDisponible]);

  function openRules() {
    setRuleForm(toRuleForm(contexto, "global"));
    setRuleError("");
    setRuleOpen(true);
  }

  async function saveRules() {
    const payload = {
      scope: ruleForm.scope,
      id_sucursal: ruleForm.scope === "sucursal" ? ruleForm.id_sucursal : null,
      umbral_monto_hnl: Number(ruleForm.umbral_monto_hnl),
      puntos_para_premio: Number(ruleForm.puntos_para_premio),
      expiracion_meses: 12,
      servicios_redimibles: ruleForm.servicios_redimibles || [],
      activo: Boolean(ruleForm.activo),
    };
    if (payload.scope === "sucursal" && !payload.id_sucursal) return setRuleError("Selecciona sucursal.");
    if (!payload.servicios_redimibles.length) return setRuleError("Selecciona al menos un servicio.");
    setRuleSaving(true);
    setRuleError("");
    try {
      await updateAdminMasterPuntosRegla(payload);
      notifications.success("Regla guardada.", { dedupeKey: "masterpuntos-rule-save" });
      setRuleOpen(false);
      await Promise.all([loadContexto(), loadClientes()]);
    } catch (err) {
      setRuleError(extractMessage(err));
    } finally {
      setRuleSaving(false);
    }
  }

  async function openMovimientos(cliente, page = 1) {
    const targetPage = Math.max(1, Number(page) || 1);
    setMovOpen(true);
    setMovCliente(cliente);
    setMovLoading(true);
    setMovError("");
    setMovimientos([]);
    setMovPage(targetPage);
    try {
      const response = await getAdminMasterPuntosClienteMovimientos(cliente.id_cliente, { page: targetPage, limit: 50 });
      const payload = response?.data ?? response;
      setMovCliente(payload?.cliente || cliente);
      setMovimientos(Array.isArray(payload?.movimientos) ? payload.movimientos : []);
      if (payload?.meta) {
        setMovPage(payload.meta.page ?? targetPage);
        setMovTotalPages(payload.meta.totalPages ?? 1);
      }
    } catch (err) {
      setMovError(extractMessage(err));
    } finally {
      setMovLoading(false);
    }
  }

  function openCanje(cliente) {
    const services = getRewardServices(cliente);
    if (!cliente?.premio_disponible || !services.length) return;
    setCanjeTarget(cliente);
    setCanjeForm({ id_servicio: services[0].id_servicio, motivo: "" });
    setCanjeError("");
    setCanjeOpen(true);
  }

    const loadLegacyCandidates = useCallback(async () => {
    setLegacyCandidatesLoading(true);
    try {
      const response = await listAdminPersonasClientes();
      const payload = response?.data ?? response;
      const onlyRegisteredClients = Array.isArray(payload?.clientes)
        ? payload.clientes.filter((cliente) => Boolean(cliente?.tiene_acceso))
        : [];
      setLegacyCandidates(onlyRegisteredClients);
    } catch (err) {
      notifications.error(extractMessage(err), { dedupeKey: "masterpuntos-legacy-candidates-error" });
      setLegacyCandidates([]);
    } finally {
      setLegacyCandidatesLoading(false);
    }
  }, [notifications]);

  function openLegacyMigration(cliente = null) {
    if (!legacyMigrationEnabled || !canManageLegacyPoints) return;
    setLegacyTarget(cliente || null);
    setLegacyClientQuery(cliente?.nombre_completo || "");
    setLegacyClientPickerOpen(false);
    setLegacyForm({ puntos: "", motivo: "Migracion manual de sellos" });
    setLegacyError("");
    setLegacyOpen(true);
    void loadLegacyCandidates();
  }

  async function saveCanje() {
    if (!canjeTarget?.id_cliente || !canjeForm.id_servicio) return setCanjeError("Selecciona servicio.");
    setCanjeSaving(true);
    setCanjeError("");
    try {
      const response = await createAdminMasterPuntosCanje({
        id_cliente: canjeTarget.id_cliente,
        id_servicio: canjeForm.id_servicio,
        id_sucursal: canjeTarget.id_sucursal_origen || null,
        motivo: canjeForm.motivo.trim() || null,
      });
      const payload = response?.data ?? response;
      if (payload?.cliente) setClientes((prev) => replaceItemById(prev, payload.cliente, (entry) => entry?.id_cliente));
      notifications.success("Canje registrado.", { dedupeKey: "masterpuntos-canje-save" });
      setCanjeOpen(false);
      void loadClientes();
    } catch (err) {
      setCanjeError(extractMessage(err));
    } finally {
      setCanjeSaving(false);
    }
  }

  async function saveLegacyMigration() {
    if (!legacyTarget?.id_cliente) return;
    const puntos = Number(legacyForm.puntos);
    if (!Number.isInteger(puntos) || puntos <= 0) {
      setLegacyError("Ingresa una cantidad de puntos valida (entero mayor a cero).");
      return;
    }
    setLegacySaving(true);
    setLegacyError("");
    try {
      const response = await createAdminMasterPuntosLegacyMigracion({
        id_cliente: legacyTarget.id_cliente,
        puntos,
        motivo: legacyForm.motivo?.trim() || null,
      });
      const payload = response?.data ?? response;
      if (payload?.cliente) {
        setClientes((prev) => replaceItemById(prev, payload.cliente, (entry) => entry?.id_cliente));
      }
      notifications.success("Puntos migrados correctamente.", { dedupeKey: "masterpuntos-migracion-save" });
      setLegacyOpen(false);
      setLegacyTarget(null);
      await loadClientes();
    } catch (err) {
      setLegacyError(extractMessage(err));
    } finally {
      setLegacySaving(false);
    }
  }

  const canjeServices = useMemo(() => getRewardServices(canjeTarget), [canjeTarget, getRewardServices]);

  const renderCardActions = (cliente) => {
    const canRedeem = Boolean(cliente?.premio_disponible) && getRewardServices(cliente).length > 0;
    const canLegacyMigrate = Boolean(legacyMigrationEnabled && canManageLegacyPoints && cliente?.can_add_legacy_points);
    return (
      <div className="flex w-full flex-wrap items-center gap-2">
        <HoverActionButton icon={<Search size={14} />} label="Movimientos" onClick={() => openMovimientos(cliente)} />
        <HoverActionButton icon={<Gift size={14} />} label={canRedeem ? "Canjear" : "Sin premio"} disabled={!canRedeem} onClick={() => openCanje(cliente)} />
        {canLegacyMigrate ? (
          <HoverActionButton
            icon={<Star size={14} />}
            label="Migrar puntos"
            onClick={() => openLegacyMigration(cliente)}
          />
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-4 px-2 pb-4 sm:px-4 sm:pb-6">
      <header className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--mf-accent)]">Masterpuntos - GestiÃ³n</p>
            <h1 className="mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Masterpuntos</h1>
            <p className="text-sm text-[var(--mf-text-2)]">Listado de clientes con puntos, vencimiento anual y canje manual.</p>
          </div>
          <div className="flex w-full flex-col gap-2 xl:w-auto xl:min-w-[560px]">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--mf-text-2)]">{loading ? "Cargando..." : `${filteredClientes.length} de ${clientes.length} cliente(s)`}</span>
              <ViewToggle defaultView={view} onViewChange={setView} storageKey="masterpuntos" />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <div className="relative w-full sm:max-w-[320px]">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mf-text-2)]" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente..." className="pl-9 pr-9" />
                {search.trim() ? <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--mf-text-2)]"><X size={12} /></button> : null}
              </div>
              <Button type="button" variant="outline" className="gap-2" onClick={() => setFiltersOpen(true)}><SlidersHorizontal size={15} /> Filtros</Button>
              {legacyMigrationEnabled && canManageLegacyPoints ? (
                <Button type="button" variant="outline" className="gap-2" onClick={() => openLegacyMigration()}>
                  <Star size={15} />
                  Migrar puntos
                </Button>
              ) : null}
              <Button type="button" className="gap-2" onClick={openRules}><Settings2 size={15} /> Configurar reglas</Button>
            </div>
          </div>
        </div>
      </header>

      {listError ? <ErrorBanner message={listError} onRetry={loadClientes} /> : null}
      {loading && !listError ? <LoadingSpinner /> : null}
      {!loading && !listError && filteredClientes.length === 0 ? <EmptyState icon={Star} title="Sin resultados" description="No hay clientes acumulando puntos para este filtro." /> : null}

      {!loading && !listError && filteredClientes.length > 0 && view === "cards" ? (
        <CardsCarousel
          items={filteredClientes}
          getItemKey={(cliente) => cliente?.id_cliente}
          renderItem={(cliente, index, pageIndex) => (
            <DataCard
              key={cliente.id_cliente}
              animationDelay={(pageIndex * 0.02) + (index * 0.05)}
              avatar={<Star size={18} />}
              title={cliente.nombre_completo || "Cliente"}
              subtitle={cliente.nombre_sucursal || "Sin sucursal"}
              badge={<PremioBadge available={cliente.premio_disponible} />}
              fields={[
                { label: "Balance", value: `${cliente.balance_puntos || 0} puntos` },
                { label: "Caducidad", value: formatDate(cliente.vence_at) },
                { label: "Tiempo restante", value: formatDays(cliente.dias_restantes), icon: <Clock3 size={12} className="text-[var(--mf-accent)]/85" /> },
                { label: "Estrellas", value: <StarsInfo count={cliente.estrellas} /> },
              ]}
              actions={renderCardActions(cliente)}
            />
          )}
        />
      ) : null}

      {!loading && !listError && filteredClientes.length > 0 && view === "table" ? (
        <div className="mf-table-wrap">
          <Table>
            <TableHeader><TableRow className="border-[var(--mf-nav-border)]"><TableHead>Cliente</TableHead><TableHead className="hidden lg:table-cell">Sucursal</TableHead><TableHead>Puntos</TableHead><TableHead className="hidden md:table-cell">Estrellas</TableHead><TableHead>Premio</TableHead><TableHead className="text-right">Acciones</TableHead></TableRow></TableHeader>
            <TableBody>
              {filteredClientes.map((cliente) => {
                const canRedeem = Boolean(cliente?.premio_disponible) && getRewardServices(cliente).length > 0;
                const canLegacyMigrate = Boolean(legacyMigrationEnabled && canManageLegacyPoints && cliente?.can_add_legacy_points);
                return (
                  <TableRow key={cliente.id_cliente} className="border-[var(--mf-nav-border)]">
                    <TableCell className="font-medium">{cliente.nombre_completo}</TableCell>
                    <TableCell className="hidden lg:table-cell">{cliente.nombre_sucursal || "-"}</TableCell>
                    <TableCell>{cliente.balance_puntos || 0}</TableCell>
                    <TableCell className="hidden md:table-cell"><StarsInfo count={cliente.estrellas} /></TableCell>
                    <TableCell><PremioBadge available={cliente.premio_disponible} /></TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-2">
                        <HoverActionButton icon={<Search size={14} />} label="Movimientos" onClick={() => openMovimientos(cliente)} />
                        <HoverActionButton icon={<Gift size={14} />} label={canRedeem ? "Canjear" : "Sin premio"} disabled={!canRedeem} onClick={() => openCanje(cliente)} />
                        {canLegacyMigrate ? (
                          <HoverActionButton
                            icon={<Star size={14} />}
                            label="Migrar puntos"
                            onClick={() => openLegacyMigration(cliente)}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Filtros de Masterpuntos</DialogTitle>
            <DialogDescription>Filtra clientes por sucursal o estado del premio.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className={soloPremioDisponible ? "rounded-full border-[var(--mf-accent)] bg-[var(--mf-accent)] text-[var(--mf-accent-text)]" : "rounded-full"} onClick={() => setSoloPremioDisponible((prev) => !prev)}>Solo premio disponible</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedBranch("all"); setSoloPremioDisponible(false); }}>Limpiar</Button>
          </div>
          <div><Label className="mf-label">Sucursal</Label><select className="mf-select mt-1" value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}><option value="all">Todas</option>{(contexto.sucursales || []).map((s) => <option key={s.id_sucursal} value={s.id_sucursal}>{s.nombre_sucursal}</option>)}</select></div>
        </DialogContent>
      </Dialog>

      <Dialog open={ruleOpen} onOpenChange={setRuleOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Configuracion de reglas</DialogTitle>
            <DialogDescription>Define el umbral, puntos para premio y servicios redimibles.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><Label className="mf-label">Alcance</Label><select className="mf-select mt-1" value={ruleForm.scope} onChange={(e) => setRuleForm(toRuleForm(contexto, e.target.value, ruleForm.id_sucursal || contexto.sucursales?.[0]?.id_sucursal || ""))}><option value="global">Global</option><option value="sucursal">Por sucursal</option></select></div>
            <div><Label className="mf-label">Sucursal</Label><select disabled={ruleForm.scope !== "sucursal"} className="mf-select mt-1" value={ruleForm.id_sucursal} onChange={(e) => setRuleForm(toRuleForm(contexto, "sucursal", e.target.value))}><option value="">Selecciona sucursal</option>{(contexto.sucursales || []).map((s) => <option key={s.id_sucursal} value={s.id_sucursal}>{s.nombre_sucursal}</option>)}</select></div>
            <div><Label className="mf-label">Monto mÃ­nimo (L)</Label><Input className="mf-input mt-1" type="number" min="0" step="0.01" value={ruleForm.umbral_monto_hnl} onChange={(e) => setRuleForm((p) => ({ ...p, umbral_monto_hnl: e.target.value }))} /></div>
            <div><Label className="mf-label">Puntos para premio</Label><Input className="mf-input mt-1" type="number" min="1" step="1" value={ruleForm.puntos_para_premio} onChange={(e) => setRuleForm((p) => ({ ...p, puntos_para_premio: e.target.value }))} /></div>
          </div>
          <div className="mt-3 rounded-xl border border-[var(--mf-nav-border)] p-3">
            <Label className="mf-label">Servicios redimibles</Label>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(contexto.servicios_catalogo || []).map((servicio) => {
                const checked = (ruleForm.servicios_redimibles || []).includes(servicio.id_servicio);
                return <label key={servicio.id_servicio} className="flex items-center justify-between rounded-lg border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2 text-sm"><span>{servicio.nombre_servicio}</span><input type="checkbox" checked={checked} onChange={() => setRuleForm((prev) => { const set = new Set(prev.servicios_redimibles || []); if (set.has(servicio.id_servicio)) set.delete(servicio.id_servicio); else set.add(servicio.id_servicio); return { ...prev, servicios_redimibles: Array.from(set) }; })} /></label>;
              })}
            </div>
          </div>
          {ruleError ? <p className="mt-2 rounded-[12px] bg-red-500/10 px-3 py-2 text-sm text-red-400">{ruleError}</p> : null}
          <DialogFooter><Button variant="outline" onClick={() => setRuleOpen(false)} disabled={ruleSaving}>Cancelar</Button><Button onClick={saveRules} disabled={ruleSaving}>{ruleSaving ? "Guardando..." : "Guardar regla"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={canjeOpen} onOpenChange={setCanjeOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Canje manual</DialogTitle>
            <DialogDescription>Aplica un canje de puntos al servicio seleccionado para este cliente.</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2 text-sm"><p className="font-semibold">{canjeTarget?.nombre_completo || "Cliente"}</p><p className="text-xs text-[var(--mf-text-2)]">Balance: {canjeTarget?.balance_puntos || 0} puntos</p></div>
          <div><Label className="mf-label">Servicio</Label><select className="mf-select mt-1" value={canjeForm.id_servicio} onChange={(e) => setCanjeForm((p) => ({ ...p, id_servicio: e.target.value }))}><option value="">Selecciona servicio</option>{canjeServices.map((s) => <option key={s.id_servicio} value={s.id_servicio}>{s.nombre_servicio}</option>)}</select></div>
          <div><Label className="mf-label">Motivo</Label><Input className="mf-input mt-1" maxLength={280} value={canjeForm.motivo} onChange={(e) => setCanjeForm((p) => ({ ...p, motivo: e.target.value }))} placeholder="Opcional" /></div>
          {canjeError ? <p className="mt-2 rounded-[12px] bg-red-500/10 px-3 py-2 text-sm text-red-400">{canjeError}</p> : null}
          <DialogFooter><Button variant="outline" onClick={() => setCanjeOpen(false)} disabled={canjeSaving}>Cancelar</Button><Button onClick={saveCanje} disabled={canjeSaving}>{canjeSaving ? "Canjeando..." : "Confirmar canje"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={legacyOpen} onOpenChange={setLegacyOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Migración manual de puntos</DialogTitle>
            <DialogDescription>Esta acción solo se puede realizar una vez por cliente.</DialogDescription>
          </DialogHeader>

          <div>
            <Label className="mf-label">Cliente</Label>
            <div className="relative mt-1" onBlur={() => setTimeout(() => setLegacyClientPickerOpen(false), 120)}>
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mf-text-2)]" />
              <Input
                className="pl-9 pr-10"
                value={legacyClientQuery}
                onFocus={() => setLegacyClientPickerOpen(true)}
                onChange={(event) => {
                  setLegacyClientQuery(event.target.value);
                  setLegacyClientPickerOpen(true);
                }}
                placeholder="Buscar por nombre o teléfono"
              />
              {legacyClientPickerOpen ? (
                <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-[var(--mf-nav-border)] bg-[var(--mf-card)] p-1 shadow-lg">
                  {legacyCandidatesLoading ? (
                    <p className="px-3 py-2 text-sm text-[var(--mf-text-2)]">Buscando clientes registrados...</p>
                  ) : legacyCandidatesFiltered.length > 0 ? (
                    legacyCandidatesFiltered.map((cliente) => (
                      <button
                        key={cliente.id_cliente}
                        type="button"
                        className="flex w-full flex-col rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--mf-btn-bg)]"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setLegacyTarget(cliente);
                          setLegacyClientQuery(cliente.nombre_completo || "");
                          setLegacyClientPickerOpen(false);
                        }}
                      >
                        <span className="font-medium">{cliente.nombre_completo || "Cliente"}</span>
                        <span className="text-xs text-[var(--mf-text-2)]">
                          {cliente.telefono_principal || "Sin teléfono"}
                          {cliente.nombre_sucursal ? ` · ${cliente.nombre_sucursal}` : ""}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="space-y-2 px-3 py-2">
                      <p className="text-sm text-[var(--mf-text-2)]">No se encontró un cliente registrado con ese criterio.</p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <div>
            <Label className="mf-label">Puntos a migrar *</Label>
            <Input
              className="mf-input mt-1"
              type="number"
              min="1"
              step="1"
              value={legacyForm.puntos}
              onChange={(e) => setLegacyForm((prev) => ({ ...prev, puntos: e.target.value }))}
              placeholder="Ej. 7"
            />
          </div>
          <div>
            <Label className="mf-label">Motivo</Label>
            <Input
              className="mf-input mt-1"
              maxLength={280}
              value={legacyForm.motivo}
              onChange={(e) => setLegacyForm((prev) => ({ ...prev, motivo: e.target.value }))}
              placeholder="Ej. Migración de tarjeta física"
            />
          </div>
          {legacyError ? <p className="mt-2 rounded-[12px] bg-red-500/10 px-3 py-2 text-sm text-red-400">{legacyError}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLegacyOpen(false)} disabled={legacySaving}>Cancelar</Button>
            <Button onClick={saveLegacyMigration} disabled={legacySaving || !legacyTarget?.id_cliente}>{legacySaving ? "Guardando..." : "Aplicar migración"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={movOpen} onOpenChange={setMovOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Movimientos de puntos</DialogTitle>
            <DialogDescription>Historial de acumulaciones y canjes del cliente.</DialogDescription>
          </DialogHeader>
          {movCliente ? <div className="rounded-lg border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2 text-sm"><p className="font-semibold">{movCliente.nombre_completo}</p><p className="text-xs text-[var(--mf-text-2)]">Balance: {movCliente.balance_puntos || 0} | Vence: {formatDate(movCliente.vence_at)}</p></div> : null}
          {movError ? <ErrorBanner message={movError} onRetry={() => openMovimientos(movCliente)} /> : null}
          {movLoading ? <LoadingSpinner /> : null}
          {!movLoading && !movError && movimientos.length === 0 ? <EmptyState icon={Clock3} title="Sin movimientos" description="No hay movimientos registrados para este cliente." /> : null}
          {!movLoading && !movError && movimientos.length > 0 ? (
            
            <div className="mf-table-wrap"><Table><TableHeader><TableRow className="border-[var(--mf-nav-border)]"><TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Puntos</TableHead><TableHead className="hidden md:table-cell">Servicio</TableHead><TableHead className="hidden lg:table-cell">Motivo</TableHead></TableRow></TableHeader><TableBody>
              {movimientos.map((mov) => { const value = Number(mov.puntos_ajustados || mov.puntos || 0); return <TableRow key={mov.id_ledger || mov.id_points_tx} className="border-[var(--mf-nav-border)]"><TableCell>{formatDate(mov.created_at)}</TableCell><TableCell>{mov.tipo_movimiento || mov.tipo_descripcion || mov.tipo_puntos_codigo}</TableCell><TableCell><span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${value >= 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>{value >= 0 ? "+" : ""}{value}</span></TableCell><TableCell className="hidden md:table-cell">{mov.nombre_servicio_canje || "-"}</TableCell><TableCell className="hidden lg:table-cell">{mov.motivo || "-"}</TableCell></TableRow>; })}
            </TableBody></Table></div>
          ) : null}
          {!movLoading && !movError && movTotalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-[var(--mf-nav-border)] pt-4">
              <span className="text-sm text-[var(--mf-text-2)]">Página {movPage} de {movTotalPages}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={movPage <= 1} onClick={() => openMovimientos(movCliente, movPage - 1)}>Anterior</Button>
                <Button variant="outline" size="sm" disabled={movPage >= movTotalPages} onClick={() => openMovimientos(movCliente, movPage + 1)}>Siguiente</Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
