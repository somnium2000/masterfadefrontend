import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog.jsx';

export default function SecurityDetailModal({
  open,
  onOpenChange,
  title,
  description,
  children,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[92vh] max-h-[92vh] w-[96vw] max-w-[96vw] overflow-hidden p-0 sm:h-auto sm:max-h-[85vh] sm:max-w-3xl sm:rounded-[24px] sm:p-0">
        <div className="flex h-full flex-col">
          <DialogHeader className="border-b border-[var(--mf-nav-border)] px-5 pb-4 pt-6 sm:px-6">
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="overflow-y-auto px-5 pb-6 pt-4 sm:px-6">
            {children}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
