import { useEffect, useState } from 'react';
import { FileDown, FileSpreadsheet, Loader2, Printer } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { Button } from '../../../components/ui/button.jsx';
import { Input } from '../../../components/ui/input.jsx';
import { Label } from '../../../components/ui/label.jsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog.jsx';
import logoMF1 from '../../../assets/branding/logoMF1.jpeg';
import { getUserDisplayName, useAuth } from '../../../context/AuthContext.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';

// JK: Catalogo maestro de KPIs solicitados por negocio para el modal "Crear Reporte".
const KPI_GROUPS = [
  {
    moduleType: 'ingresos',
    label: 'Ingresos',
    items: [
      { id: 'ingresos_totales', label: 'Ingresos totales' },
      { id: 'ingresos_servicios', label: 'Ingresos totales por servicios' },
      { id: 'ingresos_membresias', label: 'Ingresos totales por membresias' },
      { id: 'membresia_mas_vendida', label: 'Membresia mas vendida' },
      { id: 'servicio_mas_solicitado', label: 'Servicio mas solicitado' },
    ],
  },
  {
    moduleType: 'membresias',
    label: 'Membresias',
    items: [
      { id: 'membresias_clientes_activos', label: 'Total de clientes con membresia activa' },
      { id: 'membresias_activas_por_membresia', label: 'Suscripciones activas por membresia' },
    ],
  },
  {
    moduleType: 'barberos',
    label: 'Barberos',
    items: [
      { id: 'barberos_productividad', label: 'Productividad por barbero' },
      { id: 'barberos_servicios_por_barbero', label: 'Cantidad total por cada servicio realizado' },
      { id: 'barberos_citas_canceladas', label: 'Citas canceladas por barbero', disabled: true },
      { id: 'barberos_inasistencias', label: 'Inasistencias por barbero' },
    ],
  },
  {
    moduleType: 'concurrencia',
    label: 'Concurrencia',
    items: [
      { id: 'cantidad_citas', label: 'Cantidad de citas generadas' },
      { id: 'concurrencia_horas_mayor_demanda', label: 'Horas con mayor demanda' },
      { id: 'concurrencia_dia_mayor_demanda', label: 'Dia con mayor demanda' },
      { id: 'concurrencia_inasistencias_clientes', label: 'Cantidad de inasistencias de clientes' },
      { id: 'concurrencia_ingresos_plataforma', label: 'Total de ingresos a la plataforma', disabled: true },
    ],
  },
];

// JK: Descripciones humanizadas por KPI para bloques independientes dentro del PDF.
const KPI_DESCRIPTIONS = {
  ingresos_totales: 'Total de ingresos generados en el periodo seleccionado.',
  ingresos_servicios: 'Monto total recibido por servicios en el periodo seleccionado.',
  ingresos_membresias: 'Monto total recibido por membresias en el periodo seleccionado.',
  membresia_mas_vendida: 'Plan de membresia con mayor volumen de ventas en el periodo.',
  servicio_mas_solicitado: 'Servicio con mayor cantidad de solicitudes en el periodo.',
  membresias_clientes_activos: 'Total de clientes que mantienen una membresia activa.',
  membresias_activas_por_membresia: 'Distribucion de suscripciones activas por tipo de membresia.',
  barberos_productividad: 'Cantidad total de servicios realizados por cada barbero en el periodo seleccionado.',
  barberos_servicios_por_barbero: 'Distribucion total de servicios realizados por barbero.',
  barberos_inasistencias: 'Cantidad de inasistencias registradas por barbero en el periodo.',
  cantidad_citas: 'Total de citas generadas en el periodo seleccionado.',
  concurrencia_horas_mayor_demanda: 'Horas con mayor volumen de citas durante el periodo seleccionado.',
  concurrencia_dia_mayor_demanda: 'Dias con mayor volumen de citas durante el periodo seleccionado.',
  concurrencia_inasistencias_clientes: 'Cantidad total de inasistencias de clientes en el periodo.',
};

// JK: Configuracion de encabezados por tabla para cada bloque KPI en PDF.
const PDF_TABLE_COLUMNS_BY_KPI = {
  concurrencia_horas_mayor_demanda: { left: 'Hora', right: 'Cantidad de citas' },
  concurrencia_dia_mayor_demanda: { left: 'Dia', right: 'Cantidad de citas' },
};

const DEFAULT_PDF_TABLE_COLUMNS = { left: 'Indicador', right: 'Valor' };

// JK: Lista plana de KPIs habilitados para la accion global de marcar/desmarcar todo.
const ENABLED_KPI_IDS = KPI_GROUPS
  .flatMap((group) => (Array.isArray(group?.items) ? group.items : []))
  .filter((item) => !item?.disabled)
  .map((item) => item.id);

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toInt(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function formatMoney(value) {
  const amount = toNumber(value, 0);
  return `L ${amount.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatInteger(value) {
  return toInt(value, 0).toLocaleString('es-HN');
}

function formatHourLabel(value) {
  const hour = toInt(value, -1);
  if (hour < 0 || hour > 23) return 'Sin datos';
  return `${String(hour).padStart(2, '0')}:00`;
}

function extractMessage(err) {
  return err?.data?.error?.message || err?.message || 'Error desconocido.';
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const normalized = String(value);
  if (/["\r\n,]/.test(normalized)) return `"${normalized.replace(/"/g, '""')}"`;
  return normalized;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// JK: Convierte el logo importado desde assets a DataURL para incrustarlo en jsPDF.
