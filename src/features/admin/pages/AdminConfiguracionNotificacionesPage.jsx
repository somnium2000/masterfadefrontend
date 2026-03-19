import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, MailCheck, MailWarning, RotateCcw, Save, Send, TimerReset } from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import { Input } from '../../../components/ui/input.jsx';
import { Label } from '../../../components/ui/label.jsx';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../../components/ui/table.jsx';
import EmptyState from '../../../components/data/EmptyState.jsx';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import { getAdminConfigNotificaciones, updateAdminConfigNotificaciones } from '../lib/adminConfiguracionApi.js';

function extractMessage(error) {
  return error?.data?.error?.message || error?.message || 'Error desconocido.';
}

function formatDateTime(value) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleString();
}

const FORM_DEFAULTS = {
  email_habilitado: true,
  reintentos_max: 3,
  reintento_delay_min: 10,
};

export default function AdminConfiguracionNotificacionesPage() {
  const notifications = useNotifications();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [listError, setListError] = useState('');
  const [payload, setPayload] = useState(null);
  const [form, setForm] = useState(FORM_DEFAULTS);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      const response = await getAdminConfigNotificaciones({ limit: 25 });
      const data = response?.data || response;
      setPayload(data || null);
      setForm({
        email_habilitado: Boolean(data?.configuracion?.email_habilitado ?? true),
        reintentos_max: Number(data?.configuracion?.reintentos_max ?? 3),
        reintento_delay_min: Number(data?.configuracion?.reintento_delay_min ?? 10),
      });
    } catch (error) {
      setListError(extractMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const summary = payload?.resumen || { total: 0, enviadas: 0, pendientes: 0, fallidas: 0 };
  const recientes = Array.isArray(payload?.recientes) ? payload.recientes : [];

  const subtitle = useMemo(() => {
    return 'Controla configuracion base de emails y monitorea entregas recientes del sistema.';
  }, []);

  async function handleSave() {
    const reintentos = Number(form.reintentos_max);
    const delay = Number(form.reintento_delay_min);

    if (!Number.isInteger(reintentos) || reintentos < 0 || reintentos > 10) {
      notifications.warning('reintentos_max debe estar entre 0 y 10.', { dedupeKey: 'config-notif-retry-invalid' });
      return;
    }
    if (!Number.isInteger(delay) || delay < 0 || delay > 120) {
      notifications.warning('reintento_delay_min debe estar entre 0 y 120.', { dedupeKey: 'config-notif-delay-invalid' });
      return;
    }

    setSaving(true);
    try {
      const response = await updateAdminConfigNotificaciones({
        email_habilitado: Boolean(form.email_habilitado),
        reintentos_max: reintentos,
        reintento_delay_min: delay,
      });
      const data = response?.data || response;
      setPayload(data || null);
      notifications.success('Configuracion de notificaciones actualizada.', { dedupeKey: 'config-notif-save-ok' });
    } catch (error) {
      notifications.error(extractMessage(error), { dedupeKey: 'config-notif-save-error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 px-2 pb-4 sm:px-4 sm:pb-6">
      {/* AM: Header consistente con patron de modulos operativos del admin. */}
      <header className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] px-4 py-4 sm:px-5 sm:py-5">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--mf-accent)]">Configuracion - Notificaciones</p>
          <h1 className="mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Notificaciones</h1>
          <p className="text-sm text-[var(--mf-text-2)]">{subtitle}</p>
        </div>
      </header>

      {listError ? <ErrorBanner message={listError} onRetry={fetchData} /> : null}
      {loading && !listError ? <LoadingSpinner /> : null}

      {!loading && !listError ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Total</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-[var(--mf-text)]"><Bell size={14} className="text-[var(--mf-accent)]" />{summary.total || 0}</p>
            </div>
            <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Enviadas</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-emerald-300"><Send size={14} />{summary.enviadas || 0}</p>
            </div>
            <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Pendientes</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-amber-300"><TimerReset size={14} />{summary.pendientes || 0}</p>
            </div>
            <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Fallidas</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-rose-300"><MailWarning size={14} />{summary.fallidas || 0}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] p-4 sm:p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--mf-accent)]">Configuracion base de email</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className="flex items-center gap-2 rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 py-2 text-sm text-[var(--mf-text)]">
                <input
                  type="checkbox"
                  checked={Boolean(form.email_habilitado)}
                  onChange={(event) => setForm((prev) => ({ ...prev, email_habilitado: event.target.checked }))}
                />
                <span className="flex items-center gap-1.5"><MailCheck size={14} className="text-[var(--mf-accent)]" /> Email habilitado</span>
              </label>

              <div className="space-y-1.5">
                <Label className="mf-label">Reintentos maximos</Label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={form.reintentos_max}
                  onChange={(event) => setForm((prev) => ({ ...prev, reintentos_max: event.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="mf-label">Espera entre reintentos (min)</Label>
                <Input
                  type="number"
                  min={0}
                  max={120}
                  value={form.reintento_delay_min}
                  onChange={(event) => setForm((prev) => ({ ...prev, reintento_delay_min: event.target.value }))}
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={fetchData} disabled={saving} className="gap-2">
                <RotateCcw size={14} />
                Recargar
              </Button>
              <Button type="button" className="gap-2" onClick={handleSave} disabled={saving}>
                <Save size={14} />
                {saving ? 'Guardando...' : 'Guardar configuracion'}
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] p-4 sm:p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--mf-accent)]">Historial reciente de notificaciones</h2>
            {recientes.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  icon={Bell}
                  title="Sin notificaciones registradas"
                  description="Aun no hay eventos en notificaciones_email para mostrar en historial."
                />
              </div>
            ) : (
              <div className="mt-3 mf-table-wrap">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[var(--mf-nav-border)]">
                      <TableHead className="text-[11px] uppercase tracking-[0.1em] text-[var(--mf-accent)]">Evento</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-[0.1em] text-[var(--mf-accent)]">Destino</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-[0.1em] text-[var(--mf-accent)]">Estado</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-[0.1em] text-[var(--mf-accent)]">Creada</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-[0.1em] text-[var(--mf-accent)]">Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recientes.map((item) => (
                      <TableRow key={item.id_notificacion} className="border-[var(--mf-nav-border)]">
                        <TableCell className="font-medium text-[var(--mf-text)]">{item.evento || 'sin_evento'}</TableCell>
                        <TableCell className="max-w-[220px] truncate text-[var(--mf-text-2)]">{item.correo_destino || 'Sin destino'}</TableCell>
                        <TableCell className="text-[var(--mf-text-2)]">{item.estado_notificacion_codigo || 'sin_estado'}</TableCell>
                        <TableCell className="text-[var(--mf-text-2)]">{formatDateTime(item.created_at)}</TableCell>
                        <TableCell className="max-w-[220px] truncate text-rose-300">{item.ultimo_error || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
