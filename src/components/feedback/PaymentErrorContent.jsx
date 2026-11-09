import { CircleAlert } from 'lucide-react';
import { Button } from '../ui/button.jsx';
import { DialogDescription, DialogTitle } from '../ui/dialog.jsx';

export default function PaymentErrorContent({ description, onAcknowledge, acknowledgeRef }) {
  return (
    <div className="payment-result-error">
      <span className="payment-result-error-icon" aria-hidden="true"><CircleAlert size={36} /></span>
      <DialogTitle>No se pudo completar el pago</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
      <Button ref={acknowledgeRef} type="button" onClick={onAcknowledge}>Entendido</Button>
    </div>
  );
}
