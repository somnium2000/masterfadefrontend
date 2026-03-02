import scriptDark from '../../assets/branding/masterfade-script-dark.jpeg';
import { useTheme } from '../../context/ThemeContext.jsx';

const VARIANTS = {
  hero: {
    gap: 'gap-0',
    script: 'w-[250px] max-w-[78vw]',
  },
  compact: {
    gap: 'gap-0',
    script: 'w-[190px] max-w-[70vw]',
  },
};

export default function MasterfadeLogo({ variant = 'hero', className = '', showScriptMark = true }) {
  const { variant: themeVariant } = useTheme();
  const styles = VARIANTS[variant] || VARIANTS.hero;
  const foreground = themeVariant === 'dark' ? '#f7f2e9' : '#101010';
  const scriptMaskStyle = {
    WebkitMaskImage: `url(${scriptDark})`,
    WebkitMaskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    WebkitMaskSize: '100% 100%',
    maskImage: `url(${scriptDark})`,
    maskRepeat: 'no-repeat',
    maskPosition: 'center',
    maskSize: '100% 100%',
    maskMode: 'luminance',
  };

  return (
    <div className={`flex flex-col items-center text-center ${styles.gap} ${className}`.trim()}>
      {showScriptMark ? (
        <div
          className={`${styles.script} relative select-none`}
          aria-label="Masterfade script logo"
          role="img"
          style={{ aspectRatio: '1600 / 475' }}
        >
          <div
            className="absolute inset-0"
            style={{
              ...scriptMaskStyle,
              backgroundColor: 'var(--mf-accent)',
              filter: 'blur(1.15px)',
              transform: 'translateY(0.4px) scale(1.012)',
              opacity: 0.95,
            }}
          />

          <div
            className="absolute inset-0"
            style={{
              ...scriptMaskStyle,
              backgroundColor: foreground,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
