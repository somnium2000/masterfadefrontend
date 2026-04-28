import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog.jsx';
import { Button } from '../../../components/ui/button.jsx';
import { Label } from '../../../components/ui/label.jsx';

export default function SecurityActionConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  loading = false,
  comment = '',
  onCommentChange,
  commentLabel = 'Comentario',
  commentPlaceholder = 'Escribe un comentario de resolucion...',
  requireComment = false,
  showCommentInput = true,
  onConfirm,
  tone = 'warning',
}) {
  const canSubmit = !loading && (!requireComment || String(comment || '').trim().length > 0);
  const confirmVariant = tone === 'danger' ? 'destructive' : 'default';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[92vh] max-h-[92vh] w-[96vw] max-w-[96vw] overflow-hidden p-0 sm:h-auto sm:max-h-[85vh] sm:max-w-lg sm:rounded-[24px] sm:p-0">
        <div className="flex h-full flex-col">
          <DialogHeader className="border-b border-[var(--mf-nav-border)] px-5 pb-4 pt-6 sm:px-6">
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>

          {showCommentInput ? (
            <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
              <Label className="mf-label">{commentLabel}</Label>
              <textarea
                className="mt-1 min-h-[140px] w-full rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3 text-sm text-[var(--mf-text)] outline-none transition focus:border-[var(--mf-accent)]"
                value={comment}
                onChange={(event) => onCommentChange?.(event.target.value)}
                placeholder={commentPlaceholder}
                maxLength={700}
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-[var(--mf-text-2)]">
                  {requireComment ? 'Comentario obligatorio.' : 'Comentario opcional.'}
                </span>
                <span className="text-xs text-[var(--mf-text-2)]">
                  {String(comment || '').length}/700
                </span>
              </div>
            </div>
          ) : (
            <div className="flex-1 px-5 py-4 sm:px-6">
              <p className="text-sm text-[var(--mf-text-2)]">Confirma que deseas continuar.</p>
            </div>
          )}

          <DialogFooter className="border-t border-[var(--mf-nav-border)] px-5 py-4 sm:px-6">
            <Button variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>
              {cancelLabel}
            </Button>
            <Button
              variant={confirmVariant}
              disabled={!canSubmit}
              onClick={onConfirm}
              className="gap-2"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : null}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
