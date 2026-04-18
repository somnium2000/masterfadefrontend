export const PLAN_CATEGORY_MIN = 1;
export const PLAN_CATEGORY_MAX = 5;
export const DEFAULT_PLAN_CATEGORY = 1;

const CATEGORY_BASE = [
  {
    value: 1,
    label: "Classic",
    helper: "Acceso premium de entrada.",
    spotlight: "Classic",
    accent: "#D8AF67",
    glow: "rgba(204, 163, 92, 0.45)",
  },
  {
    value: 2,
    label: "Silver",
    helper: "Beneficios equilibrados para clientes frecuentes.",
    spotlight: "Silver",
    accent: "#4EB6C7",
    glow: "rgba(78, 182, 199, 0.44)",
  },
  {
    value: 3,
    label: "Platinum",
    helper: "Balance alto de valor y estatus.",
    spotlight: "Platinum",
    accent: "#768CF6",
    glow: "rgba(118, 140, 246, 0.46)",
  },
  {
    value: 4,
    label: "Prestige",
    helper: "Experiencia exclusiva con enfoque distintivo.",
    spotlight: "Prestige",
    accent: "#E1A05F",
    glow: "rgba(225, 160, 95, 0.47)",
  },
  {
    value: 5,
    label: "Diamond",
    helper: "Maximo nivel de prestigio MasterFade.",
    spotlight: "Diamond",
    accent: "#F0C270",
    glow: "rgba(240, 194, 112, 0.52)",
  },
];

export const PLAN_CATEGORY_OPTIONS = CATEGORY_BASE.map((item) => ({
  value: item.value,
  label: item.label,
  helper: item.helper,
  spotlight: item.spotlight,
}));

function buildTheme(item) {
  const { value, label, helper, accent, glow } = item;
  return {
    level: value,
    label,
    helper,
    badgeTone: `color-mix(in srgb, ${accent} 18%, var(--mf-btn-bg) 82%)`,
    badgeBorder: `color-mix(in srgb, ${accent} 52%, var(--mf-btn-border) 48%)`,
    badgeColor: `color-mix(in srgb, ${accent} 74%, var(--mf-text) 26%)`,
    cardBorder: `color-mix(in srgb, ${accent} 46%, var(--mf-nav-border) 54%)`,
    cardGradient: `
      radial-gradient(circle at 17% -11%, color-mix(in srgb, ${accent} 34%, transparent) 0%, transparent 44%),
      linear-gradient(
        155deg,
        color-mix(in srgb, var(--mf-card) 88%, ${accent} 12%) 0%,
        color-mix(in srgb, var(--mf-bg) 88%, ${accent} 12%) 100%
      )
    `,
    glow: `0 26px 48px -34px ${glow}`,
    iconColor: `color-mix(in srgb, ${accent} 70%, var(--mf-text) 30%)`,
    accentColor: `color-mix(in srgb, ${accent} 74%, var(--mf-text) 26%)`,
  };
}

const PLAN_CATEGORY_THEME_MAP = CATEGORY_BASE.reduce((acc, item) => {
  acc[item.value] = buildTheme(item);
  return acc;
}, {});

export function normalizePlanCategory(value, fallback = DEFAULT_PLAN_CATEGORY) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < PLAN_CATEGORY_MIN || parsed > PLAN_CATEGORY_MAX) return fallback;
  return parsed;
}

export function getPlanCategoryTheme(value) {
  const level = normalizePlanCategory(value, DEFAULT_PLAN_CATEGORY);
  return PLAN_CATEGORY_THEME_MAP[level] || PLAN_CATEGORY_THEME_MAP[DEFAULT_PLAN_CATEGORY];
}

export function getPlanCategoryLabel(value) {
  return getPlanCategoryTheme(value).label;
}
