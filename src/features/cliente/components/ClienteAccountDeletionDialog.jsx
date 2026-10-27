import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog.jsx";
import { supabase } from "../../../config/supabaseClient.js";
import {
  confirmClienteAccountDeletionRequest,
  createClienteAccountDeletionRequest,
  getClienteAccountDeletionPreview,
} from "../lib/clienteApi.js";
import { saveAccountDeletionContinuation } from "../lib/accountDeletionContinuation.js";

const CONFIRMATION_TEXT = "ELIMINAR MI CUENTA";
const ACK_FIELDS = [
  {
    key: "acepta_perder_masterpuntos",
    label: "Reconozco que perdere los MasterPuntos disponibles.",
  },
  {
    key: "acepta_cancelar_membresia",
    label: "Reconozco que una membresia activa sera cancelada y sus beneficios no podran recuperarse.",
  },
  {
    key: "acepta_historial_anonimizado",
    label: "Reconozco que cierta historia financiera, fiscal o de auditoria sera retenida de forma anonimizada o protegida.",
  },
  {
    key: "acepta_irreversibilidad",
    label: "Reconozco que la eliminacion es definitiva y perdere el acceso a mi cuenta.",
  },
];

function normalizePayload(response) {
  return response?.data || response;
}

function toMessageList(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      code: String(item?.code || "").trim(),
      message: String(item?.message || "").trim(),
    }))
    .filter((item) => item.message);
}

function resolveFunctionalError(error, fallback = "No fue posible completar la operacion. Intenta nuevamente.") {
  const raw = String(error?.data?.error?.message || error?.message || "").trim();
  if (!raw) return fallback;
  const lowered = raw.toLowerCase();
  if (lowered.includes("postgres") || lowered.includes("supabase") || lowered.includes("storage") || lowered.includes("sql")) {
    return fallback;
  }
  return raw;
}

function formatNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  return new Intl.NumberFormat("es-HN").format(number);
}

function buildConsequenceDetails(preview) {
  const details = [];
  const membershipPlan = preview?.membership?.active_plan?.nombre_plan;
  const masterpoints = Number(preview?.masterpoints?.balance || 0);
  const pendingOrders = Number(preview?.pending_membership_orders?.count || 0);
  const retained = preview?.retained_history || {};
  const retainedTotal = Number(retained.appointments_count || 0)
    + Number(retained.payments_count || 0)
    + Number(retained.subscriptions_count || 0)
    + Number(retained.points_transactions_count || 0);

  if (preview?.membership?.will_cancel) {
    details.push(`Membresia activa${membershipPlan ? ` (${membershipPlan})` : ""}: sera cancelada.`);
  }
  if (masterpoints > 0) {
    details.push(`MasterPuntos disponibles: ${formatNumber(masterpoints)} puntos seran eliminados.`);
  }
  if (pendingOrders > 0) {
    details.push(`Ordenes pendientes de membresia: ${formatNumber(pendingOrders)} seran canceladas.`);
  }
  if (retainedTotal > 0 || retained?.will_be_anonymized) {
    details.push("Historial financiero, fiscal u operativo: permanecera registrado de forma protegida o anonimizada.");
  }
  details.push("Acceso: perderas definitivamente el ingreso a esta cuenta.");
  details.push("Beneficios: no podras recuperar puntos, membresias ni beneficios cancelados.");
  return details;
}

// AM: El popup devuelve solo evidencia efimera al opener del mismo origen; nunca persiste credenciales.
function relayDeletionGoogleResult() {
  const url = new URL(window.location.href), nonce = url.searchParams.get('mf_delete_reauth');
  if (!nonce || !window.opener) return;
  const hash = new URLSearchParams(url.hash.slice(1)), token = hash.get('access_token');
  url.hash = ''; url.searchParams.delete('mf_delete_reauth');
  window.history.replaceState({}, '', url.pathname + url.search);
  window.opener.postMessage({ type: 'mf-delete-reauth', nonce, token, failed: Boolean(hash.get('error') || !token) }, url.origin);
  window.close();
}

