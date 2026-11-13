import { useId } from 'react';
import { ExternalLink, FileText, ShieldCheck } from 'lucide-react';
import './ConsentAgreements.css';

export default function ConsentAgreements({
  termsInputProps = {}, marketingInputProps = {},
  termsLabel = 'Acepto términos y condiciones para crear mi cuenta.',
  marketingLabel = 'Acepto recibir comunicaciones comerciales.', readOnly = false,
}) {
  const id = useId();
  return (
    <section className="mf-agreements" aria-labelledby={`${id}-title`}>
      <header className="mf-agreements__header"><ShieldCheck size={19} aria-hidden="true" /><h3 id={`${id}-title`}>Acuerdos y privacidad</h3></header>
      <p className="mf-agreements__intro">Consulta los documentos antes de decidir. Se abren en otra pestaña y su lectura no marca ninguna casilla.</p>
      <div className="mf-agreements__links">
        <a className="mf-agreements__link" href="/terminos-y-condiciones#terminos-y-condiciones" target="_blank" rel="noopener noreferrer" title="Se abre en otra pestaña"><FileText size={16} aria-hidden="true" /><span>Términos y condiciones</span><ExternalLink size={14} aria-hidden="true" /></a>
        <a className="mf-agreements__link" href="/terminos-y-condiciones#politica-de-privacidad" target="_blank" rel="noopener noreferrer" title="Se abre en otra pestaña"><ShieldCheck size={16} aria-hidden="true" /><span>Política de privacidad</span><ExternalLink size={14} aria-hidden="true" /></a>
      </div>
      {readOnly ? <>
        <dl className="mf-agreements__records">
          <div><dt>Términos y condiciones</dt><dd>{termsInputProps.checked ? 'Aceptación registrada' : 'Sin aceptación registrada'}</dd></div>
          <div><dt>Comunicaciones comerciales</dt><dd>{marketingInputProps.checked ? 'Consentimiento registrado' : 'Sin consentimiento registrado'}</dd></div>
        </dl>
        <p className="mf-agreements__intro">Solo lectura. El cliente debe expresar personalmente su aceptación y sus preferencias de comunicación.</p>
      </> : <div className="mf-agreements__choices">
        <div className="mf-agreements__item">
          <p id={`${id}-required`} className="mf-agreements__tag">Obligatorio para crear la cuenta</p>
          <label className="mf-agreements__choice"><input {...termsInputProps} type="checkbox" aria-describedby={[termsInputProps['aria-describedby'], `${id}-required`].filter(Boolean).join(' ')} /><span>{termsLabel}</span></label>
        </div>
        <div className="mf-agreements__item mf-agreements__item--optional">
          <p id={`${id}-optional`} className="mf-agreements__tag">Opcional</p>
          <label className="mf-agreements__choice"><input {...marketingInputProps} type="checkbox" aria-describedby={[marketingInputProps['aria-describedby'], `${id}-marketing-help`].filter(Boolean).join(' ')} /><span>{marketingLabel}</span></label>
          <p id={`${id}-marketing-help`} className="mf-agreements__help">Puedes crear tu cuenta sin recibir comunicaciones comerciales.</p>
        </div>
      </div>}
    </section>
  );
}
