import { CreditCard, LockKeyhole, ShieldCheck } from 'lucide-react';
import { getPixelPayPresentation } from './pixelPayPresentation.js';
import './paymentCheckout.css';

export function PaymentCheckoutHero() {
  const presentation = getPixelPayPresentation();
  return (
    <div className="mf-checkout-hero">
      <div>
        <p className="mf-checkout-eyebrow">Pago seguro con</p>
        <h2 className="mf-checkout-brand">PixelPay</h2>
        {presentation.environment === 'sandbox' ? <span className="mf-checkout-environment">Sandbox · Entorno de pruebas (QA)</span> : null}
        <p className="mf-checkout-intro">{presentation.intro}</p>
        <ul className="mf-checkout-trust">
          <li><LockKeyhole size={17} />Transacción segura y encriptada</li>
          <li><CreditCard size={17} />{presentation.environment === 'sandbox' ? 'Utiliza exclusivamente tarjetas de prueba' : 'Solo aceptamos tarjetas válidas'}</li>
          <li><ShieldCheck size={17} />Tus datos se procesan de forma segura</li>
        </ul>
      </div>
      <div className="mf-checkout-art" aria-hidden="true">
        <div className="mf-checkout-art-back" />
        <div className="mf-checkout-art-card">
          <span className="mf-checkout-art-brand">PixelPay</span>
          <span className="mf-checkout-chip" />
          <span className="mf-checkout-dots">•••• &nbsp; •••• &nbsp; ••••</span>
          <span className="mf-checkout-art-caption">MASTERFADE</span>
        </div>
      </div>
    </div>
  );
}

export function PaymentCheckoutSteps({ processing = false, confirmed = false }) {
  const active = confirmed ? 2 : processing ? 1 : 0;
  return (
    <ol className="mf-checkout-steps" aria-label="Etapas del pago">
      {['Datos de pago', 'Procesando', 'Confirmación'].map((label, index) => (
        <li key={label} className={index <= active ? 'is-current' : ''} aria-current={index === active ? 'step' : undefined}>
          <span aria-hidden="true">{index + 1}</span><strong>{label}</strong>
        </li>
      ))}
    </ol>
  );
}
