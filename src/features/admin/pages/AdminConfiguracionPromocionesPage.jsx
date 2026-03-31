import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Eye, Gift, Loader2, Pencil, Plus, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import { listAdminSucursales } from '../lib/adminSucursalesApi.js';
import { createAdminConfigPromocion, getAdminConfigPromocion, listAdminConfigPromociones, updateAdminConfigPromocion } from '../lib/adminConfiguracionApi.js';
import { emitCatalogSync } from '../../../lib/catalogSync.js';
import { Button } from '../../../components/ui/button.jsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog.jsx';
import { Input } from '../../../components/ui/input.jsx';
import { Label } from '../../../components/ui/label.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.jsx';
import ViewToggle from '../../../components/data/ViewToggle.jsx';
import DataCard from '../../../components/data/DataCard.jsx';
import CardsCarousel from '../../../components/data/CardsCarousel.jsx';
import HoverActionButton from '../../../components/data/HoverActionButton.jsx';
import DetailInfoModalContent from '../../../components/data/DetailInfoModalContent.jsx';
import EmptyState from '../../../components/data/EmptyState.jsx';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';

const FORM_DEFAULTS = {
  id_sucursal: '', titulo: '', subtitulo: '', parrafos_texto: '',
  imagen_principal_url: '',
  visible_publico: false, destacada: false,
  vigencia_desde: '', vigencia_hasta: '', estado: 'borrador',
};

const FILTER_DEFAULTS = { estado: 'all', visibilidad: 'all', destacada: 'all', ctaTipo: 'all', idSucursal: 'all' };

function extractMessage(error) {
  return error?.data?.error?.message || error?.message || 'Error desconocido.';
}

function normalizeSlug(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function normalizeParagraphs(text) {
  return String(text || '').split('\n').map((line) => line.trim()).filter(Boolean);
}

function serializeParagraphs(rows) {
  return (Array.isArray(rows) ? rows : []).map((line) => String(line || '').trim()).filter(Boolean).join('\n');
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return ['1', 'true', 't', 'yes', 'si', 'on'].includes(normalized);
}

function toDateInputValue(value) {
  if (value === undefined || value === null || value === '') return '';
  const raw = String(value).trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function sortPromos(list = []) {
  return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
    if (Boolean(a?.destacada) !== Boolean(b?.destacada)) return a?.destacada ? -1 : 1;
    const order = Number(a?.orden_visual ?? 100) - Number(b?.orden_visual ?? 100);
    if (order !== 0) return order;
    return String(a?.titulo || '').localeCompare(String(b?.titulo || ''), 'es');
  });
}

function upsertPromo(list, item) {
  const id = String(item?.id_promocion || '');
  const branch = String(item?.id_sucursal || '');
  return sortPromos((Array.isArray(list) ? list : []).filter((row) => String(row?.id_promocion || '') !== id || String(row?.id_sucursal || '') !== branch).concat(item));
}

function stateLabel(v) { return v === 'publicada' ? 'Publicada' : v === 'archivada' ? 'Archivada' : 'Borrador'; }
function stateClass(v) { return v === 'publicada' ? 'mf-badge-green' : v === 'archivada' ? 'mf-badge-red' : 'mf-badge-muted'; }
function ctaLabel(v) { return v === 'interno' ? 'Interno' : v === 'externo' ? 'Externo' : 'Sin CTA'; }

function PromotionStateBadge({ estado }) { return <span className={`mf-badge ${stateClass(estado)}`}>{stateLabel(estado)}</span>; }
function PromotionVisibilityBadge({ visible }) { return <span className={`mf-badge ${visible ? 'mf-badge-green' : 'mf-badge-muted'}`}>{visible ? 'Visible' : 'Oculta'}</span>; }
function PromotionFeaturedBadge({ destacada }) { return <span className={`mf-badge ${destacada ? 'mf-badge-gold' : 'mf-badge-muted'}`}>{destacada ? 'Destacada' : 'Normal'}</span>; }
function PromotionVigenciaBadge({ vigenciaHasta }) {
  const endDate = toDateInputValue(vigenciaHasta);
  if (!endDate) return <span className="mf-badge mf-badge-muted">Sin vigencia</span>;
  const today = new Date().toISOString().slice(0, 10);
  const expired = endDate < today;
  return <span className={`mf-badge ${expired ? 'mf-badge-red' : 'mf-badge-green'}`}>{expired ? 'Vencida' : 'Vigente'}</span>;
}

