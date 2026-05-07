import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, CalendarDays, Eye, Gift, Loader2, Pencil, Plus, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import { listAdminSucursales } from '../lib/adminSucursalesApi.js';
import { createAdminConfigPromocion, getAdminConfigPromocion, listAdminConfigPromociones, updateAdminConfigPromocion } from '../lib/adminConfiguracionApi.js';
import { listAdminServicios } from '../lib/adminCatalogApi.js';
import { listAdminPaquetes } from '../lib/adminPackagesApi.js';
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
import ImageUploaderField from '../../../components/data/ImageUploaderField.jsx';

const FORM_DEFAULTS = {
  id_sucursal: '', titulo: '', subtitulo: '', parrafos_texto: '',
  imagen_principal_url: '',
  imagen_mobile_url: '',
  imagen_principal_asset_id: null,
  imagen_mobile_asset_id: null,
  visible_publico: false, destacada: false,
  orden_visual: '100',
  // JK: Ventana horaria opcional para vigencia diaria de promociones.
  vigencia_hora_desde: '', vigencia_hora_hasta: '',
  vigencia_desde: '', vigencia_hasta: '', estado: 'borrador',
  tipo_promocion: 'descuento_servicio',
  aplica_a: 'servicio',
  mecanica: 'porcentaje',
  id_servicio_objetivo: '',
  id_paquete_objetivo: '',
  valor_descuento: '',
  cantidad_requerida: '',
  cantidad_bonificada: '',
};

const FILTER_DEFAULTS = { estado: 'all', visibilidad: 'all', destacada: 'all', idSucursal: 'all' };
const PROMOTION_TYPE_OPTIONS = [
  { value: 'descuento_servicio', label: 'Descuento a servicio' },
  { value: 'descuento_paquete', label: 'Descuento a paquete' },
  { value: 'dos_por_uno_servicio', label: '2x1 servicio' },
];
const PROMOTION_MECHANIC_OPTIONS = [
  { value: 'porcentaje', label: 'Porcentaje' },
  { value: 'monto_fijo', label: 'Monto fijo' },
  { value: 'dos_por_uno', label: '2x1' },
];
const PROMOTION_TYPE_RULES = {
  descuento_servicio: { aplica_a: 'servicio', mecanicas: ['porcentaje', 'monto_fijo'], mecanica_default: 'porcentaje' },
  descuento_paquete: { aplica_a: 'paquete', mecanicas: ['porcentaje', 'monto_fijo'], mecanica_default: 'porcentaje' },
  dos_por_uno_servicio: { aplica_a: 'servicio', mecanicas: ['dos_por_uno'], mecanica_default: 'dos_por_uno' },
};

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
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/);
  if (!isoMatch) return '';
  const year = Number(isoMatch[1]);
  const month = Number(isoMatch[2]);
  const day = Number(isoMatch[3]);
  // JK: Validacion estricta de fecha para evitar desfases por timezone en conversiones.
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(utcDate.getTime())
    || utcDate.getUTCFullYear() !== year
    || utcDate.getUTCMonth() !== (month - 1)
    || utcDate.getUTCDate() !== day
  ) {
    return '';
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDateToDisplay(date) {
  // JK: Convierte YYYY-MM-DD a formato visual dd/mm/aaaa para consistencia en UI.
  const normalized = toDateInputValue(date);
  if (!normalized) return '';
  const [year, month, day] = normalized.split('-');
  return `${day}/${month}/${year}`;
}

function formatDateToInternal(display) {
  // JK: Convierte texto dd/mm/aaaa a YYYY-MM-DD para mantener contrato actual del formulario.
  if (display === undefined || display === null) return '';
  const raw = String(display).trim();
  if (!raw) return '';
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return '';
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(utcDate.getTime())
    || utcDate.getUTCFullYear() !== year
    || utcDate.getUTCMonth() !== (month - 1)
    || utcDate.getUTCDate() !== day
  ) {
    return '';
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeTimeInput(value) {
  // JK: Acepta HH:mm o HH:mm:ss y normaliza a HH:mm para estado/payload sin segundos.
  if (value === undefined || value === null || value === '') return '';
  const raw = String(value).trim();
  const match = raw.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) return '';
  return `${match[1]}:${match[2]}`;
}

function toTimeInputValue(value) {
  // JK: Convierte hora API al formato interno HH:mm.
  return normalizeTimeInput(value);
}

function toTimeSeconds(value) {
  // JK: Permite comparar hora inicio/hora final cuando el rango cae en el mismo dia.
  const normalized = normalizeTimeInput(value);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(':').map((entry) => Number(entry));
  return (hours * 3600) + (minutes * 60);
}

function formatTimeDisplay(value) {
  // JK: Presenta HH:mm en formato amigable de 12 horas para UI.
  const normalized = normalizeTimeInput(value);
  if (!normalized) return '';
  const [rawHours, rawMinutes] = normalized.split(':').map((entry) => Number(entry));
  const period = rawHours >= 12 ? 'PM' : 'AM';
  const hour12 = ((rawHours + 11) % 12) + 1;
  return `${String(hour12).padStart(2, '0')}:${String(rawMinutes).padStart(2, '0')} ${period}`;
}

function parseSafeDateParts(value) {
  // JK: Extrae YYYY-MM-DD sin conversion por zona horaria para mostrar vigencias en detalle.
  if (value === undefined || value === null || value === '') return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || year < 1) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  return { year, month, day };
}

