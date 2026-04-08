import { useCallback, useEffect, useMemo, useState } from 'react';
import { Megaphone, Save, ShieldCheck, Building2, RotateCcw, Settings2 } from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import { Input } from '../../../components/ui/input.jsx';
import { Label } from '../../../components/ui/label.jsx';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import { listAdminSucursales } from '../lib/adminSucursalesApi.js';
import {
  getAdminConfigComunicacion,
  getAdminConfigParametros,
  updateAdminConfigComunicacion,
  updateAdminConfigParametros,
} from '../lib/adminConfiguracionApi.js';

function extractMessage(error) {
  return error?.data?.error?.message || error?.message || 'Error desconocido.';
}

const COMM_DEFAULTS = {
  marketing_habilitado: true,
  requiere_consentimiento: true,
  max_promos_semana: 3,
};

const PARAMS_DEFAULTS = {
  moneda_default: 'HNL',
  hold_minutos: 5,
  buffer_servicio_minutos: 5,
  no_show_min: 10,
};

function sanitizeCommunicationForm(values) {
  return {
    marketing_habilitado: Boolean(values.marketing_habilitado),
    requiere_consentimiento: Boolean(values.requiere_consentimiento),
    max_promos_semana: Number(values.max_promos_semana),
  };
}

function sanitizeParameterForm(values) {
  return {
    moneda_default: String(values.moneda_default || '').trim().toUpperCase(),
    hold_minutos: Number(values.hold_minutos),
    buffer_servicio_minutos: Number(values.buffer_servicio_minutos),
    no_show_min: Number(values.no_show_min),
  };
}