function loadImageAsDataUrl(imageUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('No se pudo preparar el canvas para el logo.'));
        return;
      }
      context.drawImage(image, 0, 0);
      resolve({
        dataUrl: canvas.toDataURL('image/jpeg', 0.92),
        width: canvas.width,
        height: canvas.height,
      });
    };
    image.onerror = () => reject(new Error('No se pudo cargar el logo corporativo.'));
    image.src = imageUrl;
  });
}

function cleanText(value, fallback = 'Sin datos') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function normalizeCellValue(value, fallback = '-') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function buildSingleRow(indicator, value) {
  return [{ label: cleanText(indicator, 'Sin datos'), value: normalizeCellValue(value, '-') }];
}

// JK: Extrae enteros desde strings mixtos (ej: "3 citas") para normalizar tablas de concurrencia.
function parseIntegerFromMixedValue(value) {
  const digits = String(value ?? '').replace(/[^\d-]/g, '');
  return toInt(digits, 0);
}

// JK: Ajusta formato de valor por KPI para una lectura de negocio mas clara en PDF.
function formatPdfKpiValue(kpiId, rawValue) {
  const safeValue = normalizeCellValue(rawValue, '-');
  if (safeValue === '-') return '-';

  if (kpiId === 'barberos_productividad' || kpiId === 'barberos_servicios_por_barbero') {
    return `${safeValue} servicios`;
  }
  if (kpiId === 'barberos_inasistencias') {
    return `${safeValue} inasistencias`;
  }
  if (kpiId === 'concurrencia_horas_mayor_demanda' || kpiId === 'concurrencia_dia_mayor_demanda') {
    return formatInteger(parseIntegerFromMixedValue(safeValue));
  }
  return safeValue;
}

// JK: Construye filas normalizadas para tablas PDF y aplica fallback "Sin datos | -".
function buildPdfRowsForKpi(kpiId, rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const normalizedRows = safeRows
    .map((row) => ({
      left: cleanText(row?.label, 'Sin datos'),
      right: formatPdfKpiValue(kpiId, row?.value),
    }))
    .filter((row) => row.left);

  return normalizedRows.length > 0 ? normalizedRows : [{ left: 'Sin datos', right: '-' }];
}

// JK: Resumen ejecutivo de alto nivel para lectura rapida al inicio del PDF.
function buildExecutiveSummaryRows(snapshot) {
  const kpis = snapshot?.kpis || {};
  const validacion = snapshot?.validacion_datos || {};
  const hasServicePaymentsScope = toInt(validacion?.pagos_servicios_en_rango) > 0 || toInt(validacion?.detalles_en_rango) > 0;
  const hasSubscriptionPaymentsScope = toInt(validacion?.subscription_payments_scope) > 0;
  const hasRevenueScope = hasServicePaymentsScope || hasSubscriptionPaymentsScope;
  const hasAppointmentsInRange = toInt(validacion?.citas_en_rango) > 0;
  const hasClientsScope = toInt(validacion?.clientes_scope) > 0;

  return [
    {
      left: 'Ingresos totales',
      right: hasRevenueScope ? formatMoney(kpis?.ingresos_totales_hnl) : '-',
    },
    {
      left: 'Total citas',
      right: hasAppointmentsInRange ? formatInteger(kpis?.total_citas) : '-',
    },
    {
      left: 'Total clientes activos',
      right: hasClientsScope ? formatInteger(kpis?.total_clientes_activos) : '-',
    },
  ];
}

// JK: Genera capa inteligente del reporte (insights + alertas + rankings) sin depender de backend adicional.
function buildInsights(snapshot) {
  const kpis = snapshot?.kpis || {};
  const concurrencia = snapshot?.concurrencia_clientes || {};
  const totalCitas = Math.max(0, toInt(kpis?.total_citas));
  const totalIngresos = Math.max(0, toNumber(kpis?.ingresos_totales_hnl));
  const totalInasistencias = Math.max(0, toInt(concurrencia?.citas_vs_no_show?.total_no_show));
  const clientesActivosConMembresia = Math.max(0, toInt(kpis?.clientes_con_membresia_activa));
  const tasaInasistencia = totalCitas > 0 ? (totalInasistencias / totalCitas) : 0;
  const ingresosCero = totalIngresos === 0;

  const diasDemanda = (Array.isArray(concurrencia?.trafico_por_dia_semana) ? concurrencia.trafico_por_dia_semana : [])
    .map((row) => ({
      dia: cleanText(row?.dia_semana_label, 'Sin datos'),
      total_citas: Math.max(0, toInt(row?.total_citas)),
    }))
    .filter((row) => row.total_citas > 0)
    .sort((left, right) => toInt(right?.total_citas) - toInt(left?.total_citas));

  const horasDemanda = (Array.isArray(concurrencia?.horas_pico) ? concurrencia.horas_pico : [])
    .map((row) => ({
      hora: formatHourLabel(row?.hora),
      total_citas: Math.max(0, toInt(row?.total_citas)),
    }))
    .filter((row) => row.total_citas > 0)
    .sort((left, right) => toInt(right?.total_citas) - toInt(left?.total_citas));

  const topDia = diasDemanda[0] || null;
  const topHora = horasDemanda[0] || null;

  const insights = [];
  if (totalCitas > 0) {
    insights.push(`Se registraron ${formatInteger(totalCitas)} citas en el periodo.`);
  }
  if (ingresosCero) {
    insights.push('No se generaron ingresos en el periodo evaluado.');
  } else {
    insights.push(`El periodo cerro con ingresos por ${formatMoney(totalIngresos)}.`);
  }
  if (totalCitas > 0 && tasaInasistencia > 0.3) {
    insights.push(`El ${Math.round(tasaInasistencia * 100)}% de las citas resultaron en inasistencias.`);
  }
  if (clientesActivosConMembresia > 0) {
    insights.push(`${formatInteger(clientesActivosConMembresia)} clientes mantienen membresias activas.`);
  }

  const rankings = [];
  if (topDia) {
    rankings.push(`El dia con mayor demanda fue ${topDia.dia} con ${formatInteger(topDia.total_citas)} citas.`);
  }
  if (topHora) {
    rankings.push(`La hora mas demandada fue ${topHora.hora} con ${formatInteger(topHora.total_citas)} citas.`);
  }

  const alerts = [];
  if (totalCitas > 0 && tasaInasistencia > 0.4) {
    alerts.push('Alta tasa de inasistencias detectada.');
  }
  if (ingresosCero) {
    alerts.push('No se registraron ingresos.');
  }
  if (totalCitas === 0) {
    alerts.push('No hubo actividad en el periodo.');
  }

  return {
    insights,
    alerts,
    rankings,
    metrics: {
      totalCitas,
      totalIngresos,
      totalInasistencias,
      clientesActivosConMembresia,
      tasaInasistencia,
      ingresosCero,
    },
  };
}

