import { Loader2, ShieldCheck, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '../../../../components/ui/button.jsx';

export const TODO_PAGO_RESULT_MAX_LENGTH = 16_384;

const MODAL_STATUS_COPY = {
  preparing: 'Preparando pago',
  loading: 'Cargando portal',
  open: 'Portal abierto',
  result: 'Resultado recibido',
  error: 'Error de carga',
  expired: 'Sesión expirada',
};

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeLaunch(launch) {
  if (!isObject(launch) || launch.type !== 'iframe_post' || launch.method !== 'POST') return null;
  if (!isObject(launch.fields)) return null;

  let action;
  let allowedOrigin;
  try {
    action = new URL(String(launch.action || '').trim());
    allowedOrigin = new URL(String(launch.allowedMessageOrigin || '').trim());
  } catch {
    return null;
  }
  if (action.protocol !== 'https:' || allowedOrigin.protocol !== 'https:') return null;
  if (allowedOrigin.origin !== String(launch.allowedMessageOrigin || '').trim()) return null;
  if (launch.expiresAt && !Number.isFinite(new Date(launch.expiresAt).getTime())) return null;

  return {
    action: action.toString(),
    allowedMessageOrigin: allowedOrigin.origin,
    expiresAt: launch.expiresAt || null,
    fields: Object.entries(launch.fields).map(([name, value]) => ({
      name: String(name),
      value: String(value ?? ''),
    })),
  };
}

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  const expiresAtMs = new Date(expiresAt).getTime();
  return Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now();
}

export default function TodoPagoHostedModal({
  open,
  launch,
  onResult,
  onClose,
  onError,
}) {
  const generatedId = useId();
  const iframeName = useMemo(
    () => `todopago-hosted-${generatedId.replace(/[^a-z0-9_-]/gi, '')}`,
    [generatedId]
  );
  const dialogRef = useRef(null);
  const iframeRef = useRef(null);
  const formRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const submittedRef = useRef(false);
  const callbacksRef = useRef({ onResult, onClose, onError });
  const [status, setStatus] = useState('preparing');
  const normalizedLaunch = useMemo(() => normalizeLaunch(launch), [launch]);

  useEffect(() => {
    callbacksRef.current = { onResult, onClose, onError };
  }, [onClose, onError, onResult]);

  useEffect(() => {
    if (!open) {
      submittedRef.current = false;
      return undefined;
    }

    restoreFocusRef.current = document.activeElement;
    const focusId = window.setTimeout(() => dialogRef.current?.focus(), 0);
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      callbacksRef.current.onClose?.();
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusId);
      document.removeEventListener('keydown', handleKeyDown);
      const priorFocus = restoreFocusRef.current;
      if (priorFocus && typeof priorFocus.focus === 'function') priorFocus.focus();
      restoreFocusRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let expirationId = null;
    const startId = window.setTimeout(() => {
      setStatus('preparing');
      if (!normalizedLaunch) {
        setStatus('error');
        callbacksRef.current.onError?.({ code: 'TODOPAGO_LAUNCH_INVALID' });
        return;
      }
      if (isExpired(normalizedLaunch.expiresAt)) {
        setStatus('expired');
        callbacksRef.current.onError?.({ code: 'TODOPAGO_SESSION_EXPIRED' });
        return;
      }
      if (!iframeRef.current || !formRef.current || submittedRef.current) return;

      submittedRef.current = true;
      setStatus('loading');
      HTMLFormElement.prototype.submit.call(formRef.current);

      if (!normalizedLaunch.expiresAt) return;
      const expiresInMs = new Date(normalizedLaunch.expiresAt).getTime() - Date.now();
      expirationId = window.setTimeout(() => {
        setStatus('expired');
        callbacksRef.current.onError?.({ code: 'TODOPAGO_SESSION_EXPIRED' });
      }, Math.min(expiresInMs, 2_147_483_647));
    }, 0);
    return () => {
      window.clearTimeout(startId);
      if (expirationId !== null) window.clearTimeout(expirationId);
    };
  }, [normalizedLaunch, open]);

  useEffect(() => {
    if (!open || !normalizedLaunch) return undefined;
    const handleMessage = (event) => {
      if (event.origin !== normalizedLaunch.allowedMessageOrigin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (!isObject(event.data) || event.data.accion !== 'Resultado') return;
      if (typeof event.data.valor !== 'string' || event.data.valor.length > TODO_PAGO_RESULT_MAX_LENGTH) return;

      let parsedResult;
      try {
        parsedResult = JSON.parse(event.data.valor);
      } catch {
        return;
      }
      if (!isObject(parsedResult)) return;

      setStatus('result');
      callbacksRef.current.onResult?.(parsedResult);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [normalizedLaunch, open]);

  if (!open) return null;

  const showPortal = normalizedLaunch && status !== 'error' && status !== 'expired';
  const showLoader = status === 'preparing' || status === 'loading';

  return (
    <div className="todopago-hosted-backdrop" data-testid="todopago-hosted-backdrop">
      <section
        ref={dialogRef}
        className="todopago-hosted-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="todopago-hosted-title"
        tabIndex={-1}
      >
        <header className="todopago-hosted-header">
          <div>
            <p className="todopago-hosted-eyebrow">Portal seguro</p>
            <h2 id="todopago-hosted-title">Continuar con TodoPago</h2>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => callbacksRef.current.onClose?.()} aria-label="Cerrar portal de pago">
            <X size={18} />
          </Button>
        </header>

        <div className={`todopago-hosted-status is-${status}`} role="status" aria-live="polite">
          {showLoader ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          <span>{MODAL_STATUS_COPY[status]}</span>
        </div>

        {showPortal ? (
          <div className="todopago-hosted-frame-shell">
            <iframe
              ref={iframeRef}
              className="todopago-hosted-frame"
              name={iframeName}
              title="Portal de pago TodoPago"
              src="about:blank"
              onLoad={() => {
                if (submittedRef.current) setStatus((current) => (
                  current === 'loading' || current === 'preparing' ? 'open' : current
                ));
              }}
              onError={() => {
                setStatus('error');
                callbacksRef.current.onError?.({ code: 'TODOPAGO_PORTAL_LOAD_ERROR' });
              }}
            />
            <form
              ref={formRef}
              action={normalizedLaunch.action}
              method="POST"
              target={iframeName}
              hidden
              aria-hidden="true"
            >
              {normalizedLaunch.fields.map((field) => (
                <input key={field.name} type="hidden" name={field.name} value={field.value} readOnly />
              ))}
            </form>
          </div>
        ) : null}

        <footer className="todopago-hosted-footer">
          <p>El resultado del portal es informativo. MasterFade verificará el pago con el backend.</p>
          <Button type="button" variant="outline" onClick={() => callbacksRef.current.onClose?.()}>Cerrar</Button>
        </footer>
      </section>
    </div>
  );
}
