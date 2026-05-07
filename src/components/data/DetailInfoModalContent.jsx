import {
  Building2,
  CalendarClock,
  CircleSmall,
  Clock3,
  KeyRound,
  Landmark,
  MapPin,
  Megaphone,
  Phone,
  Scissors,
  ShieldCheck,
  Tags,
  UserRound,
} from 'lucide-react';

function renderFieldIcon(label) {
  const normalized = String(label || '').trim().toLowerCase();
  if (normalized.includes('nombre')) return <UserRound size={13} />;
  if (normalized.includes('correo')) return <UserRound size={13} />;
  if (normalized.includes('origen')) return <UserRound size={13} />;
  if (normalized.includes('usuario')) return <UserRound size={13} />;
  if (normalized.includes('rol')) return <ShieldCheck size={13} />;
  if (normalized.includes('acceso')) return <KeyRound size={13} />;
  if (normalized.includes('estado')) return <KeyRound size={13} />;
  if (normalized.includes('sucursal')) return <Building2 size={13} />;
  if (normalized.includes('fecha')) return <CalendarClock size={13} />;
  if (normalized.includes('login')) return <Clock3 size={13} />;
  if (normalized.includes('telefono')) return <Phone size={13} />;
  if (normalized.includes('direccion')) return <MapPin size={13} />;
  if (normalized.includes('marketing')) return <Megaphone size={13} />;
  if (normalized.includes('salario')) return <Landmark size={13} />;
  if (normalized.includes('dni')) return <Tags size={13} />;
  if (normalized.includes('rtn')) return <Tags size={13} />;
  if (normalized.includes('barbero')) return <Scissors size={13} />;
  return <CircleSmall size={13} />;
}

function normalizeFieldValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  return value;
}

function DetailFieldRow({ label, value, span = 'normal' }) {
  const icon = renderFieldIcon(label);
  const content = normalizeFieldValue(value);
  const spanClass = span === 'full' ? 'sm:col-span-2 xl:col-span-3' : '';

  return (
    <article className={`border-b border-(--mf-nav-border)/70 py-2 ${spanClass}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-(--mf-text-2)">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-sm font-medium leading-relaxed text-(--mf-text) wrap-break-word">
        {content}
      </div>
    </article>
  );
}

export default function DetailInfoModalContent({ summary, sections = [] }) {
  return (
    <div className="space-y-2.5 sm:space-y-3">
      <section className="border-b border-(--mf-nav-border) pb-3 sm:pb-4">
        {/* AM: Cabecera compacta sin tarjeta para reducir altura visual del modal. */}
        <div className="flex items-start gap-2.5 sm:gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-(--mf-btn-border) bg-(--mf-btn-bg) text-(--mf-accent)">
            {summary?.icon || <UserRound size={16} />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-(--mf-text) sm:text-lg">
              {summary?.title || '-'}
            </p>
            <p className="mt-0.5 break-all text-xs text-(--mf-text-2) sm:text-sm">
              {summary?.subtitle || '-'}
            </p>
          </div>
          {summary?.badge ? <div className="shrink-0">{summary.badge}</div> : null}
        </div>
      </section>

      {/* AM: En mobile permitimos scroll interno; en desktop se mantiene visible sin scroll para lectura rapida. */}
      <div className="max-h-[64vh] overflow-y-auto pr-1 sm:max-h-none sm:overflow-visible">
        <div className="grid gap-2.5 sm:gap-3">
          {sections.map((section) => (
            <section key={section.id} className="border-b border-(--mf-nav-border)/85 pb-1.5">
              <div className="mb-1.5 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md border border-(--mf-btn-border) bg-(--mf-btn-bg) text-(--mf-accent)">
                  {section.icon || <CircleSmall size={14} />}
                </div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.13em] text-(--mf-accent)">
                  {section.title}
                </h3>
              </div>

              <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 xl:grid-cols-3">
                {section.fields.map((field) => (
                  <DetailFieldRow
                    key={`${section.id}-${field.label}`}
                    label={field.label}
                    value={field.value}
                    span={field.span}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