function formatDateDetailDisplay(value) {
  // JK: Muestra fechas de vigencia como dd/mm/aaaa usando texto seguro local.
  const parts = parseSafeDateParts(value);
  if (!parts) return 'Sin fecha definida';
  return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${String(parts.year).padStart(4, '0')}`;
}

function formatTimeDetailDisplay(value) {
  // JK: Muestra horas de vigencia en formato 12h y fallback claro cuando no existe hora.
  const formatted = formatTimeDisplay(value);
  return formatted || 'Sin hora definida';
}

function getTimeDraftParts(value) {
  // JK: Deriva hora/minuto/periodo para inicializar el picker desde valor existente.
  const normalized = normalizeTimeInput(value);
  if (!normalized) return { hour12: '09', minute: '00', period: 'AM' };
  const [rawHours, rawMinutes] = normalized.split(':').map((entry) => Number(entry));
  const period = rawHours >= 12 ? 'PM' : 'AM';
  const hour12 = ((rawHours + 11) % 12) + 1;
  return {
    hour12: String(hour12).padStart(2, '0'),
    minute: String(rawMinutes).padStart(2, '0'),
    period,
  };
}

function build24HourTime(hour12Value, minuteValue, periodValue) {
  // JK: Convierte la seleccion del picker (12h) al formato persistido HH:mm.
  const safeHour12 = Math.min(12, Math.max(1, Number(hour12Value || 12)));
  const safeMinute = Math.min(59, Math.max(0, Number(minuteValue || 0)));
  const safePeriod = String(periodValue || 'AM').toUpperCase() === 'PM' ? 'PM' : 'AM';
  let hours24 = safeHour12 % 12;
  if (safePeriod === 'PM') hours24 += 12;
  return `${String(hours24).padStart(2, '0')}:${String(safeMinute).padStart(2, '0')}`;
}

function normalizePromotionTypeValue(value, fallback = 'descuento_servicio') {
  const normalized = String(value || fallback).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(PROMOTION_TYPE_RULES, normalized) ? normalized : fallback;
}

function getPromotionTypeRule(value) {
  const safeType = normalizePromotionTypeValue(value);
  return PROMOTION_TYPE_RULES[safeType] || PROMOTION_TYPE_RULES.descuento_servicio;
}

function normalizePromotionTargetValue(value, fallback = 'servicio') {
  const normalized = String(value || fallback).trim().toLowerCase();
  return normalized === 'paquete' ? 'paquete' : 'servicio';
}

function normalizePromotionMechanicValue(value, fallback = 'porcentaje') {
  const normalized = String(value || fallback).trim().toLowerCase();
  return PROMOTION_MECHANIC_OPTIONS.some((item) => item.value === normalized) ? normalized : fallback;
}

function parsePositiveNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePositiveInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
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
  // JK: Horas opcionales con validacion estricta de formato.
  const vigenciaHoraDesdeRaw = String(values.vigencia_hora_desde || '').trim();
  const vigenciaHoraHastaRaw = String(values.vigencia_hora_hasta || '').trim();
  const vigenciaHoraDesde = normalizeTimeInput(vigenciaHoraDesdeRaw);
  const vigenciaHoraHasta = normalizeTimeInput(vigenciaHoraHastaRaw);
  const tipoPromocion = normalizePromotionTypeValue(values.tipo_promocion);
  const typeRule = getPromotionTypeRule(tipoPromocion);
  const aplicaA = normalizePromotionTargetValue(values.aplica_a || typeRule.aplica_a, typeRule.aplica_a);
  const mecanica = normalizePromotionMechanicValue(values.mecanica || typeRule.mecanica_default, typeRule.mecanica_default);
  const idServicioObjetivo = String(values.id_servicio_objetivo || '').trim();
  const idPaqueteObjetivo = String(values.id_paquete_objetivo || '').trim();
  const valorDescuento = parsePositiveNumber(values.valor_descuento);
  const cantidadRequerida = parsePositiveInteger(values.cantidad_requerida);
  const cantidadBonificada = parsePositiveInteger(values.cantidad_bonificada);

  if (!String(values.id_sucursal || '').trim()) return 'Debes seleccionar una sucursal valida.';
  if (!String(values.titulo || '').trim()) return 'El titulo es requerido.';
  const slug = normalizeSlug(values.titulo);
  if (!slug || slug.length < 3) return 'El titulo debe contener al menos 3 caracteres validos.';
  const parrafos = normalizeParagraphs(values.parrafos_texto);
  if (!parrafos.length) return 'La descripcion es requerida.';
  if (parrafos.length > 8) return 'Solo se permiten hasta 8 parrafos.';
  if (parrafos.some((line) => line.length > 420)) return 'Cada parrafo admite maximo 420 caracteres.';
  const ordenVisual = Number(values.orden_visual);
  if (!Number.isInteger(ordenVisual) || ordenVisual < 0) return 'orden_visual debe ser un entero mayor o igual a 0.';
  // JK: Valida fechas de vigencia como pareja para evitar rangos incompletos.
  if (vigenciaDesde && !vigenciaHasta) return 'Debe colocar la fecha final.';
  if (vigenciaHasta && !vigenciaDesde) return 'Debe colocar la fecha inicial.';
  if (vigenciaDesde && vigenciaHasta && vigenciaHasta < vigenciaDesde) return 'La fecha inicial no puede ser posterior a la fecha final.';
  // JK: Mensajes alineados al picker visual (sin segundos) para mejor UX.
  if (vigenciaHoraDesdeRaw && !vigenciaHoraDesde) return 'Hora inicio invalida. Usa formato HH:mm.';
  if (vigenciaHoraHastaRaw && !vigenciaHoraHasta) return 'Hora final invalida. Usa formato HH:mm.';
  // JK: Permite horas vacias, pero exige pareja completa cuando el usuario define una.
  if (vigenciaHoraDesde && !vigenciaHoraHasta) return 'Debe completar la hora final o dejar ambas horas vacias.';
  if (vigenciaHoraHasta && !vigenciaHoraDesde) return 'Debe completar la hora inicial o dejar ambas horas vacias.';
  if (
    vigenciaDesde
    && vigenciaHasta
    && vigenciaDesde === vigenciaHasta
    && vigenciaHoraDesde
    && vigenciaHoraHasta
    && toTimeSeconds(vigenciaHoraHasta) <= toTimeSeconds(vigenciaHoraDesde)
  ) {
    return 'La hora final debe ser posterior a la hora inicial cuando la promocion inicia y termina el mismo dia.';
  }
  if (estado === 'archivada' && visiblePublico) return 'Una promocion archivada no puede estar visible_publico=true.';
  if (estado === 'publicada') {
    if (!vigenciaDesde) return 'Una promocion publicada requiere vigencia_desde.';
    if (!String(values.imagen_principal_url || '').trim() && !values.imagen_principal_asset_id) {
      return 'Una promocion publicada requiere imagen principal (URL o upload).';
    }
  }
  if (destacada && (!visiblePublico || estado !== 'publicada')) return 'Una promocion destacada debe estar publicada y visible al publico.';
  if (aplicaA !== typeRule.aplica_a) return 'El tipo de promocion no coincide con el objetivo seleccionado.';
  if (!typeRule.mecanicas.includes(mecanica)) return 'La mecanica seleccionada no es valida para este tipo de promocion.';
  if (aplicaA === 'servicio' && !idServicioObjetivo) return 'Debes seleccionar un servicio objetivo.';
  if (aplicaA === 'servicio' && idPaqueteObjetivo) return 'No puedes seleccionar paquete cuando la promocion aplica a servicio.';
  if (aplicaA === 'paquete' && !idPaqueteObjetivo) return 'Debes seleccionar un paquete objetivo.';
  if (aplicaA === 'paquete' && idServicioObjetivo) return 'No puedes seleccionar servicio cuando la promocion aplica a paquete.';
  if (mecanica === 'porcentaje') {
    if (valorDescuento === null || valorDescuento <= 0) return 'El porcentaje de descuento debe ser mayor que 0.';
    if (valorDescuento > 100) return 'El porcentaje de descuento no puede ser mayor que 100.';
  }
  if (mecanica === 'monto_fijo') {
    if (valorDescuento === null || valorDescuento <= 0) return 'El monto de descuento debe ser mayor que 0.';
  }
  if (mecanica === 'dos_por_uno') {
    if (!Number.isInteger(cantidadRequerida) || cantidadRequerida <= 0) return 'La cantidad requerida del 2x1 debe ser un entero mayor que 0.';
    if (!Number.isInteger(cantidadBonificada) || cantidadBonificada <= 0) return 'La cantidad bonificada del 2x1 debe ser un entero mayor que 0.';
  }
  return '';
}

function toPayload(values) {
  const titulo = String(values.titulo || '').trim();
  const parrafos = normalizeParagraphs(values.parrafos_texto);
  const vigenciaDesde = toDateInputValue(values.vigencia_desde);
  const vigenciaHasta = toDateInputValue(values.vigencia_hasta);
  // JK: Envia horas normalizadas solo cuando el usuario las define.
  const vigenciaHoraDesde = normalizeTimeInput(values.vigencia_hora_desde);
  const vigenciaHoraHasta = normalizeTimeInput(values.vigencia_hora_hasta);
  const tipoPromocion = normalizePromotionTypeValue(values.tipo_promocion);
  const typeRule = getPromotionTypeRule(tipoPromocion);
  const aplicaA = normalizePromotionTargetValue(values.aplica_a || typeRule.aplica_a, typeRule.aplica_a);
  const mecanica = normalizePromotionMechanicValue(values.mecanica || typeRule.mecanica_default, typeRule.mecanica_default);
  const serviceId = String(values.id_servicio_objetivo || '').trim();
  const packageId = String(values.id_paquete_objetivo || '').trim();
  const valorDescuento = parsePositiveNumber(values.valor_descuento);
  const cantidadRequerida = parsePositiveInteger(values.cantidad_requerida);
  const cantidadBonificada = parsePositiveInteger(values.cantidad_bonificada);

  return {
    id_sucursal: values.id_sucursal,
    titulo,
    slug: normalizeSlug(titulo),
    subtitulo: String(values.subtitulo || '').trim() || null,
    parrafos,
    imagen_principal_asset_id: values.imagen_principal_asset_id || null,
    imagen_mobile_asset_id: values.imagen_mobile_asset_id || null,
    imagen_principal_url: String(values.imagen_principal_url || '').trim() || null,
    imagen_mobile_url: String(values.imagen_mobile_url || '').trim() || null,
    imagen_alt: titulo || null,
    visible_publico: normalizeBoolean(values.visible_publico),
    destacada: normalizeBoolean(values.destacada),
    orden_visual: Number(values.orden_visual),
    vigencia_desde: vigenciaDesde || null,
    vigencia_hasta: vigenciaHasta || null,
    vigencia_hora_desde: vigenciaHoraDesde || null,
    vigencia_hora_hasta: vigenciaHoraHasta || null,
    estado: values.estado,
    tipo_promocion: tipoPromocion,
    aplica_a: aplicaA,
    mecanica,
    id_servicio_objetivo: aplicaA === 'servicio' ? (serviceId || null) : null,
    id_paquete_objetivo: aplicaA === 'paquete' ? (packageId || null) : null,
    valor_descuento: mecanica === 'dos_por_uno' ? null : valorDescuento,
    cantidad_requerida: mecanica === 'dos_por_uno' ? cantidadRequerida : null,
    cantidad_bonificada: mecanica === 'dos_por_uno' ? cantidadBonificada : null,
  };
}

function mapToForm(promo, branch = '') {
  const tipoPromocion = normalizePromotionTypeValue(promo?.tipo_promocion);
  const typeRule = getPromotionTypeRule(tipoPromocion);
  const aplicaA = normalizePromotionTargetValue(promo?.aplica_a, typeRule.aplica_a);
  const mecanica = normalizePromotionMechanicValue(promo?.mecanica, typeRule.mecanica_default);

  return {
    id_sucursal: promo?.id_sucursal || branch || '',
    titulo: promo?.titulo || '', subtitulo: promo?.subtitulo || '',
    parrafos_texto: serializeParagraphs(promo?.parrafos),
    imagen_principal_url: promo?.imagen_principal_url || '',
    imagen_mobile_url: promo?.imagen_mobile_url || '',
    imagen_principal_asset_id: promo?.imagen_principal_asset_id || null,
    imagen_mobile_asset_id: promo?.imagen_mobile_asset_id || null,
    visible_publico: normalizeBoolean(promo?.visible_publico), destacada: normalizeBoolean(promo?.destacada),
    orden_visual: String(Number(promo?.orden_visual ?? 100)),
    // JK: Precarga horas en modo edicion sin obligar al usuario a rellenarlas.
    vigencia_hora_desde: toTimeInputValue(promo?.vigencia_hora_desde), vigencia_hora_hasta: toTimeInputValue(promo?.vigencia_hora_hasta),
    vigencia_desde: toDateInputValue(promo?.vigencia_desde), vigencia_hasta: toDateInputValue(promo?.vigencia_hasta),
    estado: promo?.estado || 'borrador',
    tipo_promocion: tipoPromocion,
    aplica_a: aplicaA,
    mecanica,
    id_servicio_objetivo: promo?.id_servicio_objetivo || '',
    id_paquete_objetivo: promo?.id_paquete_objetivo || '',
    valor_descuento: promo?.valor_descuento === null || promo?.valor_descuento === undefined ? '' : String(promo.valor_descuento),
    cantidad_requerida: promo?.cantidad_requerida === null || promo?.cantidad_requerida === undefined ? '' : String(promo.cantidad_requerida),
    cantidad_bonificada: promo?.cantidad_bonificada === null || promo?.cantidad_bonificada === undefined ? '' : String(promo.cantidad_bonificada),
  };
}

// JK: Opciones fijas para construir picker amigable sin segundos.
const TIME_HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'));
// JK: Minutos de 00 a 59 para mantener precision sin exponer segundos.
const TIME_MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

function TimePickerPopoverField({ label, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [draftHour, setDraftHour] = useState('09');
  const [draftMinute, setDraftMinute] = useState('00');
  const [draftPeriod, setDraftPeriod] = useState('AM');

  const applyCurrentValueToDraft = useCallback((candidateValue) => {
    // JK: Sincroniza el borrador del mini modal con el valor actual antes de abrir.
    const nextDraft = getTimeDraftParts(candidateValue);
    setDraftHour(nextDraft.hour12);
    setDraftMinute(nextDraft.minute);
    setDraftPeriod(nextDraft.period);
  }, []);

  const openPicker = useCallback(() => {
    applyCurrentValueToDraft(value);
    setOpen(true);
  }, [applyCurrentValueToDraft, value]);

  const closePicker = useCallback(() => {
    setOpen(false);
  }, []);

  const applySelection = useCallback(() => {
    // JK: Guarda siempre en HH:mm (24h) para mantener contrato actual del formulario.
    onChange(build24HourTime(draftHour, draftMinute, draftPeriod));
    setOpen(false);
  }, [draftHour, draftMinute, draftPeriod, onChange]);

  const clearSelection = useCallback(() => {
    // JK: Permite dejar hora vacia de forma explicita.
    onChange('');
    setOpen(false);
  }, [onChange]);

  const clearSelectionFromButton = useCallback((event) => {
    // JK: Evita abrir el selector cuando se limpia la hora con el boton flotante.
    event.preventDefault();
    event.stopPropagation();
    clearSelection();
  }, [clearSelection]);

  const displayValue = formatTimeDisplay(value);
  // JK: Titulo dinamico solicitado para diferenciar inicio/final en el mini modal.
  const pickerTitle = useMemo(() => `Seleccionar ${String(label || 'hora').trim().toLowerCase() || 'hora'}`, [label]);

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="relative">
        <button
          type="button"
          className={`mf-input flex h-10 w-full items-center text-left ${value ? 'pr-11' : 'pr-4'}`}
          onClick={openPicker}
          aria-label={`${label} - abrir selector`}
          aria-expanded={open}
        >
          {/* // JK: En estado cerrado solo mostramos valor seleccionado o placeholder, sin texto fijo AM/PM. */}
          <span className={`truncate ${displayValue ? 'text-[var(--mf-text)]' : 'text-[var(--mf-text-2)]'}`}>
            {displayValue || 'Selecciona hora'}
          </span>
        </button>

        {value ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--mf-text-2)] transition hover:bg-[var(--mf-btn-bg)] hover:text-[var(--mf-text)]"
            onClick={clearSelectionFromButton}
            aria-label={`${label} - limpiar hora`}
          >
            <X size={14} />
          </button>
        ) : null}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            // JK: Forzamos posicion centrada en todos los breakpoints para evitar cortes dentro del modal padre.
            className="left-1/2 right-auto top-1/2 bottom-auto w-[calc(100vw-1.25rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[20px] p-4 sm:p-5"
            // JK: Evita cierres accidentales por interacciones externas, incluido scroll del modal principal.
            onPointerDownOutside={(event) => event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
          >
            <DialogHeader className="pb-2">
              <DialogTitle className="text-lg">{pickerTitle}</DialogTitle>
              <DialogDescription className="sr-only">Selector de hora con formato de 12 horas para la vigencia de la promocion.</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-[var(--mf-text-2)]">Hora</p>
                <select className="mf-select h-10" value={draftHour} onChange={(event) => setDraftHour(event.target.value)}>
                  {TIME_HOUR_OPTIONS.map((hour) => <option key={hour} value={hour}>{hour}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-[var(--mf-text-2)]">Min</p>
                <select className="mf-select h-10" value={draftMinute} onChange={(event) => setDraftMinute(event.target.value)}>
                  {TIME_MINUTE_OPTIONS.map((minute) => <option key={minute} value={minute}>{minute}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-[var(--mf-text-2)]">AM/PM</p>
                <select className="mf-select h-10" value={draftPeriod} onChange={(event) => setDraftPeriod(event.target.value)}>
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>Limpiar</Button>
              <Button type="button" variant="outline" size="sm" onClick={closePicker}>Cancelar</Button>
              <Button type="button" size="sm" onClick={applySelection}>Aplicar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function PromotionDateField({ label, value, onChange }) {
  const [displayValue, setDisplayValue] = useState(() => formatDateToDisplay(value));

  useEffect(() => {
    // JK: Sincroniza el valor visible dd/mm/aaaa cuando cambia el valor interno YYYY-MM-DD.
    setDisplayValue(formatDateToDisplay(value));
  }, [value]);

  const handleDisplayChange = useCallback((event) => {
    const raw = String(event.target.value || '');
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    let masked = digits;
    if (digits.length > 4) masked = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    else if (digits.length > 2) masked = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    setDisplayValue(masked);

    if (!masked) {
      onChange('');
      return;
    }

    const internalValue = formatDateToInternal(masked);
    if (internalValue) onChange(internalValue);
  }, [onChange]);

  const handleDisplayBlur = useCallback(() => {
    // JK: Evita dejar texto parcial; al salir del campo vuelve al valor interno valido.
    setDisplayValue(formatDateToDisplay(value));
  }, [value]);

  const handleNativePickerChange = useCallback((event) => {
    const internalValue = String(event.target.value || '');
    onChange(internalValue);
    setDisplayValue(formatDateToDisplay(internalValue));
  }, [onChange]);

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          type="text"
          inputMode="numeric"
          placeholder="dd/mm/aaaa"
          value={displayValue}
          onChange={handleDisplayChange}
          onBlur={handleDisplayBlur}
          className="pr-10"
          aria-label={`${label} en formato dia/mes/anio`}
        />
        {/* // JK: Conserva selector nativo de fecha, pero el valor visible principal se mantiene en dd/mm/aaaa. */}
        <input
          type="date"
          value={toDateInputValue(value) || ''}
          onChange={handleNativePickerChange}
          className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 cursor-pointer opacity-0"
          aria-label={`${label} - selector de calendario`}
          tabIndex={-1}
        />
        <CalendarDays size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--mf-text-2)]" />
      </div>
    </div>
  );
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

function PromotionForm({ values, onChange, branchLabel, promotionId, serviceOptions, packageOptions, loadingTargets, errorMessage }) {
  const typeRule = getPromotionTypeRule(values.tipo_promocion);
  const aplicaA = normalizePromotionTargetValue(values.aplica_a || typeRule.aplica_a, typeRule.aplica_a);
  const mecanica = normalizePromotionMechanicValue(values.mecanica || typeRule.mecanica_default, typeRule.mecanica_default);
  const mecanicaBloqueada = typeRule.mecanicas.length === 1;
  const mecanicaOptions = PROMOTION_MECHANIC_OPTIONS.filter((item) => typeRule.mecanicas.includes(item.value));
  const isDosPorUno = mecanica === 'dos_por_uno';
  const objetivoOptions = aplicaA === 'servicio' ? serviceOptions : packageOptions;
  const objetivoValue = aplicaA === 'servicio' ? values.id_servicio_objetivo : values.id_paquete_objetivo;
  const objetivoLabel = aplicaA === 'servicio' ? 'Servicio objetivo *' : 'Paquete objetivo *';

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2.5 text-sm text-[var(--mf-text-2)]">
        <span className="text-xs uppercase tracking-widest text-[var(--mf-text-2)]">Sucursal</span>
        <div className="mt-1 font-medium text-[var(--mf-text)]">{branchLabel || 'No definida'}</div>
      </div>

      <div className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-3">
        <p className="text-xs uppercase tracking-widest text-[var(--mf-text-2)]">Aplicacion de la Promocion</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Tipo de promocion *</Label>
            <select
              className="mf-select"
              value={values.tipo_promocion}
              onChange={(event) => onChange('tipo_promocion', event.target.value)}
            >
              {PROMOTION_TYPE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>{objetivoLabel}</Label>
            <select
              className="mf-select"
              value={objetivoValue}
              onChange={(event) => {
                if (aplicaA === 'servicio') {
                  onChange('id_servicio_objetivo', event.target.value);
                } else {
                  onChange('id_paquete_objetivo', event.target.value);
                }
              }}
              disabled={loadingTargets}
            >
              <option value="">{loadingTargets ? 'Cargando catalogo...' : `Selecciona ${aplicaA}`}</option>
              {objetivoOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Mecanica *</Label>
            <select
              className="mf-select"
              value={mecanica}
              onChange={(event) => onChange('mecanica', event.target.value)}
              disabled={mecanicaBloqueada}
            >
              {mecanicaOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>

          {!isDosPorUno ? (
            <div className="space-y-1.5">
              <Label>{mecanica === 'porcentaje' ? 'Valor descuento (%) *' : 'Valor descuento (L) *'}</Label>
              <Input
                type="number"
                min="0"
                step={mecanica === 'porcentaje' ? '0.01' : '0.01'}
                max={mecanica === 'porcentaje' ? '100' : undefined}
                value={values.valor_descuento}
                onChange={(event) => onChange('valor_descuento', event.target.value)}
                placeholder={mecanica === 'porcentaje' ? 'Ej: 10' : 'Ej: 50'}
              />
            </div>
          ) : null}
        </div>

        {isDosPorUno ? (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Cantidad requerida *</Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={values.cantidad_requerida}
                onChange={(event) => onChange('cantidad_requerida', event.target.value)}
                placeholder="Ej: 1"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cantidad bonificada *</Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={values.cantidad_bonificada}
                onChange={(event) => onChange('cantidad_bonificada', event.target.value)}
                placeholder="Ej: 1"
              />
            </div>
          </div>
        ) : null}
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
        <ImageUploaderField
          label="Imagen principal"
          scopeKey="public_promotion_main"
          entityType="promocion"
          entityId={promotionId || null}
          idSucursal={values.id_sucursal || null}
          valueAssetId={values.imagen_principal_asset_id}
          initialPreviewUrl={values.imagen_principal_url}
          onChange={(payload) => {
            onChange('imagen_principal_asset_id', payload?.asset_id || null);
            if (payload?.public_url) {
              onChange('imagen_principal_url', payload.public_url);
            }
          }}
        />
      </div>

      <div className="space-y-1.5">
        <ImageUploaderField
          label="Imagen mobile"
          helperText="Opcional para vista mobile de promociones publicas."
          scopeKey="public_promotion_mobile"
          entityType="promocion"
          entityId={promotionId || null}
          idSucursal={values.id_sucursal || null}
          valueAssetId={values.imagen_mobile_asset_id}
          initialPreviewUrl={values.imagen_mobile_url}
          onChange={(payload) => {
            onChange('imagen_mobile_asset_id', payload?.asset_id || null);
            if (payload?.public_url) {
              onChange('imagen_mobile_url', payload.public_url);
            }
          }}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label className="mf-label">Estado</Label><select className="mf-select" value={values.estado} onChange={(e) => onChange('estado', e.target.value)}><option value="borrador">Borrador</option><option value="publicada">Publicada</option><option value="archivada">Archivada</option></select></div>
        <div className="space-y-1.5"><Label>Orden visual *</Label><Input type="number" min="0" step="1" value={values.orden_visual} onChange={(e) => onChange('orden_visual', e.target.value)} /></div>
      </div>

      {/* // JK: Campos de fecha/hora alineados para definir vigencia completa de la promocion. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <PromotionDateField label="Vigencia desde" value={values.vigencia_desde} onChange={(nextValue) => onChange('vigencia_desde', nextValue)} />
        <TimePickerPopoverField label="Hora inicio" value={values.vigencia_hora_desde} onChange={(nextValue) => onChange('vigencia_hora_desde', nextValue)} />
        <PromotionDateField label="Vigencia hasta" value={values.vigencia_hasta} onChange={(nextValue) => onChange('vigencia_hasta', nextValue)} />
        <TimePickerPopoverField label="Hora final" value={values.vigencia_hora_hasta} onChange={(nextValue) => onChange('vigencia_hora_hasta', nextValue)} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex items-center justify-between rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2.5 text-sm"><span className="text-[var(--mf-text)]">Visible en landing publica</span><input type="checkbox" checked={Boolean(values.visible_publico)} onChange={(e) => onChange('visible_publico', e.target.checked)} className="h-4 w-4 accent-[var(--mf-accent)]" /></label>
        <label className="flex items-center justify-between rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2.5 text-sm"><span className="text-[var(--mf-text)]">Marcar como destacada</span><input type="checkbox" checked={Boolean(values.destacada)} onChange={(e) => onChange('destacada', e.target.checked)} className="h-4 w-4 accent-[var(--mf-accent)]" /></label>
      </div>

      {/* // JK: Reubica alerta de validacion debajo de vigencia/visibilidad para no tapar campos. */}
      {errorMessage ? <div className="pt-1"><ErrorBanner message={errorMessage} /></div> : null}
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
  const [serviceTargetOptions, setServiceTargetOptions] = useState([]);
  const [packageTargetOptions, setPackageTargetOptions] = useState([]);
  const [loadingTargetOptions, setLoadingTargetOptions] = useState(false);

  const branchNameById = useMemo(() => allBranches.reduce((acc, branch) => ({ ...acc, [branch.id_sucursal]: branch.nombre_sucursal }), {}), [allBranches]);
  const availableBranches = useMemo(() => (branchIds.length > 0 ? allBranches.filter((branch) => branchIds.includes(branch.id_sucursal)) : allBranches).filter((branch) => branch?.id_sucursal), [allBranches, branchIds]);
  const actionsLockedByBranch = !sucursal && availableBranches.length > 1;

  const filteredPromociones = useMemo(() => {
    const searchValue = search.trim().toLowerCase();
    return promociones.filter((promo) => {
      if (searchValue) {
        const text = [promo?.titulo, promo?.subtitulo, promo?.slug, promo?.resumen_promocion, ...(Array.isArray(promo?.parrafos) ? promo.parrafos : [])].filter(Boolean).join(' ').toLowerCase();
        if (!text.includes(searchValue)) return false;
      }
      if (filters.estado !== 'all' && String(promo?.estado || '') !== filters.estado) return false;
      if (filters.visibilidad !== 'all' && Boolean(promo?.visible_publico) !== (filters.visibilidad === 'visible')) return false;
      if (filters.destacada !== 'all' && Boolean(promo?.destacada) !== (filters.destacada === 'si')) return false;
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

  const fetchPromotionTargetOptions = useCallback(async () => {
    if (!sucursal) {
      setServiceTargetOptions([]);
      setPackageTargetOptions([]);
      return;
    }

    setLoadingTargetOptions(true);
    try {
      // JK: Carga paralela de catalogos para evitar bloqueos del modal al seleccionar objetivos.
      const [servicesResponse, packagesResponse] = await Promise.all([
        listAdminServicios({ id_sucursal: sucursal }),
        listAdminPaquetes({ id_sucursal: sucursal }),
      ]);

      const servicesPayload = servicesResponse?.data || servicesResponse;
      const services = Array.isArray(servicesPayload?.servicios) ? servicesPayload.servicios : [];
      const mappedServices = services
        .filter((service) => (
          Boolean(service?.activo)
          && Boolean(service?.tarifa_activa)
          && service?.servicio_informativo !== true
          && String(service?.id_sucursal || '') === String(sucursal)
        ))
        .map((service) => ({
          value: service.id_servicio,
          label: service.nombre_servicio || 'Servicio',
        }))
        .sort((left, right) => String(left.label || '').localeCompare(String(right.label || ''), 'es'));
      setServiceTargetOptions(mappedServices);

      const packagesPayload = packagesResponse?.data || packagesResponse;
      const packages = Array.isArray(packagesPayload?.paquetes) ? packagesPayload.paquetes : [];
      const mappedPackages = packages
        .filter((pkg) => (
          Boolean(pkg?.activo)
          && String(pkg?.id_sucursal || '') === String(sucursal)
        ))
        .map((pkg) => ({
          value: pkg.id_paquete,
          label: pkg.nombre_paquete || 'Paquete',
        }))
        .sort((left, right) => String(left.label || '').localeCompare(String(right.label || ''), 'es'));
      setPackageTargetOptions(mappedPackages);
    } catch (error) {
      setServiceTargetOptions([]);
      setPackageTargetOptions([]);
      notifications.warning(extractMessage(error), { dedupeKey: 'promos-target-options-error' });
    } finally {
      setLoadingTargetOptions(false);
    }
  }, [notifications, sucursal]);

  useEffect(() => { void fetchBranches(); }, [fetchBranches]);
  useEffect(() => {
    if (sucursal) return;
    if (branchIds.length === 1) setSucursal(branchIds[0]);
    else if (availableBranches.length === 1) setSucursal(availableBranches[0].id_sucursal);
  }, [availableBranches, branchIds, sucursal]);
  useEffect(() => { void fetchPromociones(); }, [fetchPromociones]);
  useEffect(() => { void fetchPromotionTargetOptions(); }, [fetchPromotionTargetOptions]);
  useEffect(() => {
    if (!dialogOpen) return;
    setFormValues((prev) => {
      let changed = false;
      const next = { ...prev };
      if (
        next.id_servicio_objetivo
        && !serviceTargetOptions.some((item) => String(item.value) === String(next.id_servicio_objetivo))
      ) {
        next.id_servicio_objetivo = '';
        changed = true;
      }
      if (
        next.id_paquete_objetivo
        && !packageTargetOptions.some((item) => String(item.value) === String(next.id_paquete_objetivo))
      ) {
        next.id_paquete_objetivo = '';
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [dialogOpen, packageTargetOptions, serviceTargetOptions]);

  function clearAllFilters() { setSearch(''); setFilters({ ...FILTER_DEFAULTS }); }
  function clearChip(key) {
    if (key === 'search') setSearch('');
    else setFilters((prev) => ({ ...prev, [key]: 'all' }));
  }

  function handleFormChange(field, value) {
    setFormValues((prev) => {
      const next = { ...prev, [field]: value };
      const typeRule = getPromotionTypeRule(next.tipo_promocion);
      next.tipo_promocion = normalizePromotionTypeValue(next.tipo_promocion);
      next.aplica_a = typeRule.aplica_a;
      if (!typeRule.mecanicas.includes(next.mecanica)) {
        next.mecanica = typeRule.mecanica_default;
      }

      if (next.aplica_a === 'servicio') next.id_paquete_objetivo = '';
      if (next.aplica_a === 'paquete') next.id_servicio_objetivo = '';

      if (next.mecanica === 'dos_por_uno') {
        next.valor_descuento = '';
        if (!String(next.cantidad_requerida || '').trim()) next.cantidad_requerida = '1';
        if (!String(next.cantidad_bonificada || '').trim()) next.cantidad_bonificada = '1';
      } else {
        next.cantidad_requerida = '';
        next.cantidad_bonificada = '';
      }

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
                {
                  label: 'Imagen',
                  value: promo.imagen_principal_url ? (
                    <div className="h-12 w-20 overflow-hidden rounded-lg border border-[var(--mf-nav-border)]">
                      <img src={promo.imagen_principal_url} alt={promo.titulo || 'Promocion'} className="h-full w-full object-cover" loading="lazy" />
                    </div>
                  ) : 'Sin imagen',
                },
                { label: 'Aplicacion', value: promo.resumen_promocion || '-' },
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
            <TableBody>{filteredPromociones.map((promo) => (<TableRow key={`${promo.id_promocion}:${promo.id_sucursal}`} className="border-[var(--mf-nav-border)] hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_60%,transparent)] transition-colors">{!sucursal ? <TableCell className="text-[var(--mf-text-2)] text-sm whitespace-nowrap">{branchNameById[promo.id_sucursal] || 'Sin sucursal'}</TableCell> : null}<TableCell className="font-medium text-[var(--mf-text)]"><div className="flex items-center gap-2"><div className="h-10 w-16 shrink-0 overflow-hidden rounded-md border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)]">{promo.imagen_principal_url ? <img src={promo.imagen_principal_url} alt={promo.titulo || 'Promocion'} className="h-full w-full object-cover" loading="lazy" /> : null}</div><div><div>{promo.titulo}</div>{promo.subtitulo ? <div className="text-xs text-[var(--mf-text-2)] mt-0.5">{promo.subtitulo}</div> : null}</div></div></TableCell><TableCell className="text-[var(--mf-text-2)] hidden lg:table-cell">{promo.slug || '-'}</TableCell><TableCell className="text-center"><PromotionStateBadge estado={promo.estado} /></TableCell><TableCell className="text-center hidden md:table-cell"><PromotionVisibilityBadge visible={Boolean(promo.visible_publico)} /></TableCell><TableCell className="text-center hidden md:table-cell"><PromotionFeaturedBadge destacada={Boolean(promo.destacada)} /></TableCell><TableCell className="text-center hidden md:table-cell"><PromotionVigenciaBadge vigenciaHasta={promo.vigencia_hasta} /></TableCell><TableCell className="text-center text-[var(--mf-text-2)]">{Number(promo.orden_visual ?? 100)}</TableCell><TableCell className="hidden lg:table-cell text-[var(--mf-text-2)] text-xs whitespace-nowrap">{(promo.vigencia_desde || '-')} {' -> '} {(promo.vigencia_hasta || '-')}</TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-1.5">{renderActions(promo)}</div></TableCell></TableRow>))}</TableBody>
          </Table>
        </div>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!formLoading) setDialogOpen(open); }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editTarget ? 'Editar promocion' : 'Nueva promocion'}</DialogTitle><DialogDescription className="sr-only">Configura contenido, publicacion y vigencia de la promocion por sucursal.</DialogDescription></DialogHeader>
          <PromotionForm
            values={formValues}
            onChange={handleFormChange}
            branchLabel={branchNameById[formValues.id_sucursal]}
            promotionId={editTarget?.id_promocion || null}
            serviceOptions={serviceTargetOptions}
            packageOptions={packageTargetOptions}
            loadingTargets={loadingTargetOptions}
            errorMessage={formError}
          />
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
                  { label: 'Orden visual', value: Number(detailTarget.orden_visual ?? 100) },
                  { label: 'Vigencia', value: <PromotionVigenciaBadge vigenciaHasta={detailTarget.vigencia_hasta} /> },
                  // JK: Vigencia detallada en formato amigable y estable sin desfase por zona horaria.
                  { label: 'Vigencia desde', value: formatDateDetailDisplay(detailTarget.vigencia_desde) },
                  { label: 'Hora inicio', value: formatTimeDetailDisplay(detailTarget.vigencia_hora_desde) },
                  { label: 'Vigencia hasta', value: formatDateDetailDisplay(detailTarget.vigencia_hasta) },
                  { label: 'Hora final', value: formatTimeDetailDisplay(detailTarget.vigencia_hora_hasta) },
                ]},
                { id: 'aplicacion', title: 'Aplicacion', icon: <Gift size={14} />, fields: [
                  { label: 'Resumen', value: detailTarget.resumen_promocion || '-' },
                  { label: 'Tipo', value: detailTarget.tipo_promocion || '-' },
                  { label: 'Aplica a', value: detailTarget.aplica_a || '-' },
                  { label: 'Mecanica', value: detailTarget.mecanica || '-' },
                  { label: 'ID servicio objetivo', value: detailTarget.id_servicio_objetivo || '-' },
                  { label: 'ID paquete objetivo', value: detailTarget.id_paquete_objetivo || '-' },
                  { label: 'Valor descuento', value: detailTarget.valor_descuento ?? '-' },
                  { label: 'Cantidad requerida', value: detailTarget.cantidad_requerida ?? '-' },
                  { label: 'Cantidad bonificada', value: detailTarget.cantidad_bonificada ?? '-' },
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
          <DialogHeader><DialogTitle>Filtros de Promociones</DialogTitle><DialogDescription className="sr-only">Filtra promociones por estado, visibilidad, destacada y sucursal.</DialogDescription></DialogHeader>
          <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><Label className="mf-label">Estado</Label><select className="mf-select mt-1" value={filters.estado} onChange={(event) => setFilters((prev) => ({ ...prev, estado: event.target.value }))}><option value="all">Todos</option><option value="borrador">Borrador</option><option value="publicada">Publicada</option><option value="archivada">Archivada</option></select></div>
            <div><Label className="mf-label">Visibilidad publica</Label><select className="mf-select mt-1" value={filters.visibilidad} onChange={(event) => setFilters((prev) => ({ ...prev, visibilidad: event.target.value }))}><option value="all">Todos</option><option value="visible">Visible</option><option value="oculto">Oculto</option></select></div>
            <div><Label className="mf-label">Destacada</Label><select className="mf-select mt-1" value={filters.destacada} onChange={(event) => setFilters((prev) => ({ ...prev, destacada: event.target.value }))}><option value="all">Todos</option><option value="si">Si</option><option value="no">No</option></select></div>
            {!sucursal ? <div className="sm:col-span-2"><Label className="mf-label">Sucursal</Label><select className="mf-select mt-1" value={filters.idSucursal} onChange={(event) => setFilters((prev) => ({ ...prev, idSucursal: event.target.value }))}><option value="all">Todas</option>{availableBranches.map((branch) => <option key={branch.id_sucursal} value={branch.id_sucursal}>{branch.nombre_sucursal}</option>)}</select></div> : <p className="sm:col-span-2 text-xs text-[var(--mf-text-2)]">La sucursal ya esta fijada en el selector superior.</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={clearAllFilters}>Limpiar filtros</Button><Button onClick={() => setFiltersOpen(false)}>Cerrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