// JK: Construye datasets saneados para KPIs y retorna filas uniformes "Indicador | Valor".
function buildKpiDataMap(snapshot) {
  const ventas = snapshot?.ventas_ingresos || {};
  const membresias = snapshot?.membresias || {};
  const concurrencia = snapshot?.concurrencia_clientes || {};
  const productividad = snapshot?.productividad_barberos || {};
  const kpis = snapshot?.kpis || {};
  const validacion = snapshot?.validacion_datos || {};

  const hasServicePaymentsScope = toInt(validacion?.pagos_servicios_en_rango) > 0 || toInt(validacion?.detalles_en_rango) > 0;
  const hasSubscriptionPaymentsScope = toInt(validacion?.subscription_payments_scope) > 0;
  const hasSubscriptionsScope = toInt(validacion?.subscriptions_scope) > 0;
  const hasActivePlans = toInt(validacion?.planes_activos) > 0;
  const hasClientsScope = toInt(validacion?.clientes_scope) > 0;
  const hasAppointmentsInRange = toInt(validacion?.citas_en_rango) > 0;
  const hasBarbersScope = toInt(validacion?.barberos_scope) > 0;
  const hasRevenueScope = hasServicePaymentsScope || hasSubscriptionPaymentsScope;

  // JK: Datasets saneados para evitar null/NaN y proteger UI/PDF de registros incompletos.
  const ingresosPorServicios = (Array.isArray(ventas?.ingresos_por_servicio) ? ventas.ingresos_por_servicio : [])
    .map((row) => ({
      nombre_servicio: cleanText(row?.nombre_servicio, 'Sin servicio'),
      servicios_realizados: Math.max(0, toInt(row?.servicios_realizados)),
      ingresos_hnl: Math.max(0, toNumber(row?.ingresos_hnl)),
    }))
    .sort((left, right) => {
      const diff = toInt(right?.servicios_realizados) - toInt(left?.servicios_realizados);
      if (diff !== 0) return diff;
      return String(left?.nombre_servicio || '').localeCompare(String(right?.nombre_servicio || ''), 'es');
    });

  const ingresosPorMembresia = (Array.isArray(membresias?.ingresos_por_planes) ? membresias.ingresos_por_planes : [])
    .map((row) => ({
      nombre_plan: cleanText(row?.nombre_plan, 'Sin membresia'),
      pagos_registrados: Math.max(0, toInt(row?.pagos_registrados)),
      ingresos_hnl: Math.max(0, toNumber(row?.ingresos_hnl)),
    }))
    .sort((left, right) => {
      const diff = toInt(right?.pagos_registrados) - toInt(left?.pagos_registrados);
      if (diff !== 0) return diff;
      return String(left?.nombre_plan || '').localeCompare(String(right?.nombre_plan || ''), 'es');
    });

  const suscripcionesPorMembresia = (Array.isArray(membresias?.suscripciones_activas_por_plan)
    ? membresias.suscripciones_activas_por_plan
    : [])
    .map((row) => ({
      nombre_plan: cleanText(row?.nombre_plan, 'Sin membresia'),
      suscripciones_activas: Math.max(0, toInt(row?.suscripciones_activas)),
    }))
    .sort((left, right) => {
      const diff = toInt(right?.suscripciones_activas) - toInt(left?.suscripciones_activas);
      if (diff !== 0) return diff;
      return String(left?.nombre_plan || '').localeCompare(String(right?.nombre_plan || ''), 'es');
    });

  const productividadPorBarbero = (Array.isArray(productividad?.resumen) ? productividad.resumen : [])
    .map((row) => ({
      nombre_barbero: cleanText(row?.nombre_barbero, 'Sin barbero'),
      servicios_realizados: Math.max(0, toInt(row?.servicios_realizados)),
      no_show: Math.max(0, toInt(row?.no_show)),
      ingresos_hnl: Math.max(0, toNumber(row?.ingresos_hnl)),
    }))
    .sort((left, right) => {
      const diffServices = toInt(right?.servicios_realizados) - toInt(left?.servicios_realizados);
      if (diffServices !== 0) return diffServices;
      const diffIncome = toNumber(right?.ingresos_hnl) - toNumber(left?.ingresos_hnl);
      if (diffIncome !== 0) return diffIncome;
      return String(left?.nombre_barbero || '').localeCompare(String(right?.nombre_barbero || ''), 'es');
    });

  const horasMayorDemanda = (Array.isArray(concurrencia?.horas_pico) ? concurrencia.horas_pico : [])
    .map((row) => ({
      hora: Math.max(0, Math.min(23, toInt(row?.hora))),
      hora_label: formatHourLabel(row?.hora),
      total_citas: Math.max(0, toInt(row?.total_citas)),
    }))
    .filter((row) => row.total_citas > 0)
    .sort((left, right) => {
      const diff = toInt(right?.total_citas) - toInt(left?.total_citas);
      if (diff !== 0) return diff;
      return toInt(left?.hora) - toInt(right?.hora);
    });

  const diaMayorDemanda = (Array.isArray(concurrencia?.trafico_por_dia_semana) ? concurrencia.trafico_por_dia_semana : [])
    .map((row) => ({
      dia_semana_label: cleanText(row?.dia_semana_label, 'Sin datos'),
      total_citas: Math.max(0, toInt(row?.total_citas)),
    }))
    .filter((row) => row.total_citas > 0)
    .sort((left, right) => {
      const diff = toInt(right?.total_citas) - toInt(left?.total_citas);
      if (diff !== 0) return diff;
      return String(left?.dia_semana_label || '').localeCompare(String(right?.dia_semana_label || ''), 'es');
    });

  const topMembresiaVendida = ingresosPorMembresia.find((row) => toInt(row?.pagos_registrados) > 0) || null;
  const topServicioSolicitado = ingresosPorServicios.find((row) => toInt(row?.servicios_realizados) > 0) || null;
  const barberosPorServicios = [...productividadPorBarbero]
    .sort((left, right) => toInt(right?.servicios_realizados) - toInt(left?.servicios_realizados));
  const barberosPorNoShow = [...productividadPorBarbero].sort((left, right) => toInt(right?.no_show) - toInt(left?.no_show));
  const totalNoShowClientes = Math.max(0, toInt(concurrencia?.citas_vs_no_show?.total_no_show));
  const hasNoShowClientesBase = toInt(concurrencia?.citas_vs_no_show?.total_citas_base) > 0;

  return {
    ingresos_totales: {
      rows: hasRevenueScope ? buildSingleRow('Ingresos totales', formatMoney(kpis?.ingresos_totales_hnl)) : [],
    },
    ingresos_servicios: {
      rows: hasServicePaymentsScope ? buildSingleRow('Ingresos totales por servicios', formatMoney(kpis?.ingresos_servicios_hnl)) : [],
    },
    ingresos_membresias: {
      rows: hasSubscriptionPaymentsScope ? buildSingleRow('Ingresos totales por membresias', formatMoney(kpis?.ingresos_membresias_hnl)) : [],
    },
    membresia_mas_vendida: {
      rows: topMembresiaVendida && toInt(topMembresiaVendida?.pagos_registrados) > 0
        ? buildSingleRow(
          'Membresia mas vendida',
          `${topMembresiaVendida.nombre_plan} (${formatInteger(topMembresiaVendida.pagos_registrados)} ventas)`
        )
        : [],
    },
    servicio_mas_solicitado: {
      rows: topServicioSolicitado && toInt(topServicioSolicitado?.servicios_realizados) > 0
        ? buildSingleRow(
          'Servicio mas solicitado',
          `${topServicioSolicitado.nombre_servicio} (${formatInteger(topServicioSolicitado.servicios_realizados)} servicios)`
        )
        : [],
    },
    membresias_clientes_activos: {
      rows: hasClientsScope
        ? buildSingleRow('Total de clientes con membresia activa', formatInteger(kpis?.clientes_con_membresia_activa))
        : [],
    },
    membresias_activas_por_membresia: {
      rows: hasActivePlans && hasSubscriptionsScope
        ? suscripcionesPorMembresia.map((row) => ({
          label: row.nombre_plan,
          value: formatInteger(row?.suscripciones_activas),
        }))
        : [],
    },
    barberos_productividad: {
      rows: hasBarbersScope
        ? barberosPorServicios.map((row) => ({
          label: row.nombre_barbero,
          value: formatInteger(row?.servicios_realizados),
        }))
        : [],
    },
    barberos_servicios_por_barbero: {
      rows: hasBarbersScope
        ? barberosPorServicios.map((row) => ({
          // JK: No existe desglose servicio-barbero en el snapshot; se usa total de servicios por barbero.
          label: `Servicios totales - ${row.nombre_barbero}`,
          value: formatInteger(row?.servicios_realizados),
        }))
        : [],
    },
    barberos_citas_canceladas: {
      rows: [],
    },
    barberos_inasistencias: {
      rows: hasBarbersScope
        ? barberosPorNoShow.map((row) => ({
          label: row.nombre_barbero,
          value: formatInteger(row?.no_show),
        }))
        : [],
    },
    cantidad_citas: {
      rows: hasAppointmentsInRange ? buildSingleRow('Cantidad de citas generadas', formatInteger(kpis?.total_citas)) : [],
    },
    concurrencia_horas_mayor_demanda: {
      rows: horasMayorDemanda.map((row) => ({
        label: row.hora_label,
        value: `${formatInteger(row?.total_citas)} citas`,
      })),
    },
    concurrencia_dia_mayor_demanda: {
      rows: diaMayorDemanda.map((row) => ({
        label: row.dia_semana_label,
        value: `${formatInteger(row?.total_citas)} citas`,
      })),
    },
    concurrencia_inasistencias_clientes: {
      rows: hasNoShowClientesBase
        ? buildSingleRow('Cantidad de inasistencias de clientes', formatInteger(totalNoShowClientes))
        : [],
    },
    concurrencia_ingresos_plataforma: {
      rows: [],
    },
  };
}

