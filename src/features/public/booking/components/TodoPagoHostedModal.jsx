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

function createLaunchDescriptor(launch) {
  if (!isObject(launch)) return null;
  const fields = isObject(launch.fields)
    ? Object.entries(launch.fields)
      .map(([name, value]) => [String(name), String(value ?? '')])
      .sort(([leftName], [rightName]) => {
        if (leftName < rightName) return -1;
        if (leftName > rightName) return 1;
        return 0;
      })
    : null;

  return {
    action: String(launch.action ?? ''),
    method: String(launch.method ?? ''),
    allowedMessageOrigin: String(launch.allowedMessageOrigin ?? ''),
    expiresAt: launch.expiresAt == null ? null : String(launch.expiresAt),
    fields,
  };
}

export function createTodoPagoLaunchKey(launch) {
  return JSON.stringify(createLaunchDescriptor(launch));
}

function normalizeLaunchKey(launchKey) {
  let launch;
  try {
    launch = JSON.parse(launchKey);
  } catch {
    return null;
  }
  if (!isObject(launch) || launch.method !== 'POST' || !Array.isArray(launch.fields)) return null;

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
    fields: launch.fields.map(([name, value]) => ({ name, value })),
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
  const expirationTimerRef = useRef(null);
  const launchKey = createTodoPagoLaunchKey(launch);
  const activeLaunchKeyRef = useRef(launchKey);
  const consumedRef = useRef({ launchKey, value: false });
  const messageHandledRef = useRef({ launchKey, value: false });
  const terminalStateRef = useRef({ launchKey, value: null });
  const callbacksRef = useRef({ onResult, onClose, onError, onSubmitted });
  const [status, setStatus] = useState('preparing');
  const [statusLaunchKey, setStatusLaunchKey] = useState(launchKey);
  const launchType = launch?.type;
  const normalizedLaunch = useMemo(
    () => (launchType === 'iframe_post' ? normalizeLaunchKey(launchKey) : null),
    [launchKey, launchType]
  );

  useEffect(() => {
    callbacksRef.current = { onResult, onClose, onError, onSubmitted };
  }, [onClose, onError, onResult, onSubmitted]);

  const reportErrorOnce = useCallback((code, nextStatus = 'error') => {
    if (terminalStateRef.current.launchKey !== launchKey) {
      terminalStateRef.current = { launchKey, value: null };
    }
    if (terminalStateRef.current.value !== null) return;
    terminalStateRef.current.value = 'error';
    clearTimer(loadWatchdogRef);
    clearTimer(expirationTimerRef);
    setStatus(nextStatus);
    callbacksRef.current.onError?.({ code });
  }, [launchKey]);

  useEffect(() => {
    if (activeLaunchKeyRef.current === launchKey) return undefined;

    activeLaunchKeyRef.current = launchKey;
    consumedRef.current = { launchKey, value: false };
    messageHandledRef.current = { launchKey, value: false };
    terminalStateRef.current = { launchKey, value: null };
    clearTimer(loadWatchdogRef);
    clearTimer(expirationTimerRef);
    const resetId = window.setTimeout(() => {
      setStatusLaunchKey(launchKey);
      setStatus('preparing');
    }, 0);
    return () => window.clearTimeout(resetId);
  }, [launchKey]);

  useEffect(() => {
    if (!open) {
      clearTimer(loadWatchdogRef);
      clearTimer(expirationTimerRef);
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
    const startId = window.setTimeout(() => {
      if (consumedRef.current.launchKey === launchKey && consumedRef.current.value) {
        if (terminalStateRef.current.launchKey !== launchKey || terminalStateRef.current.value === null) {
          setStatus('consumed');
        }
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

      consumedRef.current = { launchKey, value: true };
      messageHandledRef.current = { launchKey, value: false };
      terminalStateRef.current = { launchKey, value: null };
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
      expirationTimerRef.current = window.setTimeout(() => {
        expirationTimerRef.current = null;
        reportErrorOnce('TODOPAGO_SESSION_EXPIRED', 'expired');
      }, Math.min(expiresInMs, 2_147_483_647));
    }, 0);
    return () => {
      window.clearTimeout(startId);
      clearTimer(loadWatchdogRef);
      clearTimer(expirationTimerRef);
    };
  }, [launchKey, normalizedLaunch, open, reportErrorOnce]);

  useEffect(() => {
    if (!open || !normalizedLaunch) return undefined;
    const handleMessage = (event) => {
      if (consumedRef.current.launchKey !== launchKey || !consumedRef.current.value) return;
      if (terminalStateRef.current.launchKey === launchKey && terminalStateRef.current.value !== null) return;
      if (messageHandledRef.current.launchKey === launchKey && messageHandledRef.current.value) return;
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

      messageHandledRef.current = { launchKey, value: true };
      terminalStateRef.current = { launchKey, value: 'result' };
      clearTimer(loadWatchdogRef);
      clearTimer(expirationTimerRef);
      setStatus('result');
      callbacksRef.current.onResult?.(parsedResult);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [launchKey, normalizedLaunch, open]);

  if (!open) return null;

  const displayStatus = statusLaunchKey === launchKey ? status : 'preparing';
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
                if (consumedRef.current.launchKey !== launchKey || !consumedRef.current.value) return;
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
