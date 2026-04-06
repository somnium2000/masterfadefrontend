import scriptDark from '../../assets/branding/masterfade-script-dark.png';
import scriptLight from '../../assets/branding/masterfade-script-light.png';
import { useTheme } from '../../context/ThemeContext.jsx';

const VARIANTS = {
  hero: {
    gap: 'gap-0',
    script: 'w-[300px] sm:w-[360px] md:w-[460px] max-w-[92vw]',
  },
  compact: {
    gap: 'gap-0',
    script: 'w-[220px] sm:w-[250px] md:w-[320px] max-w-[82vw]',
  },
  topbar: {
    gap: 'gap-0',
    script: 'w-[116px] min-[360px]:w-[132px] sm:w-[150px] md:w-[180px] max-w-[46vw]',
  },
  public: {
    gap: 'gap-0',
    script: 'w-[300px] sm:w-[360px] md:w-[500px] max-w-[94vw]',
  },
  publicPromotions: {
    gap: 'gap-0',
    script: 'w-[340px] sm:w-[420px] md:w-[580px] lg:w-[620px] max-w-[96vw]',
  },
  auth: {
    gap: 'gap-0',
    script: 'w-[280px] sm:w-[330px] md:w-[430px] max-w-[92vw]',
  },
  sidebar: {
    gap: 'gap-0',
    script: 'w-[210px] max-w-full',
  },
};

export default function MasterfadeLogo({ variant = 'hero', className = '', showScriptMark = true }) {
  const { variant: themeVariant } = useTheme();
  const styles = VARIANTS[variant] || VARIANTS.hero;
  const scriptSrc = themeVariant === 'dark' ? scriptLight : scriptDark;

  return (
    <div className={`flex flex-col items-center text-center ${styles.gap} ${className}`.trim()}>
      {showScriptMark ? (
        <div
          className={`${styles.script} relative select-none`}
          aria-label="Masterfade script logo"
          role="img"
          style={{ aspectRatio: '1600 / 475' }}
        >
          <img
            src={scriptSrc}
            alt="Masterfade"
            className="absolute inset-0 h-full w-full object-contain"
            loading="eager"
            decoding="async"
            draggable="false"
          />
        </div>
      ) : null}
    </div>
  );
}
