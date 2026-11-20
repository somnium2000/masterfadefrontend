import { Button } from '../../components/ui/button.jsx';

export default function PublicPixelPayChallenge({ active, onCancel }) {
  return (
    <section without-sdk-modal="" hidden={!active} aria-label="Autenticación 3DS"
      className="w-full [&_iframe]:mx-auto [&_iframe]:max-w-full">
      {active ? <p role="status">Completa la autenticación con tu banco.</p> : null}
      <div className="pixelpay-modal-container" />
      {active ? <Button type="button" variant="outline" onClick={onCancel}>Cancelar autenticación</Button> : null}
    </section>
  );
}