function validate(values) {
  const estado = String(values.estado || 'borrador').trim().toLowerCase();
  const visiblePublico = normalizeBoolean(values.visible_publico);
  const destacada = normalizeBoolean(values.destacada);
  const vigenciaDesde = toDateInputValue(values.vigencia_desde);
  const vigenciaHasta = toDateInputValue(values.vigencia_hasta);

  if (!String(values.id_sucursal || '').trim()) return 'Debes seleccionar una sucursal valida.';
  if (!String(values.titulo || '').trim()) return 'El titulo es requerido.';
  const slug = normalizeSlug(values.titulo);
  if (!slug || slug.length < 3) return 'El titulo debe contener al menos 3 caracteres validos.';
  const parrafos = normalizeParagraphs(values.parrafos_texto);
  if (!parrafos.length) return 'La descripcion es requerida.';
  if (parrafos.length > 8) return 'Solo se permiten hasta 8 parrafos.';
  if (parrafos.some((line) => line.length > 420)) return 'Cada parrafo admite maximo 420 caracteres.';
  if (vigenciaDesde && vigenciaHasta && vigenciaHasta < vigenciaDesde) return 'vigencia_hasta no puede ser menor que vigencia_desde.';
  if (estado === 'archivada' && visiblePublico) return 'Una promocion archivada no puede estar visible_publico=true.';
  if (estado === 'publicada') {
    if (!vigenciaDesde) return 'Una promocion publicada requiere vigencia_desde.';
    if (!String(values.imagen_principal_url || '').trim()) return 'Una promocion publicada requiere imagen_principal_url.';
  }
  if (destacada && (!visiblePublico || estado !== 'publicada')) return 'Una promocion destacada debe estar publicada y visible al publico.';
  return '';
}

function toPayload(values) {
  const titulo = String(values.titulo || '').trim();
  const parrafos = normalizeParagraphs(values.parrafos_texto);
  const vigenciaDesde = toDateInputValue(values.vigencia_desde);
  const vigenciaHasta = toDateInputValue(values.vigencia_hasta);
  return {
    id_sucursal: values.id_sucursal,
    titulo,
    slug: normalizeSlug(titulo),
    subtitulo: String(values.subtitulo || '').trim() || null,
    parrafos,
    imagen_principal_url: String(values.imagen_principal_url || '').trim() || null,
    imagen_mobile_url: null,
    imagen_alt: titulo || null,
    cta_tipo: 'none',
    cta_texto: null,
    cta_url: null,
    visible_publico: normalizeBoolean(values.visible_publico),
    destacada: normalizeBoolean(values.destacada),
    orden_visual: 100,
    vigencia_desde: vigenciaDesde || null,
    vigencia_hasta: vigenciaHasta || null,
    estado: values.estado,
  };
}

