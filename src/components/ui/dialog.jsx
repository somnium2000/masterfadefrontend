import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

// Overlay con blur — identico en mobile y desktop
const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50",
      // Fondo semitransparente con blur
      "bg-[var(--mf-overlay)] backdrop-blur-sm",
      // Animación de Radix
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

/**
 * DialogContent:
 * - Mobile (< sm): aparece desde abajo como bottom sheet con 24px radius en top
 * - Desktop (sm+): modal centrado con slide+zoom y 24px radius uniforme
 */
const DialogContent = React.forwardRef(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // Posicionamiento base
        "fixed z-50 w-full",
        // MOBILE: bottom sheet que sube desde abajo
        "bottom-0 left-0 right-0 rounded-t-[24px]",
        // DESKTOP: modal centrado con slide+zoom
        "sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2",
        "sm:max-w-lg sm:rounded-[24px]",
        // Fondo y borde premium
        "border border-[var(--mf-nav-border)]",
        "bg-[color:color-mix(in_srgb,var(--mf-card)_96%,transparent)]",
        "shadow-[var(--mf-shadow-card)]",
        "backdrop-blur-xl",
        // Padding interno
        "p-6",
        // Animaciones Mobile (slide-up)
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        // Animaciones Desktop (zoom+slide)
        "sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=open]:slide-in-from-bottom-0",
        "sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95",
        "duration-200",
        className
      )}
      {...props}
    >
      {/* Pill handle en mobile */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 h-1 w-10 rounded-full bg-[var(--mf-nav-border)] sm:hidden" />

      {children}

      <DialogPrimitive.Close className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-[10px] border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] opacity-80 transition-all hover:opacity-100 hover:border-[var(--mf-btn-border)] focus:outline-none focus:ring-2 focus:ring-[var(--mf-accent)]/30">
        <X className="h-3.5 w-3.5 text-[var(--mf-text-2)]" />
        <span className="sr-only">Cerrar</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({ className, ...props }) => (
  <div
    className={cn("flex flex-col gap-1.5 text-left pb-4", className)}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({ className, ...props }) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end sm:gap-3",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "mf-font-display text-xl font-semibold leading-tight text-[var(--mf-text)]",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-[var(--mf-text-2)] leading-6", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
