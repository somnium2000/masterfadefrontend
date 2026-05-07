import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, ClipboardList, Mail, Pencil, Plus, RefreshCw, Save, SlidersHorizontal, UserCheck, UserX } from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import { Input } from '../../../components/ui/input.jsx';
import { Label } from '../../../components/ui/label.jsx';
import CardsCarousel from '../../../components/data/CardsCarousel.jsx';
import EmptyState from '../../../components/data/EmptyState.jsx';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import ActionConfirmDialog from '../../../components/feedback/ActionConfirmDialog.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import {
  cancelAdminConfigComunicacionCampania,
  createAdminConfigComunicacionCampania,
  getAdminConfigComunicacionElegibilidad,
  getAdminConfigComunicacionCampania,
  listAdminConfigComunicacionCampaniaEnvios,
  listAdminConfigComunicacionCampanias,
  listAdminConfigComunicacionElegibilidadDestinatarios,
  programAdminConfigComunicacionCampania,
  retryFailedAdminConfigComunicacionCampania,
  sendAdminConfigComunicacionCampania,
  updateAdminConfigComunicacionCampania,
} from '../lib/adminConfiguracionApi.js';

const FORM_DEFAULTS = {
  nombre_interno: '',
  asunto: '',
  contenido_texto: '',
  observaciones: '',
};
const CAMPAIGNS_PAGE_SIZE = 100;

function extractMessage(error) {
  const raw = error?.data?.error?.message || error?.message || 'Error desconocido.';
  if (/sql|postgres|stack|trace|syntax|jwt|token|supabase|smtp|provider/i.test(String(raw))) {
    return 'No se pudo completar la operación en este momento.';
  }
  return raw;
}

function normalizeRequiredText(value) {
  return String(value || '').trim();
}

function normalizeOptionalText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('es-HN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toDatetimeLocalValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function mapCampaignToForm(campaign) {
  return {
    nombre_interno: campaign?.nombre_interno || '',
    asunto: campaign?.asunto || '',
    contenido_texto: campaign?.contenido_texto || '',
    observaciones: campaign?.observaciones || '',
  };
}

function buildPayload(values) {
  return {
    tipo_campania: 'informativa',
    nombre_interno: normalizeRequiredText(values.nombre_interno),
    asunto: normalizeRequiredText(values.asunto),
    contenido_texto: normalizeRequiredText(values.contenido_texto),
    observaciones: normalizeOptionalText(values.observaciones),
  };
}

function validateForm(values) {
  if (!normalizeRequiredText(values.nombre_interno)) return 'nombre_interno es requerido.';
  if (!normalizeRequiredText(values.asunto)) return 'asunto es requerido.';
  if (!normalizeRequiredText(values.contenido_texto)) return 'contenido_texto es requerido.';
  return '';
}

function CampaignStateBadge({ estado }) {
  const normalized = String(estado || '').trim().toLowerCase();
  const toneClass = normalized === 'borrador'
    ? 'mf-badge-muted'
    : normalized === 'programada'
      ? 'mf-badge-gold'
    : normalized === 'cancelada'
      ? 'mf-badge-red'
      : normalized === 'finalizada'
        ? 'mf-badge-green'
        : 'mf-badge-muted';
  return (
    <span className={`mf-badge ${toneClass}`}>
      {formatOperationalStateLabel(normalized)}
    </span>
  );
}

function getOperationalState(campaign) {
  const raw = String(campaign?.estado || '').trim().toLowerCase();
  if (raw === 'cancelada') return 'cancelada';
  if (raw === 'finalizada') return 'finalizada';
  if (campaign?.finalizada_at && Number(campaign?.total_pendientes || 0) === 0 && Number(campaign?.total_fallidos || 0) === 0) {
    return 'finalizada';
  }
  return raw || 'sin_estado';
}

function formatReasonLabel(reason) {
  const key = String(reason || '').trim().toLowerCase();
  if (key === 'sin_correo') return 'Sin correo';
  if (key === 'inactivo') return 'Cliente inactivo';
  if (key === 'sin_aceptacion_terminos') return 'Sin aceptacion de terminos';
  if (key === 'sin_consentimiento_marketing') return 'Sin consentimiento marketing';
  if (key === 'exclusion_manual') return 'Exclusion manual';
  return key || 'Sin motivo';
}

function formatOperationalStateLabel(state) {
  const normalized = String(state || '').trim().toLowerCase();
  if (normalized === 'borrador') return 'Borrador';
  if (normalized === 'programada') return 'Programada';
  if (normalized === 'finalizada') return 'Finalizada';
  if (normalized === 'cancelada') return 'Cancelada';
  if (normalized === 'procesando') return 'Procesando';
  if (normalized === 'error') return 'Con error';
  return 'Sin estado';
}

function formatCampaignTypeLabel(type) {
  const normalized = String(type || '').trim().toLowerCase();
  if (normalized === 'informativa') return 'Informativa';
  return 'Informativa';
}

function CampaignTypeBadge({ tipo }) {
  const normalized = String(tipo || '').trim().toLowerCase();
  return <span className="mf-badge mf-badge-green">{formatCampaignTypeLabel(normalized)}</span>;
}

function formatShipmentStateLabel(state) {
  const normalized = String(state || '').trim().toLowerCase();
  if (normalized === 'pendiente') return 'Pendiente';
  if (normalized === 'enviado') return 'Enviado';
  if (normalized === 'fallido') return 'Fallido';
  if (normalized === 'omitido') return 'Omitido';
  return normalized || 'Sin estado';
}

function getCampaignAttentionLabel(campaign) {
  const pending = Number(campaign?.total_pendientes || 0);
  const failed = Number(campaign?.total_fallidos || 0);
  if (failed > 0) return 'Tiene fallidos';
  if (pending > 0) return 'Requiere accion';
  return '';
}