function mapToForm(promo, branch = '') {
  return {
    id_sucursal: promo?.id_sucursal || branch || '',
    titulo: promo?.titulo || '', subtitulo: promo?.subtitulo || '',
    parrafos_texto: serializeParagraphs(promo?.parrafos),
    imagen_principal_url: promo?.imagen_principal_url || '',
    visible_publico: normalizeBoolean(promo?.visible_publico), destacada: normalizeBoolean(promo?.destacada),
    vigencia_desde: toDateInputValue(promo?.vigencia_desde), vigencia_hasta: toDateInputValue(promo?.vigencia_hasta),
    estado: promo?.estado || 'borrador',
  };
}
function SucursalSelector({ branchIds, allBranches, selected, onChange, loading }) {
  const available = branchIds.length > 0 ? allBranches.filter((branch) => branchIds.includes(branch.id_sucursal)) : allBranches;
  const validIds = new Set(available.map((branch) => branch.id_sucursal));
  const selectedBranch = available.find((branch) => branch.id_sucursal === selected);

  if (available.length === 1 && selectedBranch) {
    return (
      <div className="mf-glass-surface flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-[var(--mf-text-2)]">
        <Building2 size={13} />
        <span>Sucursal activa:</span>
        <span className="font-medium text-[var(--mf-text)]">{selectedBranch.nombre_sucursal}</span>
      </div>
    );
  }

  if (loading) return <p className="flex items-center gap-2 text-xs text-[var(--mf-text-2)]"><Loader2 size={14} className="animate-spin" />Cargando sucursales...</p>;

  return (
    <div className="flex w-full flex-col gap-1 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
      <Label htmlFor="promotions-branch" className="text-xs uppercase tracking-widest text-[var(--mf-text-2)] sm:shrink-0">Sucursal</Label>
      <select id="promotions-branch" className="mf-select h-10 w-full sm:h-9 sm:min-w-[220px] sm:w-auto" value={selected} onChange={(event) => {
        const nextValue = String(event.target.value || '').trim();
        onChange(validIds.has(nextValue) ? nextValue : '');
      }}>
        <option value="">- Seleccionar sucursal -</option>
        {available.map((branch) => <option key={branch.id_sucursal} value={branch.id_sucursal}>{branch.nombre_sucursal}</option>)}
      </select>
    </div>
  );
}

