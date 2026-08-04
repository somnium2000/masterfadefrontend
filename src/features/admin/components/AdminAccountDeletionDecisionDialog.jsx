import { useCallback, useState } from "react";
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

async function getFreshAdminDecisionReauthToken({ expectedUserId, email, password }) {
  if (!supabase) throw new Error("Supabase no esta configurado para confirmar tu identidad.");
  const expected = String(expectedUserId || "").trim();
  const sessionResult = await supabase.auth.getSession();
  const currentSession = sessionResult?.data?.session;
  if (currentSession?.user?.id && String(currentSession.user.id) === expected) {
    const refreshed = await supabase.auth.refreshSession();
    const refreshedSession = refreshed?.data?.session;
    const refreshedUserId = String(refreshed?.data?.user?.id || refreshedSession?.user?.id || "").trim();
    const token = String(refreshedSession?.access_token || "").trim();
    if (refreshed?.error || refreshedUserId !== expected || !token) {
      throw new Error("No se pudo confirmar tu identidad administrativa.");
    }
    return token;
  }
  if (!password) throw new Error("Ingresa tu contrasena para confirmar tu identidad.");
  const passwordResult = await supabase.auth.signInWithPassword({
    email: String(email || "").trim().toLowerCase(),
    password,
  });
  const userId = String(passwordResult?.data?.user?.id || "").trim();
  const token = String(passwordResult?.data?.session?.access_token || "").trim();
  if (passwordResult?.error || userId !== expected || !token) {
    throw new Error("No se pudo confirmar tu identidad administrativa.");
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
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
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
    if (!canSubmit) return;
    setSubmitting(true);
    setErrorMessage("");
    let reauthToken = "";
    try {
      if (approving) {
        reauthToken = await getFreshAdminDecisionReauthToken({
          expectedUserId: user?.id_usuario,
          email: user?.email,
          password,
        });
        await onApprove({
          reauthToken,
          phrase,
          acknowledged,
          comment,
        });
      } else {
        await onReject(comment);
      }
      handleOpenChange(false);
    } catch (error) {
      setErrorMessage(sanitizeAdminAccountDeletionError(error));
    } finally {
      reauthToken = "";
      setPassword("");
      setSubmitting(false);
    }
  }, [acknowledged, approving, canSubmit, comment, handleOpenChange, onApprove, onReject, password, phrase, user?.email, user?.id_usuario]);

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
              <label htmlFor="admin-account-delete-password" className="text-sm font-semibold text-[var(--mf-text)]">
                Contrasena si tu sesion Supabase no esta disponible
              </label>
              <input id="admin-account-delete-password" type="password" className="mf-input" value={password} disabled={submitting} autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} />
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