// JK: Construye las secciones del reporte respetando orden de submodulo en formato tabular uniforme.
function buildSelectedSections(snapshot, selectedKpiIds) {
  const dataMap = buildKpiDataMap(snapshot);
  const groupedSelections = new Map();
  const catalogById = new Map(
    KPI_GROUPS.flatMap((group) => group.items.map((item) => [item.id, { ...item, moduleType: group.moduleType, groupLabel: group.label }]))
  );

  selectedKpiIds.forEach((kpiId) => {
    const catalogItem = catalogById.get(kpiId);
    if (!catalogItem || catalogItem.disabled) return;

    if (!groupedSelections.has(catalogItem.moduleType)) {
      groupedSelections.set(catalogItem.moduleType, {
        moduleType: catalogItem.moduleType,
        label: catalogItem.groupLabel,
        items: [],
      });
    }

    const resolvedData = dataMap[catalogItem.id] || {};
    const resolvedRows = Array.isArray(resolvedData?.rows) ? resolvedData.rows : [];
    const normalizedRows = resolvedRows
      .map((row) => ({
        label: cleanText(row?.label, 'Sin datos'),
        value: normalizeCellValue(row?.value, '-'),
      }));
    const rowsForKpi = normalizedRows.length > 0 ? normalizedRows : [{ label: 'Sin datos', value: '-' }];

    rowsForKpi.forEach((row, rowIndex) => {
      groupedSelections.get(catalogItem.moduleType).items.push({
        id: `${catalogItem.id}_${rowIndex}`,
        label: row.label,
        value: row.value,
      });
    });
  });

  return KPI_GROUPS
    .map((group) => groupedSelections.get(group.moduleType))
    .filter((section) => section && Array.isArray(section.items) && section.items.length > 0);
}