function PromotionForm({ values, onChange, branchLabel }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2.5 text-sm text-[var(--mf-text-2)]">
        <span className="text-xs uppercase tracking-widest text-[var(--mf-text-2)]">Sucursal</span>
        <div className="mt-1 font-medium text-[var(--mf-text)]">{branchLabel || 'No definida'}</div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2"><Label>Titulo *</Label><Input value={values.titulo} onChange={(e) => onChange('titulo', e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Subtitulo</Label><Input value={values.subtitulo} onChange={(e) => onChange('subtitulo', e.target.value)} /></div>
      </div>

      <div className="space-y-1.5">
        <Label>Descripcion *</Label>
        <textarea className="mf-input min-h-[120px] resize-y py-2" value={values.parrafos_texto} onChange={(e) => onChange('parrafos_texto', e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label>URL imagen principal</Label>
        <Input value={values.imagen_principal_url} onChange={(e) => onChange('imagen_principal_url', e.target.value)} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label className="mf-label">Estado</Label><select className="mf-select" value={values.estado} onChange={(e) => onChange('estado', e.target.value)}><option value="borrador">Borrador</option><option value="publicada">Publicada</option><option value="archivada">Archivada</option></select></div>
        <div className="space-y-1.5"><Label>Vigencia desde</Label><Input type="date" value={values.vigencia_desde} onChange={(e) => onChange('vigencia_desde', e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Vigencia hasta</Label><Input type="date" value={values.vigencia_hasta} onChange={(e) => onChange('vigencia_hasta', e.target.value)} /></div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex items-center justify-between rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2.5 text-sm"><span className="text-[var(--mf-text)]">Visible en landing publica</span><input type="checkbox" checked={Boolean(values.visible_publico)} onChange={(e) => onChange('visible_publico', e.target.checked)} className="h-4 w-4 accent-[var(--mf-accent)]" /></label>
        <label className="flex items-center justify-between rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2.5 text-sm"><span className="text-[var(--mf-text)]">Marcar como destacada</span><input type="checkbox" checked={Boolean(values.destacada)} onChange={(e) => onChange('destacada', e.target.checked)} className="h-4 w-4 accent-[var(--mf-accent)]" /></label>
      </div>
    </div>
  );
}

export default function AdminConfiguracionPromocionesPage() {
  const { branchIds } = useAuth();
  const notifications = useNotifications();

  const [allBranches, setAllBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [branchLoadError, setBranchLoadError] = useState('');
  const [sucursal, setSucursal] = useState(branchIds.length === 1 ? branchIds[0] : '');

  const [promociones, setPromociones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');

  const [view, setView] = useState(() => {
    try { const stored = localStorage.getItem('mf-view-promociones'); return stored === 'table' || stored === 'cards' ? stored : 'cards'; }
    catch { return 'cards'; }
  });

  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState(() => ({ ...FILTER_DEFAULTS }));

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [formValues, setFormValues] = useState(FORM_DEFAULTS);
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTarget, setDetailTarget] = useState(null);

  const branchNameById = useMemo(() => allBranches.reduce((acc, branch) => ({ ...acc, [branch.id_sucursal]: branch.nombre_sucursal }), {}), [allBranches]);
  const availableBranches = useMemo(() => (branchIds.length > 0 ? allBranches.filter((branch) => branchIds.includes(branch.id_sucursal)) : allBranches).filter((branch) => branch?.id_sucursal), [allBranches, branchIds]);
  const actionsLockedByBranch = !sucursal && availableBranches.length > 1;

  const filteredPromociones = useMemo(() => {
    const searchValue = search.trim().toLowerCase();
    return promociones.filter((promo) => {
      if (searchValue) {
        const text = [promo?.titulo, promo?.subtitulo, promo?.slug, ...(Array.isArray(promo?.parrafos) ? promo.parrafos : [])].filter(Boolean).join(' ').toLowerCase();
        if (!text.includes(searchValue)) return false;
      }
      if (filters.estado !== 'all' && String(promo?.estado || '') !== filters.estado) return false;
      if (filters.visibilidad !== 'all' && Boolean(promo?.visible_publico) !== (filters.visibilidad === 'visible')) return false;
      if (filters.destacada !== 'all' && Boolean(promo?.destacada) !== (filters.destacada === 'si')) return false;
      if (filters.ctaTipo !== 'all' && String(promo?.cta_tipo || 'none') !== filters.ctaTipo) return false;
      if (!sucursal && filters.idSucursal !== 'all' && String(promo?.id_sucursal || '') !== filters.idSucursal) return false;
      return true;
    });
  }, [filters, promociones, search, sucursal]);
  const activeFilterCount = useMemo(() => Object.values(filters).filter((value) => value !== 'all').length, [filters]);
  const chips = useMemo(() => {
    const out = [];
    if (search.trim()) out.push({ key: 'search', label: `Busqueda: ${search.trim()}` });
    if (filters.estado !== 'all') out.push({ key: 'estado', label: `Estado: ${stateLabel(filters.estado)}` });
    if (filters.visibilidad !== 'all') out.push({ key: 'visibilidad', label: `Publico: ${filters.visibilidad === 'visible' ? 'Visible' : 'Oculto'}` });
    if (filters.destacada !== 'all') out.push({ key: 'destacada', label: `Destacada: ${filters.destacada === 'si' ? 'Si' : 'No'}` });
    if (filters.ctaTipo !== 'all') out.push({ key: 'ctaTipo', label: `CTA: ${ctaLabel(filters.ctaTipo)}` });
    if (!sucursal && filters.idSucursal !== 'all') out.push({ key: 'idSucursal', label: `Sucursal: ${branchNameById[filters.idSucursal] || 'Seleccionada'}` });
    return out;
  }, [branchNameById, filters, search, sucursal]);

  const fetchBranches = useCallback(async () => {
    setLoadingBranches(true);
    setBranchLoadError('');
    try {
      const response = await listAdminSucursales({ soloActivas: true });
      const payload = response?.data || response;
      setAllBranches(Array.isArray(payload?.sucursales) ? payload.sucursales.filter((item) => item?.id_sucursal && item?.estado !== false) : []);
    } catch (error) {
      const message = extractMessage(error);
      setBranchLoadError(message);
      notifications.error(message, { dedupeKey: 'promos-branches-error' });
    } finally { setLoadingBranches(false); }
  }, [notifications]);

  const fetchPromociones = useCallback(async ({ silent = false } = {}) => {
    if (!silent) { setLoading(true); setListError(''); }
    try {
      const response = await listAdminConfigPromociones({ id_sucursal: sucursal || undefined });
      const payload = response?.data || response;
      setPromociones(sortPromos(Array.isArray(payload?.promociones) ? payload.promociones : []));
    } catch (error) {
      const message = extractMessage(error);
      setListError(message);
      if (silent) notifications.error(message, { dedupeKey: 'promos-list-error' });
    } finally { if (!silent) setLoading(false); }
  }, [notifications, sucursal]);

  useEffect(() => { void fetchBranches(); }, [fetchBranches]);
  useEffect(() => {
    if (sucursal) return;
    if (branchIds.length === 1) setSucursal(branchIds[0]);
    else if (availableBranches.length === 1) setSucursal(availableBranches[0].id_sucursal);
  }, [availableBranches, branchIds, sucursal]);
  useEffect(() => { void fetchPromociones(); }, [fetchPromociones]);

  function clearAllFilters() { setSearch(''); setFilters({ ...FILTER_DEFAULTS }); }
  function clearChip(key) {
    if (key === 'search') setSearch('');
    else setFilters((prev) => ({ ...prev, [key]: 'all' }));
  }

  function handleFormChange(field, value) {
    setFormValues((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'estado' && value === 'archivada') { next.visible_publico = false; next.destacada = false; }
      if (field === 'visible_publico' && !value) next.destacada = false;
      return next;
    });
    setFormError('');
  }

  function openNuevo() {
    if (actionsLockedByBranch) {
      notifications.warning('Selecciona una sucursal para crear promociones.', { dedupeKey: 'promos-branch-required' });
      return;
    }
    setEditTarget(null);
    setFormValues({ ...FORM_DEFAULTS, id_sucursal: sucursal || '' });
    setFormError('');
    setDialogOpen(true);
  }

  async function openEditar(promo) {
    const branchId = promo?.id_sucursal || sucursal;
    if (!branchId) return;
    setFormLoading(true);
    setEditTarget(promo);
    setFormError('');
    try {
      const response = await getAdminConfigPromocion(promo.id_promocion, { id_sucursal: branchId });
      const payload = response?.data || response;
      setFormValues(mapToForm(payload?.promocion || promo, branchId));
      setDialogOpen(true);
    } catch (error) {
      notifications.error(extractMessage(error), { dedupeKey: 'promos-edit-load-error' });
      setEditTarget(null);
    } finally { setFormLoading(false); }
  }

  async function openDetail(promo) {
    const branchId = promo?.id_sucursal || sucursal;
    if (!branchId) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailTarget(null);
    try {
      const response = await getAdminConfigPromocion(promo.id_promocion, { id_sucursal: branchId });
      const payload = response?.data || response;
      setDetailTarget(payload?.promocion || null);
    } catch (error) {
      notifications.error(extractMessage(error), { dedupeKey: 'promos-detail-error' });
      setDetailOpen(false);
    } finally { setDetailLoading(false); }
  }

  async function handleGuardar() {
    const errorText = validate(formValues);
    if (errorText) { setFormError(errorText); return; }
    setFormLoading(true);
    setFormError('');
    try {
      const payload = toPayload(formValues);
      if (editTarget?.id_promocion) {
        const response = await updateAdminConfigPromocion(editTarget.id_promocion, payload);
        const data = response?.data || response;
        if (data?.promocion) setPromociones((current) => upsertPromo(current, data.promocion));
        emitCatalogSync('promocion-updated');
        notifications.success('Promocion actualizada correctamente.', { dedupeKey: 'promos-update-ok' });
      } else {
        const response = await createAdminConfigPromocion(payload);
        const data = response?.data || response;
        if (data?.promocion) setPromociones((current) => upsertPromo(current, data.promocion));
        emitCatalogSync('promocion-created');
        notifications.success('Promocion creada correctamente.', { dedupeKey: 'promos-create-ok' });
      }
      setDialogOpen(false);
      setEditTarget(null);
      await fetchPromociones({ silent: true });
    } catch (error) {
      const message = extractMessage(error);
      setFormError(message);
      notifications.error(message, { dedupeKey: 'promos-save-error' });
    } finally { setFormLoading(false); }
  }

  function renderActions(promo) {
    return (
      <div className="flex items-center gap-1.5">
        <HoverActionButton icon={<Eye size={16} strokeWidth={2} />} label="Detalle" title="Ver detalle de promocion" disabled={actionsLockedByBranch} onClick={() => void openDetail(promo)} />
        <HoverActionButton icon={<Pencil size={16} strokeWidth={2} />} label="Editar" title="Editar promocion" disabled={actionsLockedByBranch} onClick={() => void openEditar(promo)} />
      </div>
    );
  }

  const subtitle = !sucursal && availableBranches.length > 1 ? 'Selecciona una sucursal para crear o editar promociones de configuracion.' : 'Administra promociones publicas por sucursal y controla su publicacion.';

  return (
    <div className="space-y-4 px-2 pb-4 sm:px-4 sm:pb-6">
      <header className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--mf-accent)]">Configuracion - Promociones</p>
              <h1 className="mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Promociones</h1>
              <p className="text-sm text-[var(--mf-text-2)]">{subtitle}</p>
            </div>
            <SucursalSelector branchIds={branchIds} allBranches={allBranches} selected={sucursal} onChange={setSucursal} loading={loadingBranches} />
            {branchLoadError ? <ErrorBanner message={branchLoadError} /> : null}
          </div>

          <div className="flex w-full flex-col gap-2 xl:w-auto xl:min-w-[560px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-[var(--mf-text-2)]">{filteredPromociones.length} de {promociones.length} promocion(es)</p>
              <ViewToggle defaultView={view} onViewChange={setView} storageKey="promociones" />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <div className="relative w-full sm:max-w-[320px]"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mf-text-2)]" size={15} /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por titulo, slug o contenido" className="pl-9" /></div>
              <Button variant="outline" className="gap-2" onClick={() => setFiltersOpen(true)}><SlidersHorizontal size={15} /> Filtros{activeFilterCount > 0 ? <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--mf-accent)] px-1.5 text-xs text-[var(--mf-accent-text)]">{activeFilterCount}</span> : null}</Button>
              <Button className="gap-2" onClick={openNuevo} disabled={actionsLockedByBranch}><Plus size={15} /> Nueva</Button>
            </div>
          </div>
        </div>
      </header>
      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_78%,transparent)] p-3">
          {chips.map((chip) => <button key={chip.key} type="button" onClick={() => clearChip(chip.key)} className="mf-badge mf-badge-muted inline-flex items-center gap-1 hover:border hover:border-[var(--mf-btn-border)]" title="Quitar filtro">{chip.label}<X size={11} /></button>)}
          <Button variant="ghost" size="sm" className="ml-auto gap-1 text-xs" onClick={clearAllFilters}><RotateCcw size={13} /> Limpiar</Button>
        </div>
      ) : null}

      {loading ? <LoadingSpinner label="Cargando promociones..." /> : null}
      {!loading && listError ? <ErrorBanner message={listError} onRetry={() => void fetchPromociones()} /> : null}
      {!loading && !listError && promociones.length === 0 ? <EmptyState icon={Gift} title="Sin promociones registradas" description="Crea la primera promocion por sucursal para preparar la landing publica." actionLabel="Crear promocion" onAction={openNuevo} /> : null}
      {!loading && !listError && promociones.length > 0 && filteredPromociones.length === 0 ? <EmptyState icon={Search} title="Sin resultados" description="No hay coincidencias con la busqueda o filtros actuales." /> : null}

      {!loading && !listError && filteredPromociones.length > 0 && view === 'cards' ? (
        <CardsCarousel
          items={filteredPromociones}
          pageSizeByViewport={{ mobile: 1, tablet: 2, desktop: 3 }}
          getItemKey={(promo) => `${promo?.id_promocion || 'promo'}:${promo?.id_sucursal || 'all'}`}
          renderItem={(promo, index, pageIndex) => (
            <DataCard
              key={`${promo?.id_promocion || 'promo'}:${promo?.id_sucursal || 'all'}`}
              animationDelay={(pageIndex * 0.02) + (index * 0.05)}
              avatar={<Gift size={16} />}
              title={promo.titulo || 'Promocion'}
              subtitle={promo.subtitulo || promo.slug || 'Sin subtitulo'}
              badge={<PromotionStateBadge estado={promo.estado} />}
              fields={[
                ...(!sucursal ? [{ label: 'Sucursal', value: branchNameById[promo.id_sucursal] || 'Sin sucursal' }] : []),
                { label: 'Publico', value: <PromotionVisibilityBadge visible={Boolean(promo.visible_publico)} /> },
                { label: 'Destacada', value: <PromotionFeaturedBadge destacada={Boolean(promo.destacada)} /> },
                { label: 'Vigencia', value: <PromotionVigenciaBadge vigenciaHasta={promo.vigencia_hasta} /> },
              ]}
              actions={renderActions(promo)}
            />
          )}
        />
      ) : null}

      {!loading && !listError && filteredPromociones.length > 0 && view === 'table' ? (
        <div className="mf-table-wrap">
          <Table>
            <TableHeader><TableRow className="border-[var(--mf-nav-border)]">{!sucursal ? <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Sucursal</TableHead> : null}<TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Titulo</TableHead><TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] hidden lg:table-cell">Slug</TableHead><TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center">Estado</TableHead><TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center hidden md:table-cell">Publico</TableHead><TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center hidden md:table-cell">Destacada</TableHead><TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center hidden md:table-cell">Vigencia</TableHead><TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center">Orden</TableHead><TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] hidden lg:table-cell">Fechas</TableHead><TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-right">Acciones</TableHead></TableRow></TableHeader>
            <TableBody>{filteredPromociones.map((promo) => (<TableRow key={`${promo.id_promocion}:${promo.id_sucursal}`} className="border-[var(--mf-nav-border)] hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_60%,transparent)] transition-colors">{!sucursal ? <TableCell className="text-[var(--mf-text-2)] text-sm whitespace-nowrap">{branchNameById[promo.id_sucursal] || 'Sin sucursal'}</TableCell> : null}<TableCell className="font-medium text-[var(--mf-text)]"><div>{promo.titulo}</div>{promo.subtitulo ? <div className="text-xs text-[var(--mf-text-2)] mt-0.5">{promo.subtitulo}</div> : null}</TableCell><TableCell className="text-[var(--mf-text-2)] hidden lg:table-cell">{promo.slug || '-'}</TableCell><TableCell className="text-center"><PromotionStateBadge estado={promo.estado} /></TableCell><TableCell className="text-center hidden md:table-cell"><PromotionVisibilityBadge visible={Boolean(promo.visible_publico)} /></TableCell><TableCell className="text-center hidden md:table-cell"><PromotionFeaturedBadge destacada={Boolean(promo.destacada)} /></TableCell><TableCell className="text-center hidden md:table-cell"><PromotionVigenciaBadge vigenciaHasta={promo.vigencia_hasta} /></TableCell><TableCell className="text-center text-[var(--mf-text-2)]">{Number(promo.orden_visual ?? 100)}</TableCell><TableCell className="hidden lg:table-cell text-[var(--mf-text-2)] text-xs whitespace-nowrap">{(promo.vigencia_desde || '-')} {' -> '} {(promo.vigencia_hasta || '-')}</TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-1.5">{renderActions(promo)}</div></TableCell></TableRow>))}</TableBody>
          </Table>
        </div>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!formLoading) setDialogOpen(open); }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editTarget ? 'Editar promocion' : 'Nueva promocion'}</DialogTitle><DialogDescription className="sr-only">Configura contenido, publicacion, CTA y vigencia de la promocion por sucursal.</DialogDescription></DialogHeader>
          <PromotionForm values={formValues} onChange={handleFormChange} branchLabel={branchNameById[formValues.id_sucursal]} />
          {formError ? <ErrorBanner message={formError} /> : null}
          <DialogFooter className="mt-2"><Button variant="outline" onClick={() => setDialogOpen(false)} disabled={formLoading}>Cancelar</Button><Button onClick={() => void handleGuardar()} disabled={formLoading} className="gap-2 min-w-[140px]">{formLoading ? <Loader2 size={15} className="animate-spin" /> : null}{editTarget ? 'Guardar cambios' : 'Crear promocion'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Detalle de promocion</DialogTitle><DialogDescription className="sr-only">Consulta campos basicos de la promocion y su estado de publicacion.</DialogDescription></DialogHeader>
          {detailLoading ? <LoadingSpinner label="Cargando detalle..." /> : null}
          {!detailLoading && detailTarget ? (
            <DetailInfoModalContent
              summary={{ icon: <Gift size={16} />, title: detailTarget.titulo || '-', subtitle: detailTarget.subtitulo || detailTarget.slug || '-', badge: <PromotionStateBadge estado={detailTarget.estado} /> }}
              sections={[
                { id: 'publicacion', title: 'Publicacion', icon: <Gift size={14} />, fields: [
                  { label: 'Sucursal', value: branchNameById[detailTarget.id_sucursal] || detailTarget.id_sucursal || '-' },
                  { label: 'Visible publico', value: <PromotionVisibilityBadge visible={Boolean(detailTarget.visible_publico)} /> },
                  { label: 'Estado', value: <PromotionStateBadge estado={detailTarget.estado} /> },
                  { label: 'Destacada', value: <PromotionFeaturedBadge destacada={Boolean(detailTarget.destacada)} /> },
                  { label: 'Vigencia', value: <PromotionVigenciaBadge vigenciaHasta={detailTarget.vigencia_hasta} /> },
                  { label: 'Vigencia desde', value: detailTarget.vigencia_desde || '-' },
                  { label: 'Vigencia hasta', value: detailTarget.vigencia_hasta || '-' },
                ]},
                { id: 'contenido', title: 'Contenido', icon: <Building2 size={14} />, fields: [
                  { label: 'Titulo', value: detailTarget.titulo || '-' },
                  { label: 'Subtitulo', value: detailTarget.subtitulo || '-' },
                  { label: 'Descripcion', value: Array.isArray(detailTarget.parrafos) && detailTarget.parrafos.length ? <div className="space-y-1 text-left">{detailTarget.parrafos.map((line, index) => (<p key={`${index}-${line}`} className="text-sm">{line}</p>))}</div> : 'Sin descripcion', span: 'full' },
                  { label: 'Imagen principal', value: detailTarget.imagen_principal_url || '-', span: 'full' },
                ]},
              ]}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Filtros de Promociones</DialogTitle><DialogDescription className="sr-only">Filtra promociones por estado, visibilidad, destacada, CTA y sucursal.</DialogDescription></DialogHeader>
          <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><Label className="mf-label">Estado</Label><select className="mf-select mt-1" value={filters.estado} onChange={(event) => setFilters((prev) => ({ ...prev, estado: event.target.value }))}><option value="all">Todos</option><option value="borrador">Borrador</option><option value="publicada">Publicada</option><option value="archivada">Archivada</option></select></div>
            <div><Label className="mf-label">Visibilidad publica</Label><select className="mf-select mt-1" value={filters.visibilidad} onChange={(event) => setFilters((prev) => ({ ...prev, visibilidad: event.target.value }))}><option value="all">Todos</option><option value="visible">Visible</option><option value="oculto">Oculto</option></select></div>
            <div><Label className="mf-label">Destacada</Label><select className="mf-select mt-1" value={filters.destacada} onChange={(event) => setFilters((prev) => ({ ...prev, destacada: event.target.value }))}><option value="all">Todos</option><option value="si">Si</option><option value="no">No</option></select></div>
            <div><Label className="mf-label">CTA</Label><select className="mf-select mt-1" value={filters.ctaTipo} onChange={(event) => setFilters((prev) => ({ ...prev, ctaTipo: event.target.value }))}><option value="all">Todos</option><option value="none">Sin CTA</option><option value="interno">Interno</option><option value="externo">Externo</option></select></div>
            {!sucursal ? <div className="sm:col-span-2"><Label className="mf-label">Sucursal</Label><select className="mf-select mt-1" value={filters.idSucursal} onChange={(event) => setFilters((prev) => ({ ...prev, idSucursal: event.target.value }))}><option value="all">Todas</option>{availableBranches.map((branch) => <option key={branch.id_sucursal} value={branch.id_sucursal}>{branch.nombre_sucursal}</option>)}</select></div> : <p className="sm:col-span-2 text-xs text-[var(--mf-text-2)]">La sucursal ya esta fijada en el selector superior.</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={clearAllFilters}>Limpiar filtros</Button><Button onClick={() => setFiltersOpen(false)}>Cerrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
