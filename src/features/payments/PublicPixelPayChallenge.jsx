import { useId, useLayoutEffect, useRef } from 'react';
import { Button } from '../../components/ui/button.jsx';
import './publicPixelPayChallenge.css';

export default function PublicPixelPayChallenge({ active, onCancel, embedded = false }) {
  const dialogRef = useRef(null);
  const titleRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // AM: Keep the SDK host mounted through open, close and payment cleanup.
    if (typeof dialog.showModal !== 'function') {
      dialog.toggleAttribute('open', active);
      return;
    }
    if (!active || dialog.open) return;
    dialog.showModal();
    titleRef.current.focus({ preventScroll: true });
    return () => { if (dialog.open) dialog.close(); };
  }, [active, embedded]);

  if (embedded) {
    return (
      <section without-sdk-modal="" hidden={!active} aria-label="Autenticación 3DS"
        className="w-full [&_iframe]:mx-auto [&_iframe]:max-w-full">
        {active ? <p role="status">Completa la autenticación con tu banco.</p> : null}
        <div className="pixelpay-modal-container" />
        {active ? <Button type="button" variant="outline" onClick={onCancel}>Cancelar autenticación</Button> : null}
      </section>
    );
  }

  return (
    <dialog ref={dialogRef} without-sdk-modal="" className="mf-stepup-dialog"
      aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={event => { event.preventDefault(); onCancel?.(); }}>
      <h2 ref={titleRef} id={titleId} tabIndex={-1}>Autenticación 3DS</h2>
      <p id={descriptionId} role="status">Completa la autenticación con tu banco.</p>
      <div className="pixelpay-modal-container" />
      <Button type="button" variant="outline" onClick={onCancel}>Cancelar autenticación</Button>
    </dialog>
  );
}
