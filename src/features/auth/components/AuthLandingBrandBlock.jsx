import { motion } from 'framer-motion';
import MasterfadeLogo from '../../../components/branding/MasterfadeLogo.jsx';

const ease = [0.25, 0.46, 0.45, 0.94];

function DecorativeLine({ delay = 0, className = '' }) {
  return (
    <motion.div
      initial={{ scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ duration: 0.8, delay, ease }}
      className={`h-px w-10 origin-center bg-[var(--mf-accent)] ${className}`.trim()}
    />
  );
}

export default function AuthLandingBrandBlock() {
  return (
    <div className="mf-auth-landing-brand">
      <DecorativeLine delay={0.2} className="mf-auth-landing-line mb-8" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3, ease }}
        className="mf-auth-landing-logo-wrap flex flex-col items-center text-center"
      >
        <MasterfadeLogo
          variant="publicPromotions"
          className="-my-8 md:-my-10 scale-[1.16] md:scale-[1.22]"
        />
        <div className="mf-auth-landing-kicker mt-2 flex items-center gap-4">
          <span className="h-px w-[30px] bg-[var(--mf-accent)]" />
          <span className="text-[11px] uppercase tracking-[0.3em] text-[var(--mf-accent)]">
            BARBER SHOP
          </span>
          <span className="h-px w-[30px] bg-[var(--mf-accent)]" />
        </div>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.6, ease }}
        className="mf-auth-landing-copy mt-6 text-center text-[14px] leading-[1.7] tracking-[0.04em] text-[var(--mf-text-2)]"
      >
        Tu estilo, nuestra pasión.
        <br />
        La experiencia premium en barbería.
      </motion.p>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 1.2 }}
        className="mf-auth-landing-country mt-8 flex items-center gap-4"
      >
        <span className="h-px w-8 bg-[var(--mf-accent)]" />
        <span className="text-[11px] uppercase tracking-[0.24em] text-[var(--mf-accent)]">Honduras</span>
        <span className="h-px w-8 bg-[var(--mf-accent)]" />
      </motion.div>
    </div>
  );
}