export default function AdminConfiguracionComunicacionPage() {
  const notifications = useNotifications();
  const editorPanelRef = useRef(null);

  const [campaigns, setCampaigns] = useState([]);
  const [campaignsTotal, setCampaignsTotal] = useState(0);
  const [campaignsOffset, setCampaignsOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOperationalState, setFilterOperationalState] = useState('');
  const [showCancelledCampaigns, setShowCancelledCampaigns] = useState(false);
  const [sortKey, setSortKey] = useState('updated_desc');
  const [showFilters, setShowFilters] = useState(false);

  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [eligibilityError, setEligibilityError] = useState('');
  const [eligibilitySummary, setEligibilitySummary] = useState(null);
  const [eligibleRecipients, setEligibleRecipients] = useState([]);
  const [excludedRecipients, setExcludedRecipients] = useState([]);
  const [selectedEligibleIds, setSelectedEligibleIds] = useState([]);
  const [manuallyExcludedIds, setManuallyExcludedIds] = useState([]);
  const [shipmentsLoading, setShipmentsLoading] = useState(false);
  const [shipmentsError, setShipmentsError] = useState('');
  const [shipments, setShipments] = useState([]);
  const [shipmentsTotal, setShipmentsTotal] = useState(0);
  const [scheduleAt, setScheduleAt] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendSummary, setSendSummary] = useState(null);
  const [retryingFailed, setRetryingFailed] = useState(false);
  const [retrySummary, setRetrySummary] = useState(null);
  const [cancellingCampaign, setCancellingCampaign] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    action: '',
    title: '',
    description: '',
    confirmLabel: 'Confirmar',
    tone: 'warning',
  });

  const [panelMode, setPanelMode] = useState('view');
  const [formValues, setFormValues] = useState(FORM_DEFAULTS);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const canEditSelectedDraft = useMemo(
    () => String(selectedCampaign?.estado || '').trim().toLowerCase() === 'borrador',
    [selectedCampaign]
  );
  const canSendScheduledCampaign = useMemo(
    () => String(selectedCampaign?.estado || '').trim().toLowerCase() === 'programada' && Number(selectedCampaign?.total_pendientes || 0) > 0,
    [selectedCampaign]
  );
  const canRetryFailedShipments = useMemo(
    () => String(selectedCampaign?.estado || '').trim().toLowerCase() === 'programada' && Number(selectedCampaign?.total_fallidos || 0) > 0,
    [selectedCampaign]
  );
  const canCancelCampaign = useMemo(() => {
    const state = String(selectedCampaign?.estado || '').trim().toLowerCase();
    return ['borrador', 'programada', 'procesando', 'error'].includes(state);
  }, [selectedCampaign]);
  const operationalState = useMemo(() => getOperationalState(selectedCampaign), [selectedCampaign]);
  const visibleRangeStart = useMemo(
    () => (campaignsTotal === 0 ? 0 : campaignsOffset + 1),
    [campaignsOffset, campaignsTotal]
  );
  const visibleRangeEnd = useMemo(
    () => Math.min(campaignsOffset + campaigns.length, campaignsTotal),
    [campaignsOffset, campaigns.length, campaignsTotal]
  );
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (normalizeRequiredText(searchQuery)) count += 1;
    if (filterOperationalState) count += 1;
    if (showCancelledCampaigns) count += 1;
    return count;
  }, [searchQuery, filterOperationalState, showCancelledCampaigns]);
  const eligibleRecipientIds = useMemo(
    () => eligibleRecipients.map((row) => String(row.id_cliente)),
    [eligibleRecipients]
  );
  const selectedEligibleIdSet = useMemo(
    () => new Set(selectedEligibleIds.map((id) => String(id))),
    [selectedEligibleIds]
  );
  const manuallyExcludedIdSet = useMemo(
    () => new Set(manuallyExcludedIds.map((id) => String(id))),
    [manuallyExcludedIds]
  );
  const effectiveEligibleRecipients = useMemo(
    () => eligibleRecipients.filter((row) => !manuallyExcludedIdSet.has(String(row.id_cliente))),
    [eligibleRecipients, manuallyExcludedIdSet]
  );
  const selectedVisibleEligibleCount = useMemo(
    () => effectiveEligibleRecipients.filter((row) => selectedEligibleIdSet.has(String(row.id_cliente))).length,
    [effectiveEligibleRecipients, selectedEligibleIdSet]
  );
  const derivedExcludedByManual = useMemo(() => manuallyExcludedIds.length, [manuallyExcludedIds]);
  const persistedExclusionsSnapshot = useMemo(() => {
    const rawSnapshot = selectedCampaign?.exclusiones_snapshot;
    if (!rawSnapshot || typeof rawSnapshot !== 'object') {
      return { generatedAt: null, byReason: [], rows: [] };
    }

    const byReason = Array.isArray(rawSnapshot?.resumen_por_motivo)
      ? rawSnapshot.resumen_por_motivo
      : [];
    const rows = Array.isArray(rawSnapshot?.excluidos)
      ? rawSnapshot.excluidos
      : [];

    return {
      generatedAt: rawSnapshot?.generado_at || null,
      byReason,
      rows,
    };
  }, [selectedCampaign]);

  const fetchCampaigns = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setListError('');
    }
    try {
      const response = await listAdminConfigComunicacionCampanias({
        q: searchQuery || undefined,
        estado_operativo: filterOperationalState || undefined,
        incluir_canceladas: showCancelledCampaigns,
        sort: sortKey,
        limit: CAMPAIGNS_PAGE_SIZE,
        offset: campaignsOffset,
      });
      const payload = response?.data || response;
      const rows = Array.isArray(payload?.campanias) ? payload.campanias : [];
      setCampaigns(rows);
      setCampaignsTotal(Number(payload?.total ?? rows.length ?? 0));
      setCampaignsOffset(Number(payload?.offset ?? campaignsOffset ?? 0));
    } catch (error) {
      const message = extractMessage(error);
      setListError(message);
      if (silent) notifications.error(message, { dedupeKey: 'comm-campaigns-list-silent-error' });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [notifications, searchQuery, filterOperationalState, showCancelledCampaigns, sortKey, campaignsOffset]);

  const fetchEligibilityPreview = useCallback(async (idCampaign) => {
    const id = String(idCampaign || '').trim();
    if (!id) return;

    setEligibilityLoading(true);
    setEligibilityError('');

    try {
      const [summaryResponse, eligibleResponse, excludedResponse] = await Promise.all([
        getAdminConfigComunicacionElegibilidad(id, { limit_elegibles: 10, limit_excluidos: 10 }),
        listAdminConfigComunicacionElegibilidadDestinatarios(id, { estado: 'elegible', limit: 20, offset: 0 }),
        listAdminConfigComunicacionElegibilidadDestinatarios(id, { estado: 'excluido', limit: 20, offset: 0 }),
      ]);

      const summaryPayload = summaryResponse?.data || summaryResponse;
      const eligiblePayload = eligibleResponse?.data || eligibleResponse;
      const excludedPayload = excludedResponse?.data || excludedResponse;

      setEligibilitySummary(summaryPayload || null);
      setEligibleRecipients(Array.isArray(eligiblePayload?.destinatarios) ? eligiblePayload.destinatarios : []);
      setExcludedRecipients(Array.isArray(excludedPayload?.destinatarios) ? excludedPayload.destinatarios : []);
    } catch (error) {
      const message = extractMessage(error);
      setEligibilityError(message);
      setEligibilitySummary(null);
      setEligibleRecipients([]);
      setExcludedRecipients([]);
    } finally {
      setEligibilityLoading(false);
    }
  }, []);

  const fetchCampaignShipments = useCallback(async (idCampaign) => {
    const id = String(idCampaign || '').trim();
    if (!id) return;

    setShipmentsLoading(true);
    setShipmentsError('');
    try {
      const response = await listAdminConfigComunicacionCampaniaEnvios(id, { limit: 50, offset: 0 });
      const payload = response?.data || response;
      setShipments(Array.isArray(payload?.envios) ? payload.envios : []);
      setShipmentsTotal(Number(payload?.total || 0));
    } catch (error) {
      const message = extractMessage(error);
      setShipmentsError(message);
      setShipments([]);
      setShipmentsTotal(0);
    } finally {
      setShipmentsLoading(false);
    }
  }, []);

  const fetchCampaignDetail = useCallback(async (idCampaign, { startEdit = false } = {}) => {
    const id = String(idCampaign || '').trim();
    if (!id) return;

    setSelectedCampaignId(id);
    setDetailLoading(true);
    setDetailError('');

    try {
      const response = await getAdminConfigComunicacionCampania(id);
      const payload = response?.data || response;
      const campaign = payload?.campania || null;
      setSelectedCampaign(campaign);
      setSelectedEligibleIds([]);
      setManuallyExcludedIds([]);
      setSendSummary(null);
      setRetrySummary(null);
      if (campaign?.id_campania) {
        await Promise.all([
          fetchEligibilityPreview(campaign.id_campania),
          fetchCampaignShipments(campaign.id_campania),
        ]);
        setScheduleAt(toDatetimeLocalValue(campaign.programada_para));
      }

      if (campaign && startEdit) {
        if (String(campaign.estado || '').trim().toLowerCase() !== 'borrador') {
          setPanelMode('view');
          notifications.warning('Solo se puede editar cuando la campaña está en borrador.', { dedupeKey: 'comm-campaign-edit-not-draft' });
        } else {
          setFormValues(mapCampaignToForm(campaign));
          setFormError('');
          setPanelMode('edit');
        }
      } else if (panelMode === 'view') {
        setPanelMode('view');
      }
    } catch (error) {
      const message = extractMessage(error);
      setDetailError(message);
      setEligibilitySummary(null);
      setEligibleRecipients([]);
      setExcludedRecipients([]);
      setShipments([]);
      setShipmentsTotal(0);
      notifications.error(message, { dedupeKey: 'comm-campaign-detail-error' });
    } finally {
      setDetailLoading(false);
    }
  }, [fetchCampaignShipments, fetchEligibilityPreview, notifications, panelMode]);

  useEffect(() => {
    void fetchCampaigns();
  }, [fetchCampaigns]);

  useEffect(() => {
    if (panelMode !== 'view') return;
    if (campaigns.length === 0) {
      setSelectedCampaignId('');
      setSelectedCampaign(null);
      setEligibilitySummary(null);
      setEligibleRecipients([]);
      setExcludedRecipients([]);
      setShipments([]);
      setShipmentsTotal(0);
      setScheduleAt('');
      return;
    }

    const hasCurrent = campaigns.some((row) => String(row?.id_campania || '') === String(selectedCampaignId || ''));
    if (!hasCurrent) {
      void fetchCampaignDetail(campaigns[0]?.id_campania || '');
    }
  }, [campaigns, fetchCampaignDetail, panelMode, selectedCampaignId]);

  useEffect(() => {
    const allowedIds = new Set(eligibleRecipientIds);
    setSelectedEligibleIds((prev) => prev.filter((id) => allowedIds.has(String(id))));
    setManuallyExcludedIds((prev) => prev.filter((id) => allowedIds.has(String(id))));
  }, [eligibleRecipientIds]);

  useEffect(() => {
    if (panelMode !== 'create' && panelMode !== 'edit') return;
    if (typeof window === 'undefined') return;
    if (window.innerWidth >= 1280) return;
    editorPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [panelMode]);

  function openCreatePanel() {
    setPanelMode('create');
    setFormValues(FORM_DEFAULTS);
    setFormError('');
  }

  function closeEditorPanel() {
    setPanelMode('view');
    setFormValues(FORM_DEFAULTS);
    setFormError('');
  }

  function handleFormChange(field, value) {
    setFormValues((prev) => ({ ...prev, [field]: value }));
    setFormError('');
  }

  function handleToggleEligibleSelection(idCliente) {
    const id = String(idCliente || '').trim();
    if (!id || manuallyExcludedIdSet.has(id)) return;
    setSelectedEligibleIds((prev) => {
      const exists = prev.some((item) => String(item) === id);
      if (exists) return prev.filter((item) => String(item) !== id);
      return [...prev, id];
    });
  }

  function handleSelectAllEligibleVisible() {
    const allVisibleIds = effectiveEligibleRecipients.map((row) => String(row.id_cliente));
    const selectedCount = allVisibleIds.filter((id) => selectedEligibleIdSet.has(id)).length;
    if (selectedCount === allVisibleIds.length) {
      setSelectedEligibleIds((prev) => prev.filter((id) => !allVisibleIds.includes(String(id))));
      return;
    }
    setSelectedEligibleIds((prev) => Array.from(new Set([...prev.map((id) => String(id)), ...allVisibleIds])));
  }

  function handleExcludeSelectedEligible() {
    if (!selectedVisibleEligibleCount) return;
    const selectedIds = selectedEligibleIds.map((id) => String(id));
    setManuallyExcludedIds((prev) => Array.from(new Set([...prev.map((id) => String(id)), ...selectedIds])));
    setSelectedEligibleIds([]);
    notifications.success(`Se excluyeron ${selectedIds.length} destinatarios elegibles de esta programacion.`, {
      dedupeKey: 'comm-campaign-manual-exclusions-updated',
    });
  }

  function handleRevertManualExclusion(idCliente) {
    const id = String(idCliente || '').trim();
    if (!id) return;
    setManuallyExcludedIds((prev) => prev.filter((item) => String(item) !== id));
  }

  async function handleSave() {
    const validationError = validateForm(formValues);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const payload = buildPayload(formValues);
    setSaving(true);
    setFormError('');

    try {
      if (panelMode === 'create') {
        const response = await createAdminConfigComunicacionCampania(payload);
        const data = response?.data || response;
        const created = data?.campania;
        notifications.success('Campaña borrador creada correctamente.', { dedupeKey: 'comm-campaign-create-ok' });
        await fetchCampaigns({ silent: true });
        closeEditorPanel();
        if (created?.id_campania) {
          await fetchCampaignDetail(created.id_campania);
        }
        return;
      }

      if (panelMode === 'edit' && selectedCampaign?.id_campania) {
        const response = await updateAdminConfigComunicacionCampania(selectedCampaign.id_campania, payload);
        const data = response?.data || response;
        const updated = data?.campania;
        notifications.success('Campaña actualizada correctamente.', { dedupeKey: 'comm-campaign-update-ok' });
        await fetchCampaigns({ silent: true });
        closeEditorPanel();
        if (updated?.id_campania) {
          await fetchCampaignDetail(updated.id_campania);
        }
      }
    } catch (error) {
      const message = extractMessage(error);
      setFormError(message);
      notifications.error(message, { dedupeKey: 'comm-campaign-save-error' });
      if (panelMode === 'edit' && selectedCampaign?.id_campania) {
        await fetchCampaignDetail(selectedCampaign.id_campania);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleScheduleCampaign() {
    if (!selectedCampaign?.id_campania) return;
    if (scheduleAt) {
      const scheduledDate = new Date(scheduleAt);
      if (Number.isNaN(scheduledDate.getTime())) {
        notifications.warning('La fecha de programacion no es valida.', { dedupeKey: 'comm-campaign-schedule-invalid-date' });
        return;
      }
      if (scheduledDate.getTime() < Date.now()) {
        notifications.warning('No se puede programar una campaña en fecha u hora pasada.', {
          dedupeKey: 'comm-campaign-schedule-past-date',
        });
        return;
      }
    }

    setScheduling(true);
    try {
      const payload = {
        programada_para: scheduleAt ? new Date(scheduleAt).toISOString() : null,
        id_clientes_excluidos: manuallyExcludedIds,
      };
      const response = await programAdminConfigComunicacionCampania(selectedCampaign.id_campania, payload);
      const data = response?.data || response;
      const totalProgramados = Number(data?.total_destinatarios_programados || 0);
      notifications.success(
        data?.ya_programada
          ? `La campaña ya estaba programada. Destinatarios programados: ${totalProgramados}.`
          : `Campaña programada. Destinatarios programados: ${totalProgramados}.`,
        { dedupeKey: 'comm-campaign-schedule-ok' }
      );
      await fetchCampaignDetail(selectedCampaign.id_campania);
      setPanelMode('view');
    } catch (error) {
      notifications.error(extractMessage(error), { dedupeKey: 'comm-campaign-schedule-error' });
    } finally {
      setScheduling(false);
    }
  }

  async function executeSendCampaign() {
    if (!selectedCampaign?.id_campania) return;
    setSending(true);
    try {
      const response = await sendAdminConfigComunicacionCampania(selectedCampaign.id_campania);
      const data = response?.data || response;
      setSendSummary(data || null);
      notifications.success(
        `Envio ejecutado. Exitosos: ${Number(data?.total_enviados_exitosos || 0)}. Fallidos: ${Number(data?.total_fallidos || 0)}.`,
        { dedupeKey: 'comm-campaign-send-ok' }
      );
      await fetchCampaignDetail(selectedCampaign.id_campania);
      setPanelMode('view');
    } catch (error) {
      notifications.error(extractMessage(error), { dedupeKey: 'comm-campaign-send-error' });
    } finally {
      setSending(false);
    }
  }
  async function executeRetryFailedShipments() {
    if (!selectedCampaign?.id_campania) return;
    setRetryingFailed(true);
    try {
      const response = await retryFailedAdminConfigComunicacionCampania(selectedCampaign.id_campania);
      const data = response?.data || response;
      setRetrySummary(data || null);
      notifications.success(
        `Reintento ejecutado. Recuperados: ${Number(data?.total_recuperados_exitosos || 0)}. Siguen fallando: ${Number(data?.total_siguen_fallando || 0)}.`,
        { dedupeKey: 'comm-campaign-retry-ok' }
      );
      await fetchCampaignDetail(selectedCampaign.id_campania);
      setPanelMode('view');
    } catch (error) {
      notifications.error(extractMessage(error), { dedupeKey: 'comm-campaign-retry-error' });
    } finally {
      setRetryingFailed(false);
    }
  }
  async function executeCancelCampaign() {
    if (!selectedCampaign?.id_campania) return;
    setCancellingCampaign(true);
    try {
      const response = await cancelAdminConfigComunicacionCampania(selectedCampaign.id_campania);
      const data = response?.data || response;
      notifications.success(data?.mensaje || 'Campaña cancelada correctamente.', { dedupeKey: 'comm-campaign-cancel-ok' });
      await fetchCampaignDetail(selectedCampaign.id_campania);
      setPanelMode('view');
    } catch (error) {
      notifications.error(extractMessage(error), { dedupeKey: 'comm-campaign-cancel-error' });
    } finally {
      setCancellingCampaign(false);
    }
  }
  function openConfirmDialog(action) {
    if (action === 'send') {
      setConfirmDialog({
        open: true,
        action,
        title: 'Enviar campaña',
        description: 'Esta accion enviara correos reales a los destinatarios pendientes. Deseas continuar?',
        confirmLabel: 'Enviar',
        tone: 'warning',
      });
      return;
    }
    if (action === 'retry') {
      setConfirmDialog({
        open: true,
        action,
        title: 'Reintentar fallidos',
        description: 'Esta accion reintentara solo los envios fallidos existentes. Deseas continuar?',
        confirmLabel: 'Reintentar',
        tone: 'warning',
      });
      return;
    }
    if (action === 'cancel') {
      setConfirmDialog({
        open: true,
        action,
        title: 'Cancelar campaña',
        description: 'Esta accion cancelara la campaña y bloqueara envios y reintentos posteriores. Deseas continuar?',
        confirmLabel: 'Cancelar campaña',
        tone: 'danger',
      });
    }
  }
  function closeConfirmDialog() {
    if (sending || retryingFailed || cancellingCampaign) return;
    setConfirmDialog((prev) => ({ ...prev, open: false, action: '' }));
  }
  async function handleConfirmDialogAction() {
    if (confirmDialog.action === 'send') {
      await executeSendCampaign();
    } else if (confirmDialog.action === 'retry') {
      await executeRetryFailedShipments();
    } else if (confirmDialog.action === 'cancel') {
      await executeCancelCampaign();
    }
    setConfirmDialog((prev) => ({ ...prev, open: false, action: '' }));
  }
  function handleSendCampaign() {
    if (!selectedCampaign?.id_campania || !canSendScheduledCampaign || sending) return;
    openConfirmDialog('send');
  }
  function handleRetryFailedShipments() {
    if (!selectedCampaign?.id_campania || !canRetryFailedShipments || retryingFailed) return;
    openConfirmDialog('retry');
  }
  function handleCancelCampaign() {
    if (!selectedCampaign?.id_campania || !canCancelCampaign || cancellingCampaign) return;
    openConfirmDialog('cancel');
  }
  return (
    <div className="space-y-4 px-2 pb-4 sm:px-4 sm:pb-6">
      <header className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] px-4 py-4 sm:px-5 sm:py-5">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--mf-accent)]">Configuracion - Correos informativos</p>
          <h1 className="mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Correos informativos</h1>
          <p className="text-sm text-[var(--mf-text-2)]">Gestion operativa de correos informativos por correo.</p>
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <article ref={editorPanelRef} className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--mf-accent)]">Campañas</h2>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-1 px-3"
                onClick={() => setShowFilters((prev) => !prev)}
                aria-expanded={showFilters}
              >
                <SlidersHorizontal size={14} />
                {activeFiltersCount > 0 ? `Filtros (${activeFiltersCount})` : 'Filtros'}
              </Button>
              <Button type="button" className="gap-2" onClick={openCreatePanel}>
                <Plus size={14} />
                Nueva
              </Button>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <Input
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setCampaignsOffset(0);
              }}
              placeholder="Buscar nombre o asunto"
            />
            {showFilters ? (
              <div className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-2.5 space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <select
                    className="mf-select"
                    value={filterOperationalState}
                    onChange={(event) => {
                      const nextState = event.target.value;
                      setFilterOperationalState(nextState);
                      if (nextState === 'cancelada') {
                        setShowCancelledCampaigns(true);
                      }
                      setCampaignsOffset(0);
                    }}
                  >
                    <option value="">Estado: todos</option>
                    <option value="borrador">Borrador</option>
                    <option value="programada">Programada</option>
                    <option value="finalizada">Finalizada</option>
                    <option value="cancelada">Cancelada</option>
                  </select>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <select
                    className="mf-select"
                    value={sortKey}
                    onChange={(event) => {
                      setSortKey(event.target.value);
                      setCampaignsOffset(0);
                    }}
                  >
                    <option value="updated_desc">Mas recientes</option>
                    <option value="updated_asc">Menos recientes</option>
                    <option value="created_desc">Nuevas primero</option>
                    <option value="created_asc">Antiguas primero</option>
                    <option value="programada_desc">Programacion reciente</option>
                    <option value="programada_asc">Programacion antigua</option>
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setSearchQuery('');
                      setFilterOperationalState('');
                      setShowCancelledCampaigns(false);
                      setSortKey('updated_desc');
                      setCampaignsOffset(0);
                    }}
                  >
                    Limpiar
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          {loading ? <LoadingSpinner className="py-10" size={24} /> : null}
          {!loading && listError ? <ErrorBanner message={listError} onRetry={() => void fetchCampaigns()} /> : null}

          {!loading && !listError && campaigns.length === 0 ? (
            <EmptyState
              icon={Mail}
              title="Sin campañas registradas"
              description="Crea la primera campaña para iniciar el flujo de borradores."
              action={
                <Button type="button" className="gap-2" onClick={openCreatePanel}>
                  <Plus size={14} />
                  Crear campaña
                </Button>
              }
            />
          ) : null}

          {!loading && !listError && campaigns.length > 0 ? (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-[var(--mf-text-2)]">
                  Mostrando {visibleRangeStart}-{visibleRangeEnd} de {campaignsTotal} campañas
                </p>
                <label className="inline-flex items-center gap-2 text-xs text-[var(--mf-text-2)]">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    checked={showCancelledCampaigns}
                    onChange={(event) => {
                      const checked = Boolean(event.target.checked);
                      setShowCancelledCampaigns(checked);
                      if (!checked && filterOperationalState === 'cancelada') {
                        setFilterOperationalState('');
                      }
                      setCampaignsOffset(0);
                    }}
                  />
                  Ver canceladas
                </label>
              </div>
              <CardsCarousel
                items={campaigns}
                pageSizeByViewport={{ mobile: 2, tablet: 2, desktop: 2 }}
                gridClassName="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1"
                compactControls
                showHeaderTag={false}
                getItemKey={(campaign) => campaign.id_campania}
                renderItem={(campaign) => {
                  const isActive = String(campaign?.id_campania || '') === String(selectedCampaignId || '');
                  const rowOperationalState = campaign?.estado_operativo || getOperationalState(campaign);
                  const relevantDate = campaign.programada_para || campaign.updated_at || campaign.created_at;
                  const attentionLabel = getCampaignAttentionLabel(campaign);
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        setPanelMode('view');
                        void fetchCampaignDetail(campaign.id_campania);
                      }}
                      className={`w-full rounded-xl border p-3 text-left transition-colors ${
                        isActive
                          ? 'border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)]'
                          : 'border-[var(--mf-nav-border)] bg-transparent hover:bg-[var(--mf-btn-bg)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--mf-text)]">{campaign.nombre_interno}</p>
                          <p className="truncate text-xs text-[var(--mf-text-2)]">{campaign.asunto || '-'}</p>
                        </div>
                        <CampaignStateBadge estado={rowOperationalState} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--mf-text-2)]">
                        <CampaignTypeBadge tipo={campaign.tipo_campania} />
                        <span>Fecha: {formatDateTime(relevantDate)}</span>
                        {attentionLabel ? (
                          <span className="rounded-full border border-[var(--mf-nav-border)] px-2 py-0.5 text-amber-300">
                            {attentionLabel}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <div className="rounded-lg border border-[var(--mf-nav-border)] px-2 py-1.5">
                          <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--mf-text-2)]">Pend.</p>
                          <p className="text-sm text-[var(--mf-text)]">{Number(campaign.total_pendientes || 0)}</p>
                        </div>
                        <div className="rounded-lg border border-[var(--mf-nav-border)] px-2 py-1.5">
                          <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--mf-text-2)]">Env.</p>
                          <p className="text-sm text-[var(--mf-text)]">{Number(campaign.total_enviados || 0)}</p>
                        </div>
                        <div className="rounded-lg border border-[var(--mf-nav-border)] px-2 py-1.5">
                          <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--mf-text-2)]">Fall.</p>
                          <p className="text-sm text-[var(--mf-text)]">{Number(campaign.total_fallidos || 0)}</p>
                        </div>
                      </div>
                    </button>
                  );
                }}
              />
            </div>
          ) : null}
        </article>

        <article className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] p-4 sm:p-5">
          {panelMode === 'create' || panelMode === 'edit' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-[var(--mf-accent)]">
                  <ClipboardList size={15} />
                  {panelMode === 'create' ? 'Nueva campaña borrador' : 'Editar campaña borrador'}
                </h2>
                <Button type="button" variant="outline" onClick={closeEditorPanel} disabled={saving}>
                  Cancelar
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="mf-label">Tipo de campaña</Label>
                  <Input value="informativa" disabled />
                </div>
                <div className="space-y-1.5">
                  <Label className="mf-label">Canal</Label>
                  <Input value="email" disabled />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="mf-label">Nombre interno *</Label>
                  <Input
                    value={formValues.nombre_interno}
                    onChange={(event) => handleFormChange('nombre_interno', event.target.value)}
                    maxLength={160}
                    disabled={saving}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="mf-label">Asunto *</Label>
                  <Input
                    value={formValues.asunto}
                    onChange={(event) => handleFormChange('asunto', event.target.value)}
                    maxLength={180}
                    disabled={saving}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="mf-label">Contenido texto *</Label>
                  <textarea
                    className="mf-input min-h-[180px] resize-y py-2"
                    value={formValues.contenido_texto}
                    onChange={(event) => handleFormChange('contenido_texto', event.target.value)}
                    maxLength={20000}
                    disabled={saving}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="mf-label">Observaciones</Label>
                  <textarea
                    className="mf-input min-h-[100px] resize-y py-2"
                    value={formValues.observaciones}
                    onChange={(event) => handleFormChange('observaciones', event.target.value)}
                    maxLength={2000}
                    disabled={saving}
                  />
                </div>
              </div>

              {formError ? <ErrorBanner message={formError} /> : null}

              <div className="flex justify-end">
                <Button type="button" className="gap-2" onClick={() => void handleSave()} disabled={saving}>
                  <Save size={14} />
                  {saving ? 'Guardando...' : panelMode === 'create' ? 'Crear borrador' : 'Guardar cambios'}
                </Button>
              </div>
            </div>
          ) : null}

          {panelMode === 'view' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--mf-accent)]">Detalle de campaña</h2>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => void fetchCampaignDetail(selectedCampaign?.id_campania, { startEdit: true })}
                  disabled={!selectedCampaign || !canEditSelectedDraft || detailLoading}
                >
                  <Pencil size={14} />
                  Editar borrador
                </Button>
              </div>

              {detailLoading ? <LoadingSpinner className="py-10" size={24} /> : null}
              {!detailLoading && detailError ? <ErrorBanner message={detailError} onRetry={() => void fetchCampaignDetail(selectedCampaignId)} /> : null}

              {!detailLoading && !detailError && !selectedCampaign ? (
                <EmptyState
                  icon={ClipboardList}
                  title="Sin campaña seleccionada"
                  description="Selecciona una campaña del listado o crea una nueva."
                />
              ) : null}

              {!detailLoading && !detailError && selectedCampaign ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--mf-text)]">{selectedCampaign.nombre_interno}</p>
                      <CampaignStateBadge estado={operationalState} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <CampaignTypeBadge tipo={selectedCampaign.tipo_campania} />
                      <span className="text-xs text-[var(--mf-text-2)]">Canal: {selectedCampaign.canal || 'email'}</span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--mf-text-2)]">Programada para: {selectedCampaign.programada_para ? formatDateTime(selectedCampaign.programada_para) : 'No definida'}</p>
                    <p className="mt-1 text-sm text-[var(--mf-text-2)]">Cierre operativo: {selectedCampaign.finalizada_at ? formatDateTime(selectedCampaign.finalizada_at) : 'Aun abierto'}</p>
                  </div>

                  <details className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3" open>
                    <summary className="cursor-pointer text-xs uppercase tracking-[0.14em] text-[var(--mf-accent)]">Preparacion de envio</summary>
                    <p className="mt-1 text-xs text-[var(--mf-text-2)]">Programada significa preparada. En este paso no se envia correo real.</p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                      <div className="flex-1 space-y-1">
                        <Label className="mf-label">Programar para (opcional)</Label>
                        <Input
                          type="datetime-local"
                          value={scheduleAt}
                          onChange={(event) => setScheduleAt(event.target.value)}
                          disabled={!canEditSelectedDraft || scheduling}
                        />
                      </div>
                      <Button
                        type="button"
                        className="w-full gap-2 sm:w-auto"
                        onClick={() => void handleScheduleCampaign()}
                        disabled={!canEditSelectedDraft || scheduling || detailLoading}
                      >
                        <CalendarClock size={14} />
                        {scheduling ? 'Programando...' : 'Programar campaña'}
                      </Button>
                    </div>
                    {!canEditSelectedDraft ? (
                      <p className="mt-2 text-xs text-[var(--mf-text-2)]">La campaña ya no esta en borrador; la programacion y edicion quedan bloqueadas.</p>
                    ) : null}
                  </details>

                  <details className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
                    <summary className="cursor-pointer text-xs uppercase tracking-[0.14em] text-[var(--mf-accent)]">Ejecucion manual real</summary>
                    <p className="mt-1 text-xs text-[var(--mf-text-2)]">Esta accion si envia correos reales usando los registros pendientes ya generados.</p>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        className="h-9 gap-1.5 px-3 text-xs"
                        onClick={() => void handleSendCampaign()}
                        disabled={!canSendScheduledCampaign || sending || detailLoading}
                      >
                        <Mail size={14} />
                        {sending ? 'Enviando...' : 'Enviar campaña'}
                      </Button>
                      {!canSendScheduledCampaign ? (
                        <p className="text-xs text-[var(--mf-text-2)]">Disponible solo para campañas programadas con pendientes.</p>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 gap-1.5 px-3 text-xs"
                        onClick={() => void handleRetryFailedShipments()}
                        disabled={!canRetryFailedShipments || retryingFailed || detailLoading}
                      >
                        <RefreshCw size={14} className={retryingFailed ? 'animate-spin' : ''} />
                        {retryingFailed ? 'Reintentando...' : 'Reintentar fallidos'}
                      </Button>
                      {!canRetryFailedShipments ? (
                        <p className="text-xs text-[var(--mf-text-2)]">No hay fallidos para reintentar.</p>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 gap-1.5 px-3 text-xs"
                        onClick={() => void handleCancelCampaign()}
                        disabled={!canCancelCampaign || cancellingCampaign || detailLoading}
                      >
                        {cancellingCampaign ? 'Cancelando...' : 'Cancelar campaña'}
                      </Button>
                      {!canCancelCampaign ? (
                        <p className="text-xs text-[var(--mf-text-2)]">La campaña ya no admite cancelacion operativa.</p>
                      ) : null}
                    </div>
                    {operationalState === 'cancelada' ? (
                      <p className="mt-2 text-xs text-amber-300">Campaña cancelada: envio y reintento quedan bloqueados.</p>
                    ) : null}
                  </details>

                  {sendSummary ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
                        <p className="text-xs uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Resultado ultimo envio</p>
                        <p className="mt-1 text-sm text-[var(--mf-text)]">Estado campaña: {formatOperationalStateLabel(sendSummary.estado_campania_resultante)}</p>
                        <p className="mt-1 text-sm text-[var(--mf-text)]">Intentados: {Number(sendSummary.total_intentados || 0)}</p>
                        <p className="mt-1 text-sm text-[var(--mf-text)]">Exitosos: {Number(sendSummary.total_enviados_exitosos || 0)}</p>
                        <p className="mt-1 text-sm text-[var(--mf-text)]">Fallidos: {Number(sendSummary.total_fallidos || 0)}</p>
                        <p className="mt-1 text-sm text-[var(--mf-text)]">Pendientes restantes: {Number(sendSummary.total_pendientes_restantes || 0)}</p>
                      </div>
                    </div>
                  ) : null}

                  {retrySummary ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
                        <p className="text-xs uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Resultado ultimo reintento</p>
                        <p className="mt-1 text-sm text-[var(--mf-text)]">Estado campaña: {formatOperationalStateLabel(retrySummary.estado_campania_resultante)}</p>
                        <p className="mt-1 text-sm text-[var(--mf-text)]">Intentados: {Number(retrySummary.total_intentados || 0)}</p>
                        <p className="mt-1 text-sm text-[var(--mf-text)]">Recuperados: {Number(retrySummary.total_recuperados_exitosos || 0)}</p>
                        <p className="mt-1 text-sm text-[var(--mf-text)]">Siguen fallando: {Number(retrySummary.total_siguen_fallando || 0)}</p>
                        <p className="mt-1 text-sm text-[var(--mf-text)]">Fallidos restantes: {Number(retrySummary.total_fallidos_restantes || 0)}</p>
                      </div>
                    </div>
                  ) : null}

                  <details className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
                    <summary className="cursor-pointer text-xs uppercase tracking-[0.14em] text-[var(--mf-accent)]">Elegibilidad y exclusiones operativas</summary>
                    <div className="mt-2 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs uppercase tracking-[0.14em] text-[var(--mf-accent)]">Control operativo de audiencia</p>
                        <p className="text-xs text-[var(--mf-text-2)]">Puedes excluir elegibles manualmente para esta programacion, sin alterar reglas base.</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2"
                        onClick={() => void fetchEligibilityPreview(selectedCampaign.id_campania)}
                        disabled={eligibilityLoading}
                      >
                        <RefreshCw size={13} className={eligibilityLoading ? 'animate-spin' : ''} />
                        Actualizar
                      </Button>
                    </div>

                    {eligibilityLoading ? <LoadingSpinner className="py-8" size={20} /> : null}
                    {!eligibilityLoading && eligibilityError ? (
                      <ErrorBanner message={eligibilityError} onRetry={() => void fetchEligibilityPreview(selectedCampaign.id_campania)} />
                    ) : null}

                    {!eligibilityLoading && !eligibilityError && eligibilitySummary ? (
                      <>
                        <div className="grid gap-2 sm:grid-cols-4">
                          <div className="rounded-lg border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)] p-2.5">
                            <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--mf-text-2)]">Evaluados</p>
                            <p className="mt-1 text-sm font-semibold text-[var(--mf-text)]">{Number(eligibilitySummary?.resumen?.total_clientes_evaluados || 0)}</p>
                          </div>
                          <div className="rounded-lg border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)] p-2.5">
                            <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--mf-text-2)]">Elegibles base</p>
                            <p className="mt-1 text-sm font-semibold text-emerald-300">{Number(eligibilitySummary?.resumen?.total_elegibles || 0)}</p>
                          </div>
                          <div className="rounded-lg border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)] p-2.5">
                            <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--mf-text-2)]">Excluidos</p>
                            <p className="mt-1 text-sm font-semibold text-amber-300">{Number(eligibilitySummary?.resumen?.total_excluidos || 0) + derivedExcludedByManual}</p>
                          </div>
                          <div className="rounded-lg border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)] p-2.5">
                            <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--mf-text-2)]">Tipo campaña</p>
                            <p className="mt-1 text-sm font-semibold text-[var(--mf-text)]">{formatCampaignTypeLabel(eligibilitySummary?.tipo_campania)}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 px-3 text-xs"
                            onClick={handleSelectAllEligibleVisible}
                            disabled={effectiveEligibleRecipients.length === 0}
                          >
                            {selectedVisibleEligibleCount === effectiveEligibleRecipients.length && effectiveEligibleRecipients.length > 0
                              ? 'Quitar seleccion'
                              : 'Seleccionar todo'}
                          </Button>
                          <Button
                            type="button"
                            className="h-8 px-3 text-xs"
                            onClick={handleExcludeSelectedEligible}
                            disabled={selectedVisibleEligibleCount === 0}
                          >
                            Excluir seleccionados
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 px-3 text-xs"
                            onClick={() => setManuallyExcludedIds([])}
                            disabled={manuallyExcludedIds.length === 0}
                          >
                            Limpiar exclusiones manuales
                          </Button>
                        </div>

                        <div className="grid gap-3 lg:grid-cols-2">
                          <div className="space-y-2 rounded-lg border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)] p-3">
                            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--mf-accent)]">
                              <UserCheck size={13} /> Destinatarios elegibles
                            </p>
                            <p className="text-xs text-[var(--mf-text-2)]">
                              Disponibles para programacion: {effectiveEligibleRecipients.length}
                            </p>
                            {eligibleRecipients.length === 0 ? (
                              <p className="text-sm text-[var(--mf-text-2)]">No hay clientes elegibles con las reglas actuales.</p>
                            ) : (
                              <div className="space-y-1.5">
                                {eligibleRecipients.map((row) => {
                                  const rowId = String(row.id_cliente);
                                  const isManuallyExcluded = manuallyExcludedIdSet.has(rowId);
                                  const isSelected = selectedEligibleIdSet.has(rowId);
                                  return (
                                    <label key={`${row.id_cliente}:${row.correo_destino || 'sin-correo'}`} className="flex items-start gap-2 rounded-md border border-[var(--mf-nav-border)] px-2.5 py-2">
                                      <input
                                        type="checkbox"
                                        className="mt-1 h-3.5 w-3.5"
                                        checked={isSelected}
                                        disabled={isManuallyExcluded}
                                        onChange={() => handleToggleEligibleSelection(row.id_cliente)}
                                      />
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm text-[var(--mf-text)]">{row.nombre_cliente || 'Cliente'}</p>
                                        <p className="truncate text-xs text-[var(--mf-text-2)]">{row.correo_destino || '-'}</p>
                                        {isManuallyExcluded ? (
                                          <p className="text-xs text-amber-300">Excluido manualmente</p>
                                        ) : null}
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          <div className="space-y-2 rounded-lg border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)] p-3">
                            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--mf-accent)]"><UserX size={13} /> Exclusiones por motivo</p>
                            {Array.isArray(eligibilitySummary?.exclusiones_por_motivo) && eligibilitySummary.exclusiones_por_motivo.length > 0 ? (
                              <div className="space-y-1.5">
                                {eligibilitySummary.exclusiones_por_motivo.map((row) => (
                                  <div key={row.motivo} className="flex items-center justify-between rounded-md border border-[var(--mf-nav-border)] px-2.5 py-2">
                                    <p className="text-sm text-[var(--mf-text)]">{formatReasonLabel(row.motivo)}</p>
                                    <p className="text-xs font-semibold text-[var(--mf-text-2)]">{Number(row.total || 0)}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-[var(--mf-text-2)]">No hay exclusiones detectadas en este calculo.</p>
                            )}

                            {excludedRecipients.length > 0 ? (
                              <div className="space-y-1.5 pt-2">
                                <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--mf-text-2)]">Muestra de excluidos</p>
                                {excludedRecipients.slice(0, 8).map((row) => (
                                  <div key={`${row.id_cliente}:${row.motivo_exclusion || 'sin-motivo'}`} className="rounded-md border border-[var(--mf-nav-border)] px-2.5 py-2">
                                    <p className="text-sm text-[var(--mf-text)]">{row.nombre_cliente || 'Cliente'}</p>
                                    <p className="text-xs text-[var(--mf-text-2)]">{formatReasonLabel(row.motivo_exclusion)}</p>
                                  </div>
                                ))}
                              </div>
                            ) : null}

                            {manuallyExcludedIds.length > 0 ? (
                              <div className="space-y-1.5 pt-2">
                                <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--mf-text-2)]">Exclusiones manuales</p>
                                {eligibleRecipients
                                  .filter((row) => manuallyExcludedIdSet.has(String(row.id_cliente)))
                                  .map((row) => (
                                    <div key={`manual-${row.id_cliente}`} className="flex items-center justify-between rounded-md border border-[var(--mf-nav-border)] px-2.5 py-2">
                                      <div>
                                        <p className="text-sm text-[var(--mf-text)]">{row.nombre_cliente || 'Cliente'}</p>
                                        <p className="text-xs text-[var(--mf-text-2)]">{row.correo_destino || '-'}</p>
                                      </div>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="h-7 px-2 text-xs"
                                        onClick={() => handleRevertManualExclusion(row.id_cliente)}
                                      >
                                        Revertir
                                      </Button>
                                    </div>
                                  ))}
                              </div>
                            ) : null}

                            {persistedExclusionsSnapshot.rows.length > 0 ? (
                              <div className="space-y-1.5 pt-2">
                                <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--mf-text-2)]">
                                  Exclusiones persistidas
                                  {persistedExclusionsSnapshot.generatedAt ? ` · ${formatDateTime(persistedExclusionsSnapshot.generatedAt)}` : ''}
                                </p>
                                {persistedExclusionsSnapshot.byReason.map((row) => (
                                  <div key={`persisted-summary-${row.motivo}`} className="flex items-center justify-between rounded-md border border-[var(--mf-nav-border)] px-2.5 py-2">
                                    <p className="text-sm text-[var(--mf-text)]">{formatReasonLabel(row.motivo)}</p>
                                    <p className="text-xs font-semibold text-[var(--mf-text-2)]">{Number(row.total || 0)}</p>
                                  </div>
                                ))}
                                <div className="space-y-1.5">
                                  {persistedExclusionsSnapshot.rows.slice(0, 8).map((row, index) => (
                                    <div key={`persisted-row-${index}`} className="rounded-md border border-[var(--mf-nav-border)] px-2.5 py-2">
                                      <p className="text-sm text-[var(--mf-text)]">{row.nombre_cliente || 'Cliente sin nombre'}</p>
                                      <p className="text-xs text-[var(--mf-text-2)]">{row.correo_destino || '-'}</p>
                                      <p className="text-xs text-[var(--mf-text-2)]">{formatReasonLabel(row.motivo_exclusion)}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </>
                    ) : null}
                    </div>
                  </details>

                  <details className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
                    <summary className="cursor-pointer text-xs uppercase tracking-[0.14em] text-[var(--mf-accent)]">Envios y trazabilidad (bajo demanda)</summary>
                    <div className="mt-2 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs uppercase tracking-[0.14em] text-[var(--mf-accent)]">Envios programados</p>
                        <p className="text-xs text-[var(--mf-text-2)]">Snapshot real de destinatarios preparados para ejecucion futura.</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2"
                        onClick={() => void fetchCampaignShipments(selectedCampaign.id_campania)}
                        disabled={shipmentsLoading}
                      >
                        <RefreshCw size={13} className={shipmentsLoading ? 'animate-spin' : ''} />
                        Actualizar
                      </Button>
                    </div>

                    {shipmentsLoading ? <LoadingSpinner className="py-8" size={20} /> : null}
                    {!shipmentsLoading && shipmentsError ? (
                      <ErrorBanner message={shipmentsError} onRetry={() => void fetchCampaignShipments(selectedCampaign.id_campania)} />
                    ) : null}

                    {!shipmentsLoading && !shipmentsError ? (
                      <>
                        <p className="text-xs text-[var(--mf-text-2)]">Total envios programados: {shipmentsTotal}</p>
                        {shipments.length === 0 ? (
                          <p className="text-sm text-[var(--mf-text-2)]">Aun no hay envios generados para esta campaña.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {shipments.map((row) => (
                              <div key={row.id_envio} className="rounded-md border border-[var(--mf-nav-border)] px-2.5 py-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-sm text-[var(--mf-text)]">{row.nombre_cliente || 'Cliente'}</p>
                                  <span className="mf-badge mf-badge-muted">{formatShipmentStateLabel(row.estado_envio)}</span>
                                </div>
                                <p className="text-xs text-[var(--mf-text-2)]">{row.correo_destino || '-'}</p>
                                <p className="text-xs text-[var(--mf-text-2)]">Intentos: {Number(row.intentos || 0)}</p>
                                <p className="text-xs text-[var(--mf-text-2)]">Enviar en: {formatDateTime(row.enviar_en)}</p>
                                <p className="text-xs text-[var(--mf-text-2)]">Enviado en: {formatDateTime(row.enviado_at)}</p>
                                {row.ultimo_error ? <p className="text-xs text-amber-300">Error: {row.ultimo_error}</p> : null}
                                <p className="text-xs text-[var(--mf-text-2)]">Creado: {formatDateTime(row.created_at)}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : null}
                    </div>
                  </details>
                </div>
              ) : null}
            </div>
          ) : null}
        </article>
      </section>

      <ActionConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => {
          if (!open) closeConfirmDialog();
        }}
        tone={confirmDialog.tone}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmLabel={confirmDialog.confirmLabel}
        cancelLabel="Cancelar"
        loading={sending || retryingFailed || cancellingCampaign}
        onConfirm={handleConfirmDialogAction}
      />
    </div>
  );
}