// JK: Modelo de presentacion PDF por bloques KPI (titulo + descripcion + tabla independiente).
function buildSelectedPdfSections(snapshot, selectedKpiIds) {
  const dataMap = buildKpiDataMap(snapshot);
  const groupedSelections = new Map();
  const catalogById = new Map(
    KPI_GROUPS.flatMap((group) => group.items.map((item) => [item.id, { ...item, moduleType: group.moduleType, groupLabel: group.label }]))
  );

  selectedKpiIds.forEach((kpiId) => {
    const catalogItem = catalogById.get(kpiId);
    if (!catalogItem || catalogItem.disabled) return;

    if (!groupedSelections.has(catalogItem.moduleType)) {
      groupedSelections.set(catalogItem.moduleType, {
        moduleType: catalogItem.moduleType,
        label: catalogItem.groupLabel,
        kpis: [],
      });
    }

    const resolvedData = dataMap[catalogItem.id] || {};
    const resolvedRows = Array.isArray(resolvedData?.rows) ? resolvedData.rows : [];
    const columns = PDF_TABLE_COLUMNS_BY_KPI[catalogItem.id] || DEFAULT_PDF_TABLE_COLUMNS;

    groupedSelections.get(catalogItem.moduleType).kpis.push({
      id: catalogItem.id,
      title: cleanText(catalogItem.label, 'Indicador'),
      description: cleanText(KPI_DESCRIPTIONS[catalogItem.id], 'Detalle del indicador para el periodo seleccionado.'),
      columns,
      rows: buildPdfRowsForKpi(catalogItem.id, resolvedRows),
    });
  });

  return KPI_GROUPS
    .map((group) => groupedSelections.get(group.moduleType))
    .filter((section) => section && Array.isArray(section.kpis) && section.kpis.length > 0);
}

// JK: Preselecciona solo KPIs habilitados del submodulo activo al abrir el modal.
function getDefaultSelectedKpisForModule(moduleType) {
  const moduleGroup = KPI_GROUPS.find((group) => group.moduleType === moduleType);
  return Array.isArray(moduleGroup?.items)
    ? moduleGroup.items.filter((item) => !item.disabled).map((item) => item.id)
    : [];
}

function buildCsvContent({ title, dateFrom, dateTo, sections }) {
  const lines = [];
  lines.push(csvEscape(title));
  lines.push(`fecha_desde,${csvEscape(dateFrom)}`);
  lines.push(`fecha_hasta,${csvEscape(dateTo)}`);
  lines.push('');
  sections.forEach((section) => {
    lines.push(`# ${section.label}`);
    lines.push('Indicador,Valor');
    section.items.forEach((item) => {
      lines.push(`${csvEscape(item.label)},${csvEscape(item.value)}`);
    });
    lines.push('');
  });
  return `${lines.join('\n')}\n`;
}