export default function AdminConfiguracionSpamPage() {
  const notifications = useNotifications();

  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [savingGlobalComm, setSavingGlobalComm] = useState(false);
  const [savingBranchComm, setSavingBranchComm] = useState(false);
  const [savingGlobalParams, setSavingGlobalParams] = useState(false);
  const [savingBranchParams, setSavingBranchParams] = useState(false);

  const [sucursales, setSucursales] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');

  const [consentimientos, setConsentimientos] = useState({
    total_clientes: 0,
    clientes_activos: 0,
    consentimiento_marketing_si: 0,
    consentimiento_marketing_no: 0,
    acepta_terminos_si: 0,
    acepta_terminos_no: 0,
  });
  const [globalComm, setGlobalComm] = useState(COMM_DEFAULTS);
  const [branchComm, setBranchComm] = useState(COMM_DEFAULTS);
  const [globalParams, setGlobalParams] = useState(PARAMS_DEFAULTS);
  const [branchParams, setBranchParams] = useState(PARAMS_DEFAULTS);

  const fetchSucursales = useCallback(async () => {
    const response = await listAdminSucursales();
    const payload = response?.data || response;
    const rows = Array.isArray(payload?.sucursales) ? payload.sucursales : [];
    const active = rows.filter((row) => row?.estado);
    setSucursales(active);
    if (active.length === 1) {
      setSelectedBranch((prev) => prev || active[0].id_sucursal);
    }
  }, []);

  const fetchConfig = useCallback(async (branchId) => {
    const [commResponse, paramsResponse] = await Promise.all([
      getAdminConfigComunicacion({ idSucursal: branchId || undefined }),
      getAdminConfigParametros({ idSucursal: branchId || undefined }),
    ]);

    const commData = commResponse?.data || commResponse;
    const paramsData = paramsResponse?.data || paramsResponse;

    setConsentimientos(commData?.consentimientos || {
      total_clientes: 0,
      clientes_activos: 0,
      consentimiento_marketing_si: 0,
      consentimiento_marketing_no: 0,
      acepta_terminos_si: 0,
      acepta_terminos_no: 0,
    });

    setGlobalComm({
      marketing_habilitado: Boolean(commData?.reglas_sistema?.marketing_habilitado ?? true),
      requiere_consentimiento: Boolean(commData?.reglas_sistema?.requiere_consentimiento ?? true),
      max_promos_semana: Number(commData?.reglas_sistema?.max_promos_semana ?? 3),
    });

    setBranchComm({
      marketing_habilitado: Boolean(commData?.reglas_sucursal?.marketing_habilitado ?? commData?.reglas_sistema?.marketing_habilitado ?? true),
      requiere_consentimiento: Boolean(commData?.reglas_sucursal?.requiere_consentimiento ?? commData?.reglas_sistema?.requiere_consentimiento ?? true),
      max_promos_semana: Number(commData?.reglas_sucursal?.max_promos_semana ?? commData?.reglas_sistema?.max_promos_semana ?? 3),
    });

    setGlobalParams({
      moneda_default: String(paramsData?.sistema?.moneda_default || 'HNL'),
      hold_minutos: Number(paramsData?.sistema?.hold_minutos ?? 5),
      buffer_servicio_minutos: Number(paramsData?.sistema?.buffer_servicio_minutos ?? 5),
      no_show_min: Number(paramsData?.sistema?.no_show_min ?? 10),
    });

    setBranchParams({
      moneda_default: String(paramsData?.sucursal?.moneda_default || paramsData?.sistema?.moneda_default || 'HNL'),
      hold_minutos: Number(paramsData?.sucursal?.hold_minutos ?? paramsData?.sistema?.hold_minutos ?? 5),
      buffer_servicio_minutos: Number(paramsData?.sucursal?.buffer_servicio_minutos ?? paramsData?.sistema?.buffer_servicio_minutos ?? 5),
      no_show_min: Number(paramsData?.sucursal?.no_show_min ?? paramsData?.sistema?.no_show_min ?? 10),
    });
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      await fetchSucursales();
      await fetchConfig(selectedBranch || '');
    } catch (error) {
      setListError(extractMessage(error));
    } finally {
      setLoading(false);
    }
  }, [fetchConfig, fetchSucursales, selectedBranch]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!loading) {
      void fetchConfig(selectedBranch || '').catch((error) => {
        setListError(extractMessage(error));
      });
    }
  }, [selectedBranch, fetchConfig, loading]);

  const subtitle = useMemo(() => {
    return 'Define reglas de comunicacion promocional y parametros base del sistema/sucursal.';
  }, []);

  function validateComm(values) {
    if (!Number.isInteger(values.max_promos_semana) || values.max_promos_semana < 0 || values.max_promos_semana > 30) {
      return 'max_promos_semana debe estar entre 0 y 30.';
    }
    return '';
  }

  function validateParams(values) {
    if (!/^[A-Z]{3}$/.test(values.moneda_default)) return 'moneda_default debe ser un codigo ISO de 3 letras.';
    if (!Number.isInteger(values.hold_minutos) || values.hold_minutos < 0 || values.hold_minutos > 240) return 'hold_minutos debe estar entre 0 y 240.';
    if (!Number.isInteger(values.buffer_servicio_minutos) || values.buffer_servicio_minutos < 0 || values.buffer_servicio_minutos > 240) return 'buffer_servicio_minutos debe estar entre 0 y 240.';
    if (!Number.isInteger(values.no_show_min) || values.no_show_min < 0 || values.no_show_min > 240) return 'no_show_min debe estar entre 0 y 240.';
    return '';
  }

  async function saveGlobalCommunication() {
    const values = sanitizeCommunicationForm(globalComm);
    const invalid = validateComm(values);
    if (invalid) {
      notifications.warning(invalid, { dedupeKey: 'config-comm-global-invalid' });
      return;
    }
    setSavingGlobalComm(true);
    try {
      await updateAdminConfigComunicacion({ reglas_sistema: values });
      notifications.success('Reglas globales de comunicacion actualizadas.', { dedupeKey: 'config-comm-global-ok' });
      await fetchConfig(selectedBranch || '');
    } catch (error) {
      notifications.error(extractMessage(error), { dedupeKey: 'config-comm-global-error' });
    } finally {
      setSavingGlobalComm(false);
    }
  }

  async function saveBranchCommunication() {
    if (!selectedBranch) {
      notifications.warning('Selecciona una sucursal para guardar reglas especificas.', { dedupeKey: 'config-comm-branch-required' });
      return;
    }
    const values = sanitizeCommunicationForm(branchComm);
    const invalid = validateComm(values);
    if (invalid) {
      notifications.warning(invalid, { dedupeKey: 'config-comm-branch-invalid' });
      return;
    }
    setSavingBranchComm(true);
    try {
      await updateAdminConfigComunicacion({ id_sucursal: selectedBranch, reglas_sucursal: values });
      notifications.success('Reglas de comunicacion por sucursal actualizadas.', { dedupeKey: 'config-comm-branch-ok' });
      await fetchConfig(selectedBranch);
    } catch (error) {
      notifications.error(extractMessage(error), { dedupeKey: 'config-comm-branch-error' });
    } finally {
      setSavingBranchComm(false);
    }
  }

  async function saveGlobalParameters() {
    const values = sanitizeParameterForm(globalParams);
    const invalid = validateParams(values);
    if (invalid) {
      notifications.warning(invalid, { dedupeKey: 'config-param-global-invalid' });
      return;
    }
    setSavingGlobalParams(true);
    try {
      await updateAdminConfigParametros({ scope: 'sistema', valores: values });
      notifications.success('Parametros base globales actualizados.', { dedupeKey: 'config-param-global-ok' });
      await fetchConfig(selectedBranch || '');
    } catch (error) {
      notifications.error(extractMessage(error), { dedupeKey: 'config-param-global-error' });
    } finally {
      setSavingGlobalParams(false);
    }
  }

  async function saveBranchParameters() {
    if (!selectedBranch) {
      notifications.warning('Selecciona una sucursal para guardar parametros especificos.', { dedupeKey: 'config-param-branch-required' });
      return;
    }
    const values = sanitizeParameterForm(branchParams);
    const invalid = validateParams(values);
    if (invalid) {
      notifications.warning(invalid, { dedupeKey: 'config-param-branch-invalid' });
      return;
    }
    setSavingBranchParams(true);
    try {
      await updateAdminConfigParametros({ scope: 'sucursal', id_sucursal: selectedBranch, valores: values });
      notifications.success('Parametros base por sucursal actualizados.', { dedupeKey: 'config-param-branch-ok' });
      await fetchConfig(selectedBranch);
    } catch (error) {
      notifications.error(extractMessage(error), { dedupeKey: 'config-param-branch-error' });
    } finally {
      setSavingBranchParams(false);
    }
  }

  return (
    <div className="space-y-4 px-2 pb-4 sm:px-4 sm:pb-6">
      {/* AM: Header de Configuracion con misma linea visual del resto de modulos administrativos. */}
      <header className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] px-4 py-4 sm:px-5 sm:py-5">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--mf-accent)]">Configuracion - Spam y Preferencias</p>
          <h1 className="mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Spam / Comunicacion</h1>
          <p className="text-sm text-[var(--mf-text-2)]">{subtitle}</p>
        </div>
      </header>

      {listError ? <ErrorBanner message={listError} onRetry={bootstrap} /> : null}
      {loading && !listError ? <LoadingSpinner /> : null}

      {!loading && !listError ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Clientes totales</p>
              <p className="mt-1 text-sm font-semibold text-[var(--mf-text)]">{consentimientos.total_clientes || 0}</p>
            </div>
            <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Marketing SI</p>
              <p className="mt-1 text-sm font-semibold text-emerald-300">{consentimientos.consentimiento_marketing_si || 0}</p>
            </div>
            <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Terminos SI</p>
              <p className="mt-1 text-sm font-semibold text-[var(--mf-text)]">{consentimientos.acepta_terminos_si || 0}</p>
            </div>
            <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Clientes activos</p>
              <p className="mt-1 text-sm font-semibold text-[var(--mf-text)]">{consentimientos.clientes_activos || 0}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--mf-accent)]">Contexto por sucursal</h2>
              <div className="flex items-center gap-2">
                <Label className="mf-label flex items-center gap-1.5"><Building2 size={12} /> Sucursal</Label>
                <select
                  className="mf-select h-9 min-w-[220px]"
                  value={selectedBranch}
                  onChange={(event) => setSelectedBranch(event.target.value)}
                >
                  <option value="">Sin sucursal (solo global)</option>
                  {sucursales.map((item) => (
                    <option key={item.id_sucursal} value={item.id_sucursal}>
                      {item.nombre_sucursal}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] p-4 sm:p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--mf-accent)]">Reglas globales de comunicacion</h3>
              <div className="mt-4 space-y-3">
                <label className="flex items-center gap-2 text-sm text-[var(--mf-text)]">
                  <input
                    type="checkbox"
                    checked={Boolean(globalComm.marketing_habilitado)}
                    onChange={(event) => setGlobalComm((prev) => ({ ...prev, marketing_habilitado: event.target.checked }))}
                  />
                  <span className="flex items-center gap-1.5"><Megaphone size={14} className="text-[var(--mf-accent)]" /> Marketing habilitado</span>
                </label>
                <label className="flex items-center gap-2 text-sm text-[var(--mf-text)]">
                  <input
                    type="checkbox"
                    checked={Boolean(globalComm.requiere_consentimiento)}
                    onChange={(event) => setGlobalComm((prev) => ({ ...prev, requiere_consentimiento: event.target.checked }))}
                  />
                  <span className="flex items-center gap-1.5"><ShieldCheck size={14} className="text-[var(--mf-accent)]" /> Requiere consentimiento marketing</span>
                </label>
                <div className="space-y-1.5">
                  <Label className="mf-label">Maximo promociones por semana</Label>
                  <Input
                    type="number"
                    min={0}
                    max={30}
                    value={globalComm.max_promos_semana}
                    onChange={(event) => setGlobalComm((prev) => ({ ...prev, max_promos_semana: event.target.value }))}
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button type="button" className="gap-2" onClick={saveGlobalCommunication} disabled={savingGlobalComm}>
                  <Save size={14} />
                  {savingGlobalComm ? 'Guardando...' : 'Guardar global'}
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] p-4 sm:p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--mf-accent)]">Reglas por sucursal</h3>
              <p className="mt-1 text-xs text-[var(--mf-text-2)]">Solo aplica cuando seleccionas una sucursal arriba.</p>
              <div className="mt-4 space-y-3">
                <label className="flex items-center gap-2 text-sm text-[var(--mf-text)]">
                  <input
                    type="checkbox"
                    checked={Boolean(branchComm.marketing_habilitado)}
                    onChange={(event) => setBranchComm((prev) => ({ ...prev, marketing_habilitado: event.target.checked }))}
                    disabled={!selectedBranch}
                  />
                  Marketing habilitado
                </label>
                <label className="flex items-center gap-2 text-sm text-[var(--mf-text)]">
                  <input
                    type="checkbox"
                    checked={Boolean(branchComm.requiere_consentimiento)}
                    onChange={(event) => setBranchComm((prev) => ({ ...prev, requiere_consentimiento: event.target.checked }))}
                    disabled={!selectedBranch}
                  />
                  Requiere consentimiento marketing
                </label>
                <div className="space-y-1.5">
                  <Label className="mf-label">Maximo promociones por semana</Label>
                  <Input
                    type="number"
                    min={0}
                    max={30}
                    value={branchComm.max_promos_semana}
                    onChange={(event) => setBranchComm((prev) => ({ ...prev, max_promos_semana: event.target.value }))}
                    disabled={!selectedBranch}
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button type="button" className="gap-2" onClick={saveBranchCommunication} disabled={savingBranchComm || !selectedBranch}>
                  <Save size={14} />
                  {savingBranchComm ? 'Guardando...' : 'Guardar sucursal'}
                </Button>
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] p-4 sm:p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--mf-accent)]">Parametros base globales</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="mf-label">Moneda</Label>
                  <Input value={globalParams.moneda_default} onChange={(event) => setGlobalParams((prev) => ({ ...prev, moneda_default: event.target.value }))} maxLength={3} />
                </div>
                <div className="space-y-1.5">
                  <Label className="mf-label">Hold minutos</Label>
                  <Input type="number" min={0} max={240} value={globalParams.hold_minutos} onChange={(event) => setGlobalParams((prev) => ({ ...prev, hold_minutos: event.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="mf-label">Buffer servicio</Label>
                  <Input type="number" min={0} max={240} value={globalParams.buffer_servicio_minutos} onChange={(event) => setGlobalParams((prev) => ({ ...prev, buffer_servicio_minutos: event.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="mf-label">No show minutos</Label>
                  <Input type="number" min={0} max={240} value={globalParams.no_show_min} onChange={(event) => setGlobalParams((prev) => ({ ...prev, no_show_min: event.target.value }))} />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button type="button" className="gap-2" onClick={saveGlobalParameters} disabled={savingGlobalParams}>
                  <Save size={14} />
                  {savingGlobalParams ? 'Guardando...' : 'Guardar global'}
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] p-4 sm:p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--mf-accent)]">Parametros base por sucursal</h3>
              <p className="mt-1 text-xs text-[var(--mf-text-2)]">Sobrescribe valores globales para una sucursal especifica.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="mf-label">Moneda</Label>
                  <Input value={branchParams.moneda_default} onChange={(event) => setBranchParams((prev) => ({ ...prev, moneda_default: event.target.value }))} maxLength={3} disabled={!selectedBranch} />
                </div>
                <div className="space-y-1.5">
                  <Label className="mf-label">Hold minutos</Label>
                  <Input type="number" min={0} max={240} value={branchParams.hold_minutos} onChange={(event) => setBranchParams((prev) => ({ ...prev, hold_minutos: event.target.value }))} disabled={!selectedBranch} />
                </div>
                <div className="space-y-1.5">
                  <Label className="mf-label">Buffer servicio</Label>
                  <Input type="number" min={0} max={240} value={branchParams.buffer_servicio_minutos} onChange={(event) => setBranchParams((prev) => ({ ...prev, buffer_servicio_minutos: event.target.value }))} disabled={!selectedBranch} />
                </div>
                <div className="space-y-1.5">
                  <Label className="mf-label">No show minutos</Label>
                  <Input type="number" min={0} max={240} value={branchParams.no_show_min} onChange={(event) => setBranchParams((prev) => ({ ...prev, no_show_min: event.target.value }))} disabled={!selectedBranch} />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" className="gap-2" onClick={bootstrap} disabled={savingBranchParams}>
                  <RotateCcw size={14} />
                  Recargar
                </Button>
                <Button type="button" className="gap-2" onClick={saveBranchParameters} disabled={savingBranchParams || !selectedBranch}>
                  <Settings2 size={14} />
                  {savingBranchParams ? 'Guardando...' : 'Guardar sucursal'}
                </Button>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
