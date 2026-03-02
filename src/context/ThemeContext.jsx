import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext(null);

const LS_THEME_KEY = 'mf_theme_variant';
const DEFAULT_VARIANT = 'dark';
const VALID_VARIANTS = new Set(['dark', 'light']);

function normalizeVariant(value) {
  return VALID_VARIANTS.has(value) ? value : DEFAULT_VARIANT;
}

function applyThemeToDocument(variant) {
  const nextVariant = normalizeVariant(variant);
  const root = document.documentElement;

  root.dataset.theme = nextVariant;
  root.classList.toggle('dark', nextVariant === 'dark');
  root.style.colorScheme = nextVariant === 'dark' ? 'dark' : 'light';
}

function getInitialVariant() {
  if (typeof window === 'undefined') {
    return DEFAULT_VARIANT;
  }

  return normalizeVariant(window.localStorage.getItem(LS_THEME_KEY));
}

export function ThemeProvider({ children }) {
  const [variant, setVariantState] = useState(getInitialVariant);

  useEffect(() => {
    applyThemeToDocument(variant);
    window.localStorage.setItem(LS_THEME_KEY, variant);
  }, [variant]);

  const value = useMemo(
    () => ({
      variant,
      setVariant: (nextVariant) => setVariantState(normalizeVariant(nextVariant)),
    }),
    [variant]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme debe usarse dentro de <ThemeProvider>');
  }

  return context;
}
