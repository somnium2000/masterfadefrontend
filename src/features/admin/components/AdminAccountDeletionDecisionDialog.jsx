import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog.jsx";
import { Button } from "../../../components/ui/button.jsx";
import { supabase } from "../../../config/supabaseClient.js";
import { useAuth } from "../../../context/AuthContext.jsx";
import {
  ADMIN_ACCOUNT_DELETION_APPROVAL_PHRASE,
  canSubmitApproval,
  isRejectCommentValid,
  sanitizeAdminAccountDeletionError,
} from "../lib/adminAccountDeletionFlow.js";

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
async function getFreshAdminDecisionReauthToken({ expectedUserId, email, password, method = 'password', isCurrent = () => true }) {
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

export default function AdminAccountDeletionDecisionDialog({
  open,
  mode,
  detail,
  onOpenChange,
  onApprove,
  onReject,
}) {
  const { user } = useAuth();
  const approving = mode === "approve";
  const [phrase, setPhrase] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [password, setPassword] = useState("");
  const [reauthMethod, setReauthMethod] = useState("password");
  useEffect(relayDeletionGoogleResult, []);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const generationRef = useRef(0);
  const operationRef = useRef(null);
  useLayoutEffect(() => {
    generationRef.current += 1;
    operationRef.current = null;
    setPhrase(''); setAcknowledged(false); setPassword(''); setComment(''); setSubmitting(false); setErrorMessage('');
    return () => { generationRef.current += 1; operationRef.current = null; };
  }, [open, mode, detail?.request?.id_solicitud, user?.id_usuario]);
  const permissions = detail?.permissions || {};
  const canSubmit = approving
    ? canSubmitApproval({ permissions, phrase, acknowledged, submitting })
    : isRejectCommentValid(comment) && !submitting;

  const reset = useCallback(() => {
    setPhrase("");
    setAcknowledged(false);
    setPassword("");
    setComment("");
    setSubmitting(false);
    setErrorMessage("");
  }, []);

  const handleOpenChange = useCallback((nextOpen) => {
    if (!nextOpen && submitting) return;
    onOpenChange(nextOpen);
    if (!nextOpen) reset();
  }, [onOpenChange, reset, submitting]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !open || operationRef.current) return;
    const generation = generationRef.current;
    const operation = {}; operationRef.current = operation;
    const current = () => generationRef.current === generation && operationRef.current === operation;
    setSubmitting(true);
    setErrorMessage("");
    let reauthToken = "";
    try {
      if (approving) {
        reauthToken = await getFreshAdminDecisionReauthToken({
          expectedUserId: user?.id_usuario,
          email: user?.email,
          password, method: reauthMethod, isCurrent: current,
        });
        if (!current()) return;
        await onApprove({
          reauthToken,
          phrase,
          acknowledged,
          comment,
        });
      } else {
        await onReject(comment);
      }
      if (!current()) return;
      onOpenChange(false);
      reset();
    } catch (error) {
      if (current()) setErrorMessage(sanitizeAdminAccountDeletionError(error));
    } finally {
      reauthToken = "";
      if (current()) {
        operationRef.current = null;
        setPassword("");
        setSubmitting(false);
      }
    }
  }, [acknowledged, approving, canSubmit, comment, onOpenChange, reset, open, onApprove, onReject, password, reauthMethod, phrase, user?.email, user?.id_usuario]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{approving ? "Aprobar eliminacion de cuenta" : "Rechazar solicitud"}</DialogTitle>
          <DialogDescription>
            {approving
              ? "Esta aprobacion inicia un proceso irreversible sobre una cuenta interna."
              : "La cuenta del solicitante permanecera activa."}
          </DialogDescription>
        </DialogHeader>

        {errorMessage ? (
          <div role="alert" className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
            {errorMessage}
          </div>
        ) : null}

        {approving ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-[var(--mf-text)]">
              Las dependencias bloqueantes deben estar en cero antes de aprobar.
            </div>
            <label className="flex items-start gap-3 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3 text-sm text-[var(--mf-text)]">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-[var(--mf-accent)]"
                checked={acknowledged}
                disabled={submitting}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              <span>Entiendo que esta accion es irreversible una vez aprobada.</span>
            </label>
            <div className="space-y-2">
              <label htmlFor="admin-account-delete-phrase" className="text-sm font-semibold text-[var(--mf-text)]">
                Escribe exactamente: {ADMIN_ACCOUNT_DELETION_APPROVAL_PHRASE}
              </label>
              <input id="admin-account-delete-phrase" className="mf-input" value={phrase} disabled={submitting} onChange={(event) => setPhrase(event.target.value)} />
            </div>
            <div className="space-y-2">
                  {/* AM: Cada intento obtiene evidencia nueva; Google conserva el formulario original. */}
                  <label className="text-sm font-semibold" htmlFor="admin-account-delete-password-method">Metodo de reautenticacion</label>
                  <select id="admin-account-delete-password-method" className="mf-input w-full" value={reauthMethod} disabled={submitting} onChange={event => { setReauthMethod(event.target.value); setPassword(''); }}>
                    <option value="password">Contrasena</option><option value="google">Google</option>
                  </select>
                  <p className="text-xs text-[var(--mf-text-2)]">Google abrira una ventana nueva. Selecciona la misma cuenta para continuar aqui.</p>

              <label htmlFor="admin-account-delete-password" className="text-sm font-semibold text-[var(--mf-text)]">
                Contrasena de la cuenta
              </label>
              <input id="admin-account-delete-password" hidden={reauthMethod === "google"} type="password" className="mf-input" value={password} disabled={submitting} autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} />
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <label htmlFor="admin-account-delete-comment" className="text-sm font-semibold text-[var(--mf-text)]">
            {approving ? "Comentario opcional" : "Motivo de rechazo"}
          </label>
          <textarea
            id="admin-account-delete-comment"
            className="mf-input min-h-24 resize-y"
            maxLength={500}
            value={comment}
            disabled={submitting}
            onChange={(event) => setComment(event.target.value)}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={submitting} onClick={() => handleOpenChange(false)}>
            Volver
          </Button>
          <Button type="button" variant={approving ? "default" : "destructive"} disabled={!canSubmit} onClick={handleSubmit} className="gap-2">
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            {approving ? "Aprobar" : "Rechazar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
