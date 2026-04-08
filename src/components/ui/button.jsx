import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

/**
 * Variantes del botón MasterFade con estilos premium del design system Figma.
 * touch target mínimo: 44px (a11y).
 */
const buttonVariants = cva(
  [
    // Base
    "relative inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "text-sm font-medium tracking-wide",
    "rounded-[14px]",
    "transition-all duration-200",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mf-accent)]/40 focus-visible:ring-offset-1",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    // touch target mínimo
    "min-h-[44px] px-5",
  ],
  {
    variants: {
      variant: {
        // Gradiente dorado / vino según tema â€” acción principal
        default:
          "mf-accent-gradient text-[var(--mf-accent-text)] shadow-[var(--mf-shadow-accent)] hover:shadow-[var(--mf-shadow-accent-strong)] hover:-translate-y-px active:translate-y-0 active:shadow-[var(--mf-shadow-accent)]",
        // Borde translúcido â€” acción secundaria
        outline:
          "border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text)] hover:border-[var(--mf-accent)]/50 hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_80%,var(--mf-accent)_8%)] hover:text-[var(--mf-text)]",
        // Fantasma â€” acciones de baja jerarquía
        ghost:
          "bg-transparent text-[var(--mf-text-2)] hover:bg-[var(--mf-btn-bg)] hover:text-[var(--mf-text)] rounded-xl",
        // Peligro â€” eliminar
        destructive:
          "bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 hover:border-red-500/50",
        // Link â€” navegación inline
        link:
          "text-[var(--mf-accent)] underline-offset-4 hover:underline min-h-0 px-0 h-auto",
      },
      size: {
        default: "h-11 px-5 text-sm",
        sm: "h-9 px-4 text-xs rounded-[12px] min-h-0",
        lg: "h-14 px-7 text-base rounded-[16px]",
        icon: "h-10 w-10 p-0 rounded-[12px] min-h-0",
        "icon-sm": "h-8 w-8 p-0 rounded-[10px] min-h-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

/**
 * Versión con animaciones framer-motion para CTAs principales.
 * Mismas props que Button + props de motion.button.
 */
const MotionButton = React.forwardRef(
  ({ className, variant, size, ...props }, ref) => (
    <motion.button
      ref={ref}
      whileHover={{ scale: 1.015, y: -1 }}
      whileTap={{ scale: 0.975 }}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
)
MotionButton.displayName = "MotionButton"

export { Button, MotionButton, buttonVariants }