// AM: Una sesion existente o refresh nunca sustituye password/OAuth nuevos.
async function getFreshAccountDeletionReauthToken({ expectedUserId, email, password, method = 'password', isCurrent = () => true }) {
  if (!supabase || !expectedUserId || !isCurrent()) throw new Error('No se pudo validar la identidad de esta sesion.');
  const startedAt = Math.floor(Date.now() / 1000);
  let token = '';
  if (method === 'google') {
    const nonce = crypto.randomUUID(), origin = window.location.origin;
    const popup = window.open('about:blank', nonce, 'popup,width=480,height=720');
    if (!popup) throw new Error('Permite la ventana de Google para confirmar tu identidad.');
    try {
      token = await new Promise((resolve, reject) => {
        let timer, settled = false;
        const finish = (value, failed) => {
          if (settled) return; settled = true;
          window.removeEventListener('message', receive); window.clearInterval(timer);
          popup.close();
          if (failed) reject(new Error('No se pudo confirmar Google. Intenta nuevamente con la misma cuenta.'));
          else resolve(value);
        };
        const receive = event => {
          if (event.origin !== origin || event.source !== popup || event.data?.type !== 'mf-delete-reauth' || event.data.nonce !== nonce) return;
          finish(event.data.token, event.data.failed || typeof event.data.token !== 'string' || !isCurrent());
        };
        window.addEventListener('message', receive);
        timer = window.setInterval(() => {
          if (popup.closed || !isCurrent() || Date.now() / 1000 - startedAt > 180) { finish('', true); return; }
          // AM: El retorno al mismo origen tambien funciona si el proveedor usa Site URL como fallback.
          try {
            if (popup.location.origin !== origin) return;
            const hash = new URLSearchParams(popup.location.hash.slice(1));
            if (!hash.has('access_token') && !hash.has('error')) return;
            const result = hash.get('access_token');
            popup.history.replaceState({}, '', popup.location.pathname);
            finish(result, Boolean(hash.get('error') || !result));
          } catch { /* AM: Mientras Google sea otro origen, esperar sin leer sus datos. */ }
        }, 250);
        const redirect = new URL(window.location.href); redirect.hash = '';
        redirect.searchParams.set('mf_delete_reauth', nonce);
        // AM: Mantener el formulario en la ventana original y forzar seleccion real de cuenta Google.
        void supabase.auth.signInWithOAuth({ provider: 'google', options: {
          redirectTo: redirect.href, skipBrowserRedirect: true,
          queryParams: { prompt: 'select_account', max_age: '0', login_hint: String(email || '') },
        } }).then(result => {
          if (settled) return;
          if (result.error || !result.data?.url || !isCurrent()) finish('', true);
          else popup.location.replace(result.data.url);
        }).catch(() => finish('', true));
      });
    } finally { popup.close(); }
  } else {
    if (!password || !email) throw new Error('Ingresa tu contrasena para confirmar tu identidad.');
    const result = await supabase.auth.signInWithPassword({ email: String(email).trim().toLowerCase(), password });
    if (result.error || result.data?.user?.id !== expectedUserId) throw new Error('La contrasena no pudo confirmar la misma identidad.');
    token = result.data?.session?.access_token || '';
  }
  if (!token || !isCurrent()) throw new Error('La identidad cambio. Inicia nuevamente la operacion.');
  const verified = await supabase.auth.getUser(token);
  if (verified.error || verified.data?.user?.id !== expectedUserId || !isCurrent()) throw new Error('La identidad confirmada no coincide con tu cuenta.');
  let payload;
  try { payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { /* AM: Evidencia incompleta se rechaza. */ }
  const now = Math.floor(Date.now() / 1000);
  const events = Array.isArray(payload?.amr) ? payload.amr : [];
  const google = verified.data.user.app_metadata?.provider === 'google' || verified.data.user.identities?.some(identity => identity.provider === 'google');
  if (payload?.sub !== expectedUserId || !Number.isInteger(payload?.iat) || now - payload.iat > 300 || payload.iat > now + 60
    || !events.some(event => event.method === (method === 'google' ? 'oauth' : 'password')
      && (method !== 'google' || google) && Number.isInteger(event.timestamp)
      && event.timestamp >= startedAt - 1 && event.timestamp <= now + 60 && event.timestamp <= payload.iat + 60)) {
    throw new Error('Falta una autenticacion reciente valida. Confirma nuevamente tu identidad.');
  }
  return token;
}

export default function ClienteAccountDeletionDialog({
  open,
  onOpenChange,
  profile,
  expectedUserId,
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState("preview");
  const [preview, setPreview] = useState(null);
  const [requestInfo, setRequestInfo] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [password, setPassword] = useState("");
  const [reauthMethod, setReauthMethod] = useState("password");
  useEffect(relayDeletionGoogleResult, []);
  const [confirmationText, setConfirmationText] = useState("");
  const [acks, setAcks] = useState(() => ({
    acepta_perder_masterpuntos: false,
    acepta_cancelar_membresia: false,
    acepta_historial_anonimizado: false,
    acepta_irreversibilidad: false,
  }));
  const previewStartedRef = useRef(false);
  const createStartedRef = useRef(false);
  const confirmStartedRef = useRef(false);
  const idempotencyKeyRef = useRef("");

  const blockingReasons = useMemo(() => toMessageList(preview?.blocking_reasons), [preview?.blocking_reasons]);
  const consequences = useMemo(() => toMessageList(preview?.consequences), [preview?.consequences]);
  const consequenceDetails = useMemo(() => buildConsequenceDetails(preview), [preview]);
  const allAcknowledged = ACK_FIELDS.every((item) => acks[item.key] === true);
  const phraseMatches = confirmationText === CONFIRMATION_TEXT;
  const canConfirm = Boolean(requestInfo?.id_solicitud && allAcknowledged && phraseMatches && !confirming && !creatingRequest);

  const resetDialogState = useCallback(() => {
    setStep("preview");
    setPreview(null);
    setRequestInfo(null);
    setLoadingPreview(false);
    setCreatingRequest(false);
    setConfirming(false);
    setErrorMessage("");
    setPassword("");
    setReauthMethod("password");
    setConfirmationText("");
    setAcks({
      acepta_perder_masterpuntos: false,
      acepta_cancelar_membresia: false,
      acepta_historial_anonimizado: false,
      acepta_irreversibilidad: false,
    });
    previewStartedRef.current = false;
    createStartedRef.current = false;
    confirmStartedRef.current = false;
    idempotencyKeyRef.current = "";
  }, []);

  // AM: Invalidar respuestas pendientes cuando cambia la identidad o se cierra el dialogo.
  const generationRef = useRef(0);
  useLayoutEffect(() => {
    generationRef.current += 1;
    resetDialogState();
    return () => { generationRef.current += 1; };
  }, [open, expectedUserId, resetDialogState]);

  const loadPreview = useCallback(async () => {
    if (previewStartedRef.current) return;
    previewStartedRef.current = true;
    const generation = generationRef.current;
    setLoadingPreview(true);
    setErrorMessage("");
    try {
      const payload = await getClienteAccountDeletionPreview();
      if (generation === generationRef.current) setPreview(normalizePayload(payload));
    } catch (error) {
      if (generation !== generationRef.current) return;
      previewStartedRef.current = false;
      setErrorMessage(resolveFunctionalError(error, "No se pudo revisar si tu cuenta puede eliminarse."));
    } finally {
      if (generation === generationRef.current) setLoadingPreview(false);
    }
  }, []);

  const handleOpenChange = useCallback((nextOpen) => {
    if (!nextOpen && confirming) return;
    onOpenChange(nextOpen);
    if (!nextOpen) {
      resetDialogState();
    }
  }, [confirming, onOpenChange, resetDialogState]);

  useEffect(() => {
    if (!open) return;
    void loadPreview();
  }, [loadPreview, open, expectedUserId]);

  const handleCreateRequest = useCallback(async () => {
    if (!preview?.can_delete || createStartedRef.current) return;
    createStartedRef.current = true;
    const generation = generationRef.current;
    const current = () => generationRef.current === generation;
    setCreatingRequest(true);
    setErrorMessage("");
    try {
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = `cliente-account-deletion-${crypto.randomUUID()}`;
      }
      const payload = await createClienteAccountDeletionRequest({
        idempotencyKey: idempotencyKeyRef.current,
      });
      if (!current()) return;
      const normalized = normalizePayload(payload);
      const nextRequest = normalized?.request || null;
      setRequestInfo(nextRequest);
      if (nextRequest?.estado_codigo === "bloqueada") {
        setPreview(normalized?.preview || preview);
        setStep("blocked");
        return;
      }
      setStep("confirm");
    } catch (error) {
      if (!current()) return;
      createStartedRef.current = false;
      setErrorMessage(resolveFunctionalError(error, "No se pudo crear la solicitud de eliminacion."));
    } finally {
      if (current()) setCreatingRequest(false);
    }
  }, [preview]);

  const handleConfirm = useCallback(async () => {
    if (!canConfirm || confirmStartedRef.current) return;
    confirmStartedRef.current = true;
    const generation = generationRef.current;
    const current = () => generationRef.current === generation;
    setConfirming(true);
    setErrorMessage("");
    let reauthToken = "";
    try {
      reauthToken = await getFreshAccountDeletionReauthToken({
        expectedUserId,
        email: profile?.correo_principal,
        password, method: reauthMethod, isCurrent: current,
      });
      if (!current()) return;
      if (!ACK_FIELDS.every((item) => acks[item.key] === true) || confirmationText !== CONFIRMATION_TEXT) {
        throw new Error("Debes completar todas las confirmaciones requeridas.");
      }
      const payload = await confirmClienteAccountDeletionRequest(requestInfo.id_solicitud, {
        reauth_token: reauthToken,
        confirmacion_texto: confirmationText,
        ...acks,
      });
      if (!current()) return;
      const normalized = normalizePayload(payload);
      if (normalized?.ready_for_processing !== true || !normalized?.execution?.token || !normalized?.execution?.expires_at) {
        setPreview(normalized?.preview || preview);
        setStep("blocked");
        setPassword("");
        setConfirmationText("");
        return;
      }
      const saved = saveAccountDeletionContinuation({
        reference: normalized?.request?.referencia_publica || requestInfo?.referencia_publica,
        executionToken: normalized.execution.token,
        executionExpiresAt: normalized.execution.expires_at,
        savedAt: new Date().toISOString(),
      });
      if (!saved) {
        throw new Error("No se pudo resguardar temporalmente la continuacion de la eliminacion.");
      }
      setPassword("");
      setConfirmationText("");
      navigate("/eliminacion-de-cuenta", { replace: true });
    } catch (error) {
      if (!current()) return;
      confirmStartedRef.current = false;
      setErrorMessage(resolveFunctionalError(error, "No se pudo confirmar la eliminacion de la cuenta."));
    } finally {
      reauthToken = "";
      if (current()) setPassword("");
      if (current()) setConfirming(false);
    }
  }, [acks, canConfirm, confirmationText, expectedUserId, navigate, password, reauthMethod, preview, profile?.correo_principal, requestInfo]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Eliminar cuenta</DialogTitle>
          <DialogDescription>
            Revisa las consecuencias y confirma tu identidad antes de solicitar la eliminacion definitiva.
          </DialogDescription>
        </DialogHeader>

        {loadingPreview ? (
          <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4" aria-live="polite">
            <div className="flex items-center gap-3 text-sm text-[var(--mf-text)]">
              <Loader2 size={18} className="animate-spin text-[var(--mf-accent)]" />
              Estamos revisando si tu cuenta puede eliminarse.
            </div>
          </div>
        ) : null}

        {errorMessage ? (
          <div role="alert" className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
            {errorMessage}
          </div>
        ) : null}

        {!loadingPreview && preview && (preview.can_delete === false || step === "blocked") ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert size={20} className="mt-0.5 shrink-0 text-amber-200" />
                <div>
                  <p className="text-sm font-semibold text-[var(--mf-text)]">Tu cuenta no puede eliminarse todavia</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--mf-text-2)]">
                    Debes resolver estas operaciones antes de intentar eliminar tu cuenta.
                  </p>
                </div>
              </div>
            </div>
            <ul className="space-y-2">
              {blockingReasons.map((reason) => (
                <li key={`${reason.code}-${reason.message}`} className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3 text-sm text-[var(--mf-text)]">
                  {reason.message}
                  {reason.code ? <span className="mt-1 block text-[11px] uppercase tracking-[0.12em] text-[var(--mf-text-2)]">{reason.code}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!loadingPreview && preview?.can_delete === true && step === "preview" ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-200" />
                <div>
                  <p className="text-sm font-semibold text-[var(--mf-text)]">Consecuencias de eliminar tu cuenta</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--mf-text-2)]">
                    Esta accion desactiva tu acceso, cancela beneficios activos, elimina MasterPuntos disponibles y anonimiza tu informacion operativa.
                  </p>
                </div>
              </div>
            </div>
            <ul className="space-y-2">
              {[...consequenceDetails, ...consequences.map((item) => item.message)].filter(Boolean).map((message) => (
                <li key={message} className="flex gap-2 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-card)] p-3 text-sm text-[var(--mf-text)]">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[var(--mf-accent)]" />
                  <span>{message}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {step === "confirm" ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm leading-6 text-[var(--mf-text)]">
              Escribe la frase exacta y confirma cada reconocimiento para continuar. Esta accion no se puede deshacer.
            </div>
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-[var(--mf-text)]">Reconocimientos obligatorios</legend>
              {ACK_FIELDS.map((item) => (
                <label key={item.key} className="flex items-start gap-3 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3 text-sm text-[var(--mf-text)]">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-[var(--mf-accent)]"
                    checked={acks[item.key]}
                    disabled={confirming}
                    onChange={(event) => setAcks((prev) => ({ ...prev, [item.key]: event.target.checked }))}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </fieldset>

            <div className="space-y-2">
              <label htmlFor="account-delete-phrase" className="text-sm font-semibold text-[var(--mf-text)]">
                Escribe exactamente: {CONFIRMATION_TEXT}
              </label>
              <input
                id="account-delete-phrase"
                className="mf-input"
                value={confirmationText}
                disabled={confirming}
                autoComplete="off"
                onChange={(event) => setConfirmationText(event.target.value)}
              />
            </div>

            <div className="space-y-2">
                  {/* AM: Cada intento obtiene evidencia nueva; Google conserva el formulario original. */}
                  <label className="text-sm font-semibold" htmlFor="account-delete-password-method">Metodo de reautenticacion</label>
                  <select id="account-delete-password-method" className="mf-input w-full" value={reauthMethod} disabled={confirming} onChange={event => { setReauthMethod(event.target.value); setPassword(''); }}>
                    <option value="password">Contrasena</option><option value="google">Google</option>
                  </select>
                  <p className="text-xs text-[var(--mf-text-2)]">Google abrira una ventana nueva. Selecciona la misma cuenta para continuar aqui.</p>

              <label htmlFor="account-delete-password" className="text-sm font-semibold text-[var(--mf-text)]">
                Contrasena de la cuenta
              </label>
              <input
                id="account-delete-password" hidden={reauthMethod === "google"}
                type="password"
                className="mf-input"
                value={password}
                disabled={confirming}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
              />
              <p className="text-xs leading-5 text-[var(--mf-text-2)]">
                Selecciona Google para confirmar nuevamente tu identidad sin cerrar este formulario.
              </p>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-card)] px-4 text-sm font-semibold text-[var(--mf-text)]"
            disabled={confirming}
            onClick={() => handleOpenChange(false)}
          >
            Cerrar
          </button>
          {preview?.can_delete === true && step === "preview" ? (
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-red-400/40 bg-red-500/15 px-4 text-sm font-semibold text-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={creatingRequest}
              onClick={handleCreateRequest}
            >
              {creatingRequest ? "Creando solicitud..." : "Continuar"}
            </button>
          ) : null}
          {step === "confirm" ? (
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-400/40 bg-red-500/20 px-4 text-sm font-semibold text-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canConfirm}
              onClick={handleConfirm}
            >
              {confirming ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              {confirming ? "Confirmando..." : "Eliminar mi cuenta definitivamente"}
            </button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
