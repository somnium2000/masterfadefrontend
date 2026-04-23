import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { House, Scissors } from 'lucide-react';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import EmptyState from '../../../components/data/EmptyState.jsx';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import ThemeSwitcher from '../../../components/theme/ThemeSwitcher.jsx';
import { listPublicCatalogBranches } from '../lib/catalogApi.js';
import { listPublicAgendaBarberos } from '../booking/publicBookingApi.js';
import { withImageVersion } from '../../../lib/imageCache.js';

function toSafeText(value) {
  return String(value || '').trim();
}

function truncateSummary(value) {
  const normalized = toSafeText(value);
  if (!normalized) return '';
  if (normalized.length <= 180) return normalized;
  return `${normalized.slice(0, 177)}...`;
}

function getInitials(name) {
  const chunks = String(name || '')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (!chunks.length) return 'MF';
  return chunks.map((chunk) => chunk[0]?.toUpperCase() || '').join('');
}

function BarberLandingCard({ barber }) {
  const [failedPhotoUrl, setFailedPhotoUrl] = useState('');
  const name = toSafeText(barber?.nombre_completo) || 'Barbero';
  const alias = toSafeText(barber?.alias_publico);
  const summary = truncateSummary(barber?.resumen_publico);
  const certs = Array.isArray(barber?.certificaciones_titulos)
    ? barber.certificaciones_titulos.map((item) => toSafeText(item)).filter(Boolean).slice(0, 4)
    : [];
  const photoUrl = withImageVersion(barber?.foto_perfil_url, barber?.foto_perfil_updated_at);
  const hasPhoto = Boolean(photoUrl) && failedPhotoUrl !== photoUrl;

  return (
    <article className="group relative isolate overflow-hidden rounded-3xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_90%,transparent)] p-3 shadow-[var(--mf-shadow-soft)] transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_28px_56px_rgba(0,0,0,0.32)] max-md:active:-translate-y-1 max-md:active:shadow-[0_24px_48px_rgba(0,0,0,0.3)] max-md:focus-within:-translate-y-1 max-md:focus-within:shadow-[0_24px_48px_rgba(0,0,0,0.3)] sm:p-4">
      <div className="pointer-events-none absolute inset-0 bg-[var(--mf-noise)] opacity-[0.025]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[color:color-mix(in_srgb,var(--mf-accent)_20%,transparent)] to-transparent opacity-85" />
      <div className="pointer-events-none absolute left-4 right-4 top-0 h-px bg-gradient-to-r from-transparent via-[var(--mf-accent)] to-transparent opacity-70 transition-all duration-500 group-hover:left-0 group-hover:right-0 group-hover:opacity-100" />

      <div className="relative overflow-hidden rounded-2xl border border-[color:color-mix(in_srgb,var(--mf-nav-border)_84%,white_6%)] bg-[var(--mf-btn-bg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="aspect-square">
          {hasPhoto ? (
            <img
              src={photoUrl}
              alt={name}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.06] group-active:scale-[1.06] group-focus-within:scale-[1.06]"
              loading="lazy"
              onError={() => setFailedPhotoUrl(photoUrl)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,_color-mix(in_srgb,var(--mf-accent)_18%,transparent),_transparent_55%)] text-2xl font-semibold text-[var(--mf-text)]">
              {getInitials(name)}
            </div>
          )}
          <div className="pointer-events-none absolute inset-y-0 left-[-45%] w-[36%] rotate-[16deg] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.28),transparent)] opacity-0 transition-all duration-700 group-hover:left-[125%] group-hover:opacity-90 group-active:left-[125%] group-active:opacity-90 group-focus-within:left-[125%] group-focus-within:opacity-90" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-70 transition-opacity duration-300 group-hover:opacity-85 group-active:opacity-85 group-focus-within:opacity-85" />
        </div>
      </div>

      <div className="mt-4 min-w-0 px-0.5 text-center">
        <h3 className="mf-font-display text-xl leading-tight tracking-[0.01em] text-[var(--mf-text)] drop-shadow-[0_2px_12px_rgba(0,0,0,0.26)] sm:text-[1.35rem]">
          {name}
        </h3>
        <p className="mf-font-display mt-1.5 inline-flex max-w-full rounded-full border border-[color:color-mix(in_srgb,var(--mf-accent)_36%,var(--mf-nav-border))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--mf-accent)_17%,transparent),color-mix(in_srgb,var(--mf-accent)_10%,transparent))] px-3 py-1 text-[11px] tracking-[0.08em] text-[var(--mf-accent)]">
          {alias || 'Barbero profesional'}
        </p>
        {summary ? (
          <p
            className="mt-3 text-sm leading-6 text-[color:color-mix(in_srgb,var(--mf-text-2)_90%,white_8%)]"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {summary}
          </p>
        ) : null}
        {certs.length ? (
          <div className="mt-3.5 flex flex-wrap justify-center gap-2">
            {certs.map((cert) => (
              <span
                key={`${name}-${cert}`}
                className="inline-flex rounded-full border border-[color:color-mix(in_srgb,var(--mf-accent)_24%,var(--mf-btn-border))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--mf-btn-bg)_90%,white_5%),color-mix(in_srgb,var(--mf-btn-bg)_96%,transparent))] px-2.5 py-1 text-[11px] font-medium text-[color:color-mix(in_srgb,var(--mf-text)_90%,white_10%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.09)]"
              >
                {cert}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function mergeBarbersById(barbers) {
  const map = new Map();
  (Array.isArray(barbers) ? barbers : []).forEach((barber) => {
    const id = toSafeText(barber?.id_empleado);
    if (!id) return;
    if (!map.has(id)) {
      map.set(id, barber);
      return;
    }
    const current = map.get(id);
    map.set(id, {
      ...current,
      ...barber,
      certificaciones_titulos: (Array.isArray(barber?.certificaciones_titulos) && barber.certificaciones_titulos.length)
        ? barber.certificaciones_titulos
        : current?.certificaciones_titulos || [],
      resumen_publico: toSafeText(barber?.resumen_publico) || current?.resumen_publico || '',
      alias_publico: toSafeText(barber?.alias_publico) || current?.alias_publico || '',
      foto_perfil_url: toSafeText(barber?.foto_perfil_url) || current?.foto_perfil_url || '',
      foto_perfil_updated_at: barber?.foto_perfil_updated_at || current?.foto_perfil_updated_at || null,
      visible_en_landing: Boolean(barber?.visible_en_landing || current?.visible_en_landing),
    });
  });
  return Array.from(map.values());
}

export default function BarbersLandingPage() {
  const [status, setStatus] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [barbers, setBarbers] = useState([]);

  const loadBarbers = useCallback(async () => {
    setStatus('loading');
    setErrorMessage('');
    try {
      const branchPayload = await listPublicCatalogBranches();
      const branchIds = Array.isArray(branchPayload?.branches)
        ? [...new Set(branchPayload.branches.map((branch) => toSafeText(branch?.id_sucursal)).filter(Boolean))]
        : [];

      if (!branchIds.length) {
        setBarbers([]);
        setStatus('success');
        return;
      }

      const settled = await Promise.allSettled(
        branchIds.map((idSucursal) => listPublicAgendaBarberos({ id_sucursal: idSucursal }))
      );

      const merged = mergeBarbersById(
        settled
          .filter((result) => result.status === 'fulfilled')
          .flatMap((result) => (Array.isArray(result.value?.data?.barberos) ? result.value.data.barberos : []))
      );

      const visibleBarbers = merged
        .filter((barber) => Boolean(barber?.visible_en_landing))
        .sort((left, right) => toSafeText(left?.nombre_completo).localeCompare(toSafeText(right?.nombre_completo), 'es-HN'));

      setBarbers(visibleBarbers);
      setStatus('success');
    } catch {
      setErrorMessage('No se pudo cargar el listado de barberos en este momento.');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void loadBarbers();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loadBarbers]);

  const skeletonCards = useMemo(
    () => Array.from({ length: 6 }, (_, index) => ({ id: `skeleton-${index}` })),
    []
  );

  return (
    <div className="mf-page-gradient min-h-screen">
      <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
        <header className="mb-6 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--mf-accent)]">Equipo</p>
            <h1 className="mf-font-display mt-2 text-4xl leading-none text-[var(--mf-text)] sm:text-5xl">Barberos</h1>
            <p className="mt-2 text-sm text-[var(--mf-text-2)]">Conoce a nuestros barberos destacados.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/" className="inline-flex items-center gap-2 rounded-full border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2 text-xs text-[var(--mf-text)]">
              <House size={14} />
              Inicio
            </Link>
            <ThemeSwitcher />
          </div>
        </header>

        {status === 'error' ? <ErrorBanner message={errorMessage} onRetry={loadBarbers} /> : null}
        {status === 'loading' ? (
          <section className="space-y-4">
            <LoadingSpinner />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {skeletonCards.map((item) => (
                <article key={item.id} className="animate-pulse rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4">
                  <div className="aspect-square rounded-xl bg-[color:color-mix(in_srgb,var(--mf-card)_78%,transparent)]" />
                  <div className="mt-3 h-4 w-3/4 rounded bg-[color:color-mix(in_srgb,var(--mf-card)_75%,transparent)]" />
                  <div className="mt-2 h-3 w-1/2 rounded bg-[color:color-mix(in_srgb,var(--mf-card)_65%,transparent)]" />
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {status === 'success' && !barbers.length ? (
          <EmptyState
            icon={Scissors}
            title="Sin barberos visibles"
            description="Aun no hay barberos marcados para la landing publica."
          />
        ) : null}

        {status === 'success' && barbers.length ? (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {barbers.map((barber) => (
              <BarberLandingCard key={barber.id_empleado} barber={barber} />
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}
