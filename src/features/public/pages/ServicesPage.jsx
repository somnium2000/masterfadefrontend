import { motion } from 'framer-motion';
import {
  CalendarDays,
  Clock3,
  House,
  LogIn,
  Plus,
  Scissors,
  Sparkles,
  Tag,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MasterfadeLogo from '../../../components/branding/MasterfadeLogo.jsx';
import PremiumBottomNav from '../../../components/navigation/PremiumBottomNav.jsx';
import ThemeSwitcher from '../../../components/theme/ThemeSwitcher.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { getPublicCatalog } from '../lib/catalogApi.js';

function formatPrice(value) {
  const amount = Number(value ?? 0);
  return `L.${Number.isFinite(amount) ? Math.round(amount) : 0}`;
}

function ServiceCard({ item, compact = false }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="mf-glass-surface rounded-[28px] p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
            {compact ? 'Informativo' : 'Servicio'}
          </p>
          <h3 className="mf-font-display mt-3 text-[28px] leading-[0.95] text-[var(--mf-text)]">
            {item.nombre_servicio}
          </h3>
        </div>

        <div className="rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 py-2 text-sm font-semibold text-[var(--mf-accent)]">
          {formatPrice(item.precio_hnl)}
        </div>
      </div>

      {item.descripcion ? (
        <p className="mt-4 text-sm leading-6 text-[var(--mf-text-2)]">{item.descripcion}</p>
      ) : null}

      {!compact ? (
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-[var(--mf-nav-border)] px-3 py-2 text-xs uppercase tracking-[0.14em] text-[var(--mf-text-2)]">
          <Clock3 size={14} strokeWidth={1.8} />
          <span>{item.duracion_min} min</span>
        </div>
      ) : null}
    </motion.article>
  );
}