function buildExcelHtml({ title, generatedAt, dateFrom, dateTo, sections }) {
  const sectionHtml = sections
    .map((section) => `
      <h3>${escapeHtml(section.label)}</h3>
      <table>
        <thead><tr><th>Indicador</th><th>Valor</th></tr></thead>
        <tbody>
          ${section.items
            .map((item) => `<tr><td>${escapeHtml(item.label)}</td><td>${escapeHtml(item.value)}</td></tr>`)
            .join('')}
        </tbody>
      </table>
    `)
    .join('');

  // JK: Encabezado simplificado sin selector de tipo de exportacion.
  return `
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          body { font-family: Arial, sans-serif; color: #111827; margin: 20px; }
          h1 { font-size: 22px; margin: 0 0 8px; }
          h2 { font-size: 14px; margin: 0 0 16px; color: #4b5563; font-weight: normal; }
          h3 { margin: 18px 0 8px; font-size: 16px; color: #111827; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 12px; }
          th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 13px; }
          th { background: #f3f4f6; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <h2>Rango: ${escapeHtml(dateFrom)} a ${escapeHtml(dateTo)} | Generado: ${escapeHtml(generatedAt)}</h2>
        ${sectionHtml}
      </body>
    </html>
  `;
}

function downloadTextFile({ content, filename, mime }) {
  const blob = new Blob([content], { type: mime });
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(blobUrl);
}

