import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../components/ui/button.jsx';

// AM: Las reservas necesitan un desafío bancario visible; VIP conserva su propio diálogo.
export default function PublicPixelPayChallenge({ active, onCancel, overlay = false }) {
  const headingRef = useRef(null);

  useEffect(() => {
    if (!overlay || !active || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    headingRef.current?.focus({ preventScroll: true });
    return () => { document.body.style.overflow = previousOverflow; };
  }, [active, overlay]);

  const challenge = (
    <section without-sdk-modal="" hidden={!active} aria-label="Autenticación 3DS"
      role={overlay ? 'dialog' : 'region'} aria-modal={overlay && active ? true : undefined}
      className={overlay
        ? active
          ? 'fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/85 p-3 sm:p-6'
          : 'hidden'
        : 'w-full [&_iframe]:mx-auto [&_iframe]:max-w-full'}>
      <div className={overlay
        ? 'my-auto flex max-h-[95dvh] w-full max-w-[680px] flex-col gap-4 overflow-y-auto rounded-2xl border border-amber-300/40 bg-[#151515] p-4 text-white shadow-2xl sm:p-6'
        : 'w-full'}>
        {active ? (
          <div>
            <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
              Autenticación bancaria
            </h2>
            <p role="status" className="mt-1 text-sm">
              Completa la autenticación con tu banco. No cierres ni recargues esta página.
            </p>
          </div>
        ) : null}
        <div className="pixelpay-modal-container w-full [&_iframe]:mx-auto [&_iframe]:max-w-full" />
        {active ? <Button type="button" variant="outline" onClick={onCancel}>Cancelar autenticación</Button> : null}
      </div>
    </section>
  );

  return overlay && typeof document !== 'undefined' ? createPortal(challenge, document.body) : challenge;
}