function PackageCard({ item }) {
  const details = Array.isArray(item.items) ? item.items : [];

  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="mf-glass-surface rounded-[28px] p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
            Paquete
          </p>
          <h3 className="mf-font-display mt-3 text-[28px] leading-[0.95] text-[var(--mf-text)]">
            {item.nombre_paquete}
          </h3>
        </div>

        <div className="rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 py-2 text-sm font-semibold text-[var(--mf-accent)]">
          {formatPrice(item.precio_hnl)}
        </div>
      </div>

      {item.descripcion ? (
        <p className="mt-4 text-sm leading-6 text-[var(--mf-text-2)]">{item.descripcion}</p>
      ) : null}

      <div className="mt-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-text-2)]">
          Incluye
        </p>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--mf-text)]">
          {details.map((detail) => (
            <li key={`${item.id_paquete}-${detail.id_servicio}`} className="flex items-start gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--mf-accent)]" />
              <span>
                {detail.nombre_servicio}
                {detail.cantidad > 1 ? ` x${detail.cantidad}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </motion.article>
  );
}

function CatalogSection({ icon: Icon, title, eyebrow, items, emptyMessage, children }) {
  return (
    <section className="mt-8">
      <div className="flex items-center gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-accent)]">
          <Icon size={18} strokeWidth={1.9} />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">{eyebrow}</p>
          <h2 className="mf-font-display text-[30px] leading-none text-[var(--mf-text)]">{title}</h2>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="mt-5 grid gap-4">{children}</div>
      ) : (
        <div className="mf-glass-surface mt-5 rounded-[24px] p-5 text-sm leading-6 text-[var(--mf-text-2)]">
          {emptyMessage}
        </div>
      )}
    </section>
  );
}

export default function ServicesPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [status, setStatus] = useState('loading');
  const [services, setServices] = useState([]);
  const [packages, setPackages] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadCatalog() {
      setStatus('loading');
      setErrorMessage('');

      try {
        const result = await getPublicCatalog();

        if (!isMounted) {
          return;
        }

        setServices(result.services);
        setPackages(result.packages);
        setStatus('success');
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(error?.data?.error?.message || error?.message || 'No se pudo cargar el catalogo.');
        setStatus('error');
      }
    }

    void loadCatalog();

    return () => {
      isMounted = false;
    };
  }, []);

  function handleAgendar() {
    navigate(isAuthenticated ? '/home' : '/login');
  }

  const barberServices = services.filter((item) => item.grupo_catalogo === 'barberia');
  const otherServices = services.filter((item) => item.grupo_catalogo === 'otros');

  const navItems = [
    { id: 'inicio', label: 'Inicio', icon: House, onClick: () => navigate('/') },
    { id: 'servicios', label: 'Servicios', icon: Scissors, onClick: () => navigate('/servicios') },
    {
      id: 'login',
      label: isAuthenticated ? 'Mi panel' : 'Iniciar sesiÃ³n',
      icon: LogIn,
      onClick: () => navigate(isAuthenticated ? '/home' : '/login'),
    },
    { id: 'promociones', label: 'Promociones', icon: Tag, disabled: true },
  ];

  return (
    <div className="mf-page-gradient min-h-screen pb-[100px]">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 pb-10 pt-4 sm:px-8">
        <header className="flex items-start justify-between gap-6">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-4 py-2 text-sm text-[var(--mf-text)] transition-colors duration-200 hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_70%,white_12%)]"
          >
            <House size={16} strokeWidth={1.8} />
            <span>Volver al inicio</span>
          </button>

          <ThemeSwitcher />
        </header>

        <main className="mx-auto mt-8 w-full max-w-4xl">
          <div className="flex flex-col items-center text-center">
            <MasterfadeLogo variant="compact" />
            <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
              Catalogo publico
            </p>
            <h1 className="mf-font-display mt-4 text-[42px] leading-[0.92] text-[var(--mf-text)]">
              Servicios y experiencias premium
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--mf-text-2)]">
              Explora barberia, servicios informativos y paquetes. El sistema conserva el tema premium y deja listo el
              catalogo para la agenda de fases posteriores.
            </p>
          </div>

          {status === 'loading' ? (
            <div className="mf-glass-surface mt-8 rounded-[28px] p-6 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
                Cargando catalogo
              </p>
              <p className="mt-4 text-sm leading-6 text-[var(--mf-text-2)]">
                Estamos consultando servicios y paquetes disponibles.
              </p>
            </div>
          ) : null}

          {status === 'error' ? (
            <div className="mf-glass-surface mt-8 rounded-[28px] p-6 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
                Error de catalogo
              </p>
              <p className="mt-4 text-sm leading-6 text-[var(--mf-text-2)]">{errorMessage}</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mf-accent-gradient mt-6 inline-flex h-11 items-center justify-center rounded-2xl px-5 text-sm font-semibold shadow-[var(--mf-shadow-accent)]"
              >
                Reintentar
              </button>
            </div>
          ) : null}

          {status === 'success' ? (
            <>
              <CatalogSection
                icon={Scissors}
                eyebrow="Barberia"
                title="Servicios"
                items={barberServices}
                emptyMessage="Aun no hay servicios de barberia visibles."
              >
                {barberServices.map((item) => (
                  <ServiceCard key={item.id_servicio} item={item} />
                ))}
              </CatalogSection>

              <CatalogSection
                icon={Sparkles}
                eyebrow="Informativo"
                title="Otros servicios"
                items={otherServices}
                emptyMessage="Aun no hay otros servicios visibles."
              >
                {otherServices.map((item) => (
                  <ServiceCard key={item.id_servicio} item={item} compact />
                ))}
              </CatalogSection>

              <CatalogSection
                icon={CalendarDays}
                eyebrow="Experiencias"
                title="Combos / Paquetes"
                items={packages}
                emptyMessage="Aun no hay paquetes visibles."
              >
                {packages.map((item) => (
                  <PackageCard key={item.id_paquete} item={item} />
                ))}
              </CatalogSection>
            </>
          ) : null}
        </main>
      </div>

      <PremiumBottomNav
        activeId="servicios"
        sideItems={navItems}
        fabItem={{ id: 'agendar', label: 'Agendar', icon: Plus, onClick: handleAgendar }}
      />
    </div>
  );
}