// JK: Genera PDF con bloques KPI independientes, resumen ejecutivo y seccion inteligente de insights.
async function downloadPdfReport({ title, generatedAt, dateFrom, dateTo, userDisplayName, executiveSummaryRows, insightsData, sections }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 40;
  const marginTop = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - marginX * 2;
  const rightColumnX = marginX + contentWidth * 0.56;
  const leftColumnWidth = contentWidth * 0.54;
  const rightColumnWidth = contentWidth * 0.44;

  let cursorY = marginTop;

  function ensureSpace(requiredHeight) {
    if (cursorY + requiredHeight <= pageHeight - 40) return;
    doc.addPage();
    cursorY = marginTop;
  }

  // JK: Dibuja tablas con dos columnas reutilizables para resumen ejecutivo y bloques KPI.
  function drawTwoColumnTable({ columns, rows }) {
    const safeColumns = columns || DEFAULT_PDF_TABLE_COLUMNS;
    const safeRows = Array.isArray(rows) && rows.length > 0
      ? rows
      : [{ left: 'Sin datos', right: '-' }];

    ensureSpace(26);
    doc.setFillColor(243, 244, 246);
    doc.rect(marginX, cursorY, contentWidth, 22, 'F');
    doc.setDrawColor(209, 213, 219);
    doc.rect(marginX, cursorY, contentWidth, 22);
    doc.line(rightColumnX, cursorY, rightColumnX, cursorY + 22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(17, 24, 39);
    doc.text(cleanText(safeColumns?.left, 'Indicador'), marginX + 8, cursorY + 14);
    doc.text(cleanText(safeColumns?.right, 'Valor'), rightColumnX + 8, cursorY + 14);
    cursorY += 22;

    safeRows.forEach((row) => {
      const leftLines = doc.splitTextToSize(cleanText(row?.left, 'Sin datos'), leftColumnWidth - 16);
      const rightLines = doc.splitTextToSize(normalizeCellValue(row?.right, '-'), rightColumnWidth - 16);
      const rowHeight = Math.max(leftLines.length, rightLines.length) * 12 + 10;

      ensureSpace(rowHeight + 2);
      doc.setDrawColor(209, 213, 219);
      doc.rect(marginX, cursorY, contentWidth, rowHeight);
      doc.line(rightColumnX, cursorY, rightColumnX, cursorY + rowHeight);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(17, 24, 39);
      doc.text(leftLines, marginX + 8, cursorY + 14);
      doc.text(rightLines, rightColumnX + 8, cursorY + 14);
      cursorY += rowHeight;
    });
  }

  // JK: Renderiza listas de texto en formato bullet para insights, rankings y alertas.
  function drawBulletList({
    title: listTitle,
    items,
    bulletPrefix = '- ',
    emptyMessage = 'Sin datos para este apartado.',
    textColor = [75, 85, 99],
  }) {
    ensureSpace(40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(17, 24, 39);
    doc.text(cleanText(listTitle, 'Detalle'), marginX, cursorY);
    cursorY += 12;

    const safeItems = Array.isArray(items) && items.length > 0 ? items : [emptyMessage];
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...textColor);
    safeItems.forEach((item) => {
      const content = `${bulletPrefix}${cleanText(item, 'Sin datos')}`;
      const lines = doc.splitTextToSize(content, contentWidth - 6);
      const lineHeight = 12;
      ensureSpace(lines.length * lineHeight + 4);
      doc.text(lines, marginX + 2, cursorY + 10);
      cursorY += lines.length * lineHeight + 2;
    });
    cursorY += 6;
  }

  // JK: Inserta logo corporativo centrado por encima del titulo sin bloquear la exportacion si falla.
  try {
    const logo = await loadImageAsDataUrl(logoMF1);
    if (logo?.dataUrl && logo?.width > 0 && logo?.height > 0) {
      const maxLogoWidth = 160;
      const maxLogoHeight = 56;
      const scale = Math.min(maxLogoWidth / logo.width, maxLogoHeight / logo.height, 1);
      const logoWidth = logo.width * scale;
      const logoHeight = logo.height * scale;
      const logoX = (pageWidth - logoWidth) / 2;
      doc.addImage(logo.dataUrl, 'JPEG', logoX, cursorY, logoWidth, logoHeight);
      cursorY += logoHeight + 16;
    }
  } catch {
    // JK: Si el logo no carga, el reporte continua con encabezado textual.
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(title, marginX, cursorY);
  cursorY += 22;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(75, 85, 99);
  doc.text(`Rango: ${dateFrom} a ${dateTo} | Generado: ${generatedAt}`, marginX, cursorY);
  cursorY += 16;
  // JK: Muestra el usuario autenticado que genero el reporte.
  doc.text(`Usuario: ${String(userDisplayName || 'Usuario').trim() || 'Usuario'}`, marginX, cursorY);
  cursorY += 18;

  // JK: Bloque opcional de resumen ejecutivo al inicio del reporte.
  ensureSpace(70);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(17, 24, 39);
  doc.text('Resumen ejecutivo', marginX, cursorY);
  cursorY += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(75, 85, 99);
  const executiveLines = doc.splitTextToSize(
    'Vista general de los principales indicadores para el periodo seleccionado.',
    contentWidth - 4
  );
  doc.text(executiveLines, marginX + 2, cursorY + 10);
  cursorY += executiveLines.length * 12 + 8;
  drawTwoColumnTable({
    columns: DEFAULT_PDF_TABLE_COLUMNS,
    rows: executiveSummaryRows,
  });
  cursorY += 18;

  // JK: Seccion inteligente con interpretacion del periodo para facilitar decisiones de negocio.
  ensureSpace(80);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(17, 24, 39);
  doc.text('Insights del negocio', marginX, cursorY);
  cursorY += 14;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(75, 85, 99);
  const insightsIntroLines = doc.splitTextToSize(
    'Hallazgos automaticos del periodo para identificar comportamiento, riesgos y oportunidades.',
    contentWidth - 4
  );
  doc.text(insightsIntroLines, marginX + 2, cursorY + 10);
  cursorY += insightsIntroLines.length * 12 + 8;

  drawBulletList({
    title: 'Insights',
    items: insightsData?.insights,
    bulletPrefix: '- ',
    emptyMessage: 'No se detectaron insights relevantes para el periodo.',
  });
  drawBulletList({
    title: 'Rankings operativos',
    items: insightsData?.rankings,
    bulletPrefix: '- ',
    emptyMessage: 'No se detectaron rankings relevantes para el periodo.',
  });
  drawBulletList({
    title: 'Alertas',
    items: insightsData?.alerts,
    bulletPrefix: '- ALERTA: ',
    emptyMessage: 'Sin alertas criticas detectadas.',
    textColor: [153, 27, 27],
  });
  cursorY += 6;

  for (const section of sections) {
    ensureSpace(30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(17, 24, 39);
    doc.text(section.label, marginX, cursorY);
    cursorY += 16;

    const kpiBlocks = Array.isArray(section?.kpis) ? section.kpis : [];
    for (const kpiBlock of kpiBlocks) {
      ensureSpace(82);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(17, 24, 39);
      doc.text(cleanText(kpiBlock?.title, 'Indicador'), marginX, cursorY);
      cursorY += 12;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(75, 85, 99);
      const descriptionLines = doc.splitTextToSize(
        cleanText(kpiBlock?.description, 'Detalle del indicador para el periodo seleccionado.'),
        contentWidth - 4
      );
      doc.text(descriptionLines, marginX + 2, cursorY + 10);
      cursorY += descriptionLines.length * 11 + 8;

      drawTwoColumnTable({
        columns: kpiBlock?.columns || DEFAULT_PDF_TABLE_COLUMNS,
        rows: kpiBlock?.rows,
      });
      // JK: Separacion vertical entre KPI blocks para mejorar legibilidad del documento.
      cursorY += 18;
    }

    cursorY += 6;
  }

  doc.save(`reporte_personalizado_${dateFrom}_${dateTo}.pdf`);
}

export default function ReportesCustomReportModal({
  open,
  onOpenChange,
  defaultModuleType = 'ingresos',
  onRequestSnapshot,
}) {
  const notifications = useNotifications();
  const { user } = useAuth();
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [selectedKpiIds, setSelectedKpiIds] = useState([]);
  const [runningAction, setRunningAction] = useState('');
  // JK: Estado UX para bloquear acciones y mostrar progreso durante la generacion del reporte.
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  // JK: Nombre del usuario autenticado para encabezado de exportaciones.
  const userDisplayName = getUserDisplayName(user);
  // JK: Estado derivado del check global para marcar/desmarcar todos los KPIs habilitados.
  const allKpisChecked = ENABLED_KPI_IDS.length > 0 && ENABLED_KPI_IDS.every((id) => selectedKpiIds.includes(id));

  useEffect(() => {
    if (!open) return;
    // JK: Modal inicia sin fechas y con los KPIs del submodulo activo preseleccionados.
    setDateFrom(null);
    setDateTo(null);
    setSelectedKpiIds(getDefaultSelectedKpisForModule(defaultModuleType));
    setRunningAction('');
    setIsGeneratingReport(false);
  }, [defaultModuleType, open]);

  function toggleKpi(kpiId) {
    setSelectedKpiIds((current) => (
      current.includes(kpiId) ? current.filter((id) => id !== kpiId) : [...current, kpiId]
    ));
  }

  function toggleAllKpis(nextChecked) {
    setSelectedKpiIds(nextChecked ? [...ENABLED_KPI_IDS] : []);
  }

  async function handleGenerate(actionType) {
    if (!dateFrom || !dateTo) {
      notifications.warning('Selecciona fecha desde y fecha hasta para crear el reporte.');
      return;
    }
    if (dateFrom > dateTo) {
      notifications.warning('fecha_desde no puede ser mayor que fecha_hasta.');
      return;
    }
    if (selectedKpiIds.length === 0) {
      notifications.warning('Selecciona al menos un KPI para crear el reporte.');
      return;
    }

    setRunningAction(actionType);
    // JK: Activa loading UX compartido para todas las salidas del modal.
    setIsGeneratingReport(true);
    const loadingId = notifications.loading('Generando reporte...');
    try {
      const snapshot = await onRequestSnapshot({ fecha_desde: dateFrom, fecha_hasta: dateTo });
      const tabularSections = buildSelectedSections(snapshot, selectedKpiIds);
      const baseReportPayload = {
        title: 'Reporte Personalizado · MasterFade',
        generatedAt: new Date().toLocaleString('es-HN'),
        dateFrom,
        dateTo,
        userDisplayName,
      };

      if (tabularSections.length === 0) {
        throw new Error('No hay datos para los KPIs seleccionados en ese rango de fechas.');
      }

      if (actionType === 'csv') {
        const csv = buildCsvContent({
          ...baseReportPayload,
          sections: tabularSections,
        });
        downloadTextFile({
          content: csv,
          filename: `reporte_personalizado_${dateFrom}_${dateTo}.csv`,
          mime: 'text/csv;charset=utf-8;',
        });
      } else if (actionType === 'excel') {
        const html = buildExcelHtml({
          ...baseReportPayload,
          sections: tabularSections,
        });
        downloadTextFile({
          content: html,
          filename: `reporte_personalizado_${dateFrom}_${dateTo}.xls`,
          mime: 'application/vnd.ms-excel;charset=utf-8;',
        });
      } else {
        // JK: El PDF usa modelo de bloques por KPI para mejorar legibilidad ejecutiva.
        await downloadPdfReport({
          ...baseReportPayload,
          executiveSummaryRows: buildExecutiveSummaryRows(snapshot),
          insightsData: buildInsights(snapshot),
          sections: buildSelectedPdfSections(snapshot, selectedKpiIds),
        });
      }

      notifications.update(loadingId, {
        type: 'success',
        message: 'Reporte personalizado generado correctamente.',
        persist: false,
        // JK: Auto-cierre del toast de éxito a los 4 segundos.
        duration: 4000,
      });
    } catch (error) {
      notifications.update(loadingId, {
        type: 'error',
        message: extractMessage(error),
        persist: false,
        // JK: Restituye duración estándar de error al salir de estado loading persistente.
        duration: 7000,
      });
    } finally {
      setRunningAction('');
      setIsGeneratingReport(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-4xl">
        <DialogHeader className="pb-1">
          <DialogTitle>Crear Reporte</DialogTitle>
          <DialogDescription className="sr-only">
            Configura rango de fechas y selecciona indicadores para generar un reporte personalizado en CSV, Excel o PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[68vh] space-y-4 overflow-y-auto pr-1">
          {/* JK: Filtros base del reporte personalizado. */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="mf-label">Fecha desde</Label>
              <Input
                type="date"
                className="mf-input mt-1"
                value={dateFrom ?? ''}
                onChange={(event) => setDateFrom(event.target.value || null)}
              />
            </div>
            <div>
              <Label className="mf-label">Fecha hasta</Label>
              <Input
                type="date"
                className="mf-input mt-1"
                value={dateTo ?? ''}
                onChange={(event) => setDateTo(event.target.value || null)}
              />
            </div>
          </section>

          {/* JK: Selector de KPIs organizado por submodulos. */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--mf-text)]">Seleccione los indicadores que necesite para su reporte.</p>
              {/* JK: Check global del modal para seleccionar o limpiar todos los KPIs habilitados. */}
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--mf-text-2)]">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--mf-accent)]"
                  checked={allKpisChecked}
                  onChange={(event) => toggleAllKpis(event.target.checked)}
                />
                <span>{allKpisChecked ? 'DESMARCAR TODO' : 'MARCAR TODO'}</span>
              </label>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {KPI_GROUPS.map((group) => (
                <article key={group.moduleType} className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--mf-accent)]">{group.label}</p>
                  <div className="mt-2 space-y-2">
                    {group.items.map((item) => {
                      const isDisabled = Boolean(item?.disabled);
                      return (
                        <label
                          key={item.id}
                          className={`flex items-center gap-2 text-sm ${
                            isDisabled ? 'cursor-not-allowed text-[var(--mf-text-2)] opacity-70' : 'cursor-pointer text-[var(--mf-text)]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[var(--mf-accent)]"
                            checked={selectedKpiIds.includes(item.id)}
                            onChange={() => toggleKpi(item.id)}
                            disabled={isDisabled}
                          />
                          <span>{item.label}</span>
                          {isDisabled ? (
                            <span className="rounded-full border border-[var(--mf-nav-border)] bg-[var(--mf-bg)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]">
                              Proximamente
                            </span>
                          ) : null}
                        </label>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>

        {/* JK: Mensaje de progreso visible mientras se prepara cualquier formato de reporte. */}
        {isGeneratingReport ? (
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--mf-accent)]">Generando reporte...</p>
        ) : null}

        <DialogFooter className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => void handleGenerate('csv')}
            disabled={Boolean(runningAction) || isGeneratingReport}
          >
            {runningAction === 'csv' ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            Descargar CSV
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => void handleGenerate('excel')}
            disabled={Boolean(runningAction) || isGeneratingReport}
          >
            {runningAction === 'excel' ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
            Descargar Excel
          </Button>
          <Button
            className="gap-2"
            onClick={() => void handleGenerate('print')}
            disabled={Boolean(runningAction) || isGeneratingReport}
          >
            {runningAction === 'print' ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
            Imprimir (PDF)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
