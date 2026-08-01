import { Loader2, ShieldCheck, X } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '../../../../components/ui/button.jsx';

export const TODO_PAGO_RESULT_MAX_LENGTH = 16_384;
export const TODO_PAGO_LOAD_TIMEOUT_MS = 30_000;

const MODAL_STATUS_COPY = {
  preparing: 'Preparando pago',
  loading: 'Cargando portal',
  open: 'Portal abierto',
  result: 'Resultado recibido',
  consumed: 'Lanzamiento ya enviado',
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

function clearTimer(timerRef) {
  if (timerRef.current === null) return;
  window.clearTimeout(timerRef.current);
  timerRef.current = null;
}

function hasNavigatedAwayFromBlank(iframe) {
  try {
    const href = String(iframe?.contentWindow?.location?.href || '');
    return Boolean(href) && href !== 'about:blank';
  } catch {
    return true;
  }
}

export default function TodoPagoHostedModal({
  open,
  launch,
  onResult,
  onClose,
  onError,
  onSubmitted,
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
  const loadWatchdogRef = useRef(null);
  const activeLaunchRef = useRef(launch);
  const consumedRef = useRef({ launch, value: false });
  const messageHandledRef = useRef({ launch, value: false });
  const errorReportedRef = useRef({ launch, value: false });
  const callbacksRef = useRef({ onResult, onClose, onError, onSubmitted });
  const [status, setStatus] = useState('preparing');
  const [statusLaunch, setStatusLaunch] = useState(launch);
  const normalizedLaunch = useMemo(() => normalizeLaunch(launch), [launch]);

  useEffect(() => {
    callbacksRef.current = { onResult, onClose, onError, onSubmitted };
  }, [onClose, onError, onResult, onSubmitted]);

  const reportErrorOnce = useCallback((code, nextStatus = 'error') => {
    if (errorReportedRef.current.launch !== launch) {
      errorReportedRef.current = { launch, value: false };
    }
    if (errorReportedRef.current.value) return;
    errorReportedRef.current.value = true;
    setStatus(nextStatus);
    callbacksRef.current.onError?.({ code });
  }, [launch]);

  useEffect(() => {
    if (activeLaunchRef.current === launch) return undefined;

    activeLaunchRef.current = launch;
    consumedRef.current = { launch, value: false };
    messageHandledRef.current = { launch, value: false };
    errorReportedRef.current = { launch, value: false };
    clearTimer(loadWatchdogRef);
    const resetId = window.setTimeout(() => {
      setStatusLaunch(launch);
      setStatus('preparing');
    }, 0);
    return () => window.clearTimeout(resetId);
  }, [launch]);

  useEffect(() => {
    if (!open) {
      clearTimer(loadWatchdogRef);
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
      if (consumedRef.current.launch === launch && consumedRef.current.value) {
        setStatus('consumed');
        return;
      }

      setStatus('preparing');
      if (!normalizedLaunch) {
        reportErrorOnce('TODOPAGO_LAUNCH_INVALID');
        return;
      }
      if (isExpired(normalizedLaunch.expiresAt)) {
        reportErrorOnce('TODOPAGO_SESSION_EXPIRED', 'expired');
        return;
      }
      if (!iframeRef.current || !formRef.current) return;

      consumedRef.current = { launch, value: true };
      messageHandledRef.current = { launch, value: false };
      setStatus('loading');
      HTMLFormElement.prototype.submit.call(formRef.current);
      callbacksRef.current.onSubmitted?.();

      clearTimer(loadWatchdogRef);
      loadWatchdogRef.current = window.setTimeout(() => {
        loadWatchdogRef.current = null;
        reportErrorOnce('TODOPAGO_PORTAL_LOAD_TIMEOUT');
      }, TODO_PAGO_LOAD_TIMEOUT_MS);

      if (!normalizedLaunch.expiresAt) return;
      const expiresInMs = new Date(normalizedLaunch.expiresAt).getTime() - Date.now();
      expirationId = window.setTimeout(() => {
        reportErrorOnce('TODOPAGO_SESSION_EXPIRED', 'expired');
      }, Math.min(expiresInMs, 2_147_483_647));
    }, 0);
    return () => {
      window.clearTimeout(startId);
      clearTimer(loadWatchdogRef);
      if (expirationId !== null) window.clearTimeout(expirationId);
    };
  }, [launch, normalizedLaunch, open, reportErrorOnce]);

  useEffect(() => {
    if (!open || !normalizedLaunch) return undefined;
    const handleMessage = (event) => {
      if (consumedRef.current.launch !== launch || !consumedRef.current.value) return;
      if (messageHandledRef.current.launch === launch && messageHandledRef.current.value) return;
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

      messageHandledRef.current = { launch, value: true };
      setStatus('result');
      callbacksRef.current.onResult?.(parsedResult);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [launch, normalizedLaunch, open]);

  if (!open) return null;

  const displayStatus = statusLaunch === launch ? status : 'preparing';
  const showPortal = normalizedLaunch
    && displayStatus !== 'consumed'
    && displayStatus !== 'error'
    && displayStatus !== 'expired';
  const showLoader = displayStatus === 'preparing' || displayStatus === 'loading';

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

        <div className={`todopago-hosted-status is-${displayStatus}`} role="status" aria-live="polite">
          {showLoader ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          <span>{MODAL_STATUS_COPY[displayStatus]}</span>
        </div>

        {showPortal ? (
          <div className="todopago-hosted-frame-shell">
            <iframe
              ref={iframeRef}
              className="todopago-hosted-frame"
              name={iframeName}
              title="Portal de pago TodoPago"
              src="about:blank"
              onLoad={(event) => {
                if (consumedRef.current.launch !== launch || !consumedRef.current.value) return;
                if (!hasNavigatedAwayFromBlank(event.currentTarget)) return;
                clearTimer(loadWatchdogRef);
                setStatus((current) => (
                  current === 'loading' || current === 'preparing' ? 'open' : current
                ));
              }}
              onError={() => reportErrorOnce('TODOPAGO_PORTAL_LOAD_ERROR')}
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
