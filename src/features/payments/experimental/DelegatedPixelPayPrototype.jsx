import { useEffect, useRef, useState } from 'react';
import { runDelegatedPixelPay } from './delegatedPixelPay.js';

// AM: Opt-in desktop harness only. No application route or booking hook mounts this component.
export default function DelegatedPixelPayPrototype({ transport }) {
  const controller = useRef(null);
  const [state, setState] = useState('idle');
  useEffect(() => () => controller.current?.abort(), []);
  const start = async () => {
    if (controller.current) return;
    const current = new AbortController();
    controller.current = current;
    setState('running');
    try {
      const result = await runDelegatedPixelPay({ transport, signal: current.signal });
      if (!current.signal.aborted) setState(result.evidence?.providerApproved ? 'provider_evidence' : 'uncertain');
    } catch { if (!current.signal.aborted) setState('uncertain'); }
  };
  return <section aria-label="Prototipo de autenticación">
    <p>Prueba aislada. No confirma pagos ni reservas.</p>
    <button type="button" disabled={state !== 'idle'} onClick={start}>Iniciar prueba</button>
    <p role="status">{state === 'idle' ? 'Listo para la prueba local.' : state === 'running'
      ? 'Autenticación en curso…' : state === 'provider_evidence'
        ? 'Backend recibió evidencia del proveedor simulado. Reserva sin confirmar.'
        : 'Resultado pendiente de revisión. No se iniciará otra venta.'}</p>
    <div without-sdk-modal=""><div className="pixelpay-modal-container" /></div>
  </section>;
}
