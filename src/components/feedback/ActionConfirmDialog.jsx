import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, Loader2, ShieldAlert } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.jsx';
import { Button } from '../ui/button.jsx';

const TONE_STYLES = {
  warning: {
    iconWrap: 'border-amber-500/35 bg-amber-500/12 text-amber-300',
    buttonVariant: 'default',
  },
  danger: {
    iconWrap: 'border-red-500/35 bg-red-500/12 text-red-300',
    buttonVariant: 'destructive',
  },
};

export default function ActionConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'warning',
  loading = false,
  onConfirm,
}) {
  const reducedMotion = useReducedMotion();
  const styleConfig = TONE_STYLES[tone] || TONE_STYLES.warning;
  const Icon = tone === 'danger' ? ShieldAlert : AlertTriangle;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="pb-2">
          <motion.div
            // AM: Microinteraccion sutil para reforzar confirmaciones sin ser invasiva.
            initial={reducedMotion ? false : { opacity: 0, scale: 0.94, y: 6 }}
            animate={reducedMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={`mb-2 flex h-10 w-10 items-center justify-center rounded-xl border ${styleConfig.iconWrap}`}
            aria-hidden="true"
          >
            <Icon size={18} strokeWidth={2.1} />
          </motion.div>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <DialogDescription className="text-sm leading-6 text-[var(--mf-text-2)]">
          {description}
        </DialogDescription>

        <DialogFooter className="mt-3">
          <Button variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant={styleConfig.buttonVariant}
            disabled={loading}
            onClick={onConfirm}
            className="gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
