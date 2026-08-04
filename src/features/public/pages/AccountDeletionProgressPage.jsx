import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Home, Loader2, RotateCw, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext.jsx";
import { executePublicAccountDeletion } from "../../cliente/lib/clienteApi.js";
import {
  classifyAccountDeletionExecutionError,
  classifyAccountDeletionExecutionResult,
  clearAccountDeletionContinuation,
  readAccountDeletionContinuation,
  resolveAccountDeletionErrorMessage,
} from "../../cliente/lib/accountDeletionContinuation.js";

function getBlockingReasons(error) {
  const reasons = error?.data?.error?.details?.blocking_reasons;
  if (!Array.isArray(reasons)) return [];
  return reasons
    .map((item) => ({
      code: String(item?.code || "").trim(),
      message: String(item?.message || "").trim(),
    }))
    .filter((item) => item.message);
}

function getRequestStatus(payloadOrError) {
  return String(payloadOrError?.request?.status || payloadOrError?.data?.data?.request?.status || "").trim();
}

export default function AccountDeletionProgressPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [state, setState] = useState("preparando");
  const [message, setMessage] = useState("");
  const [blockingReasons, setBlockingReasons] = useState([]);
  const startedRef = useRef(false);
  const executingRef = useRef(false);

  const executeDeletion = useCallback(async ({ manual = false } = {}) => {
    if (executingRef.current) return;
    executingRef.current = true;
    setBlockingReasons([]);
    setMessage("");
    setState(manual ? "reintento" : "procesando");

    const continuation = readAccountDeletionContinuation();
    if (!continuation) {
      setState("sin_continuacion");
      executingRef.current = false;
      return;
    }

    try {
      const result = await executePublicAccountDeletion(continuation.reference, continuation.executionToken);
      const classification = classifyAccountDeletionExecutionResult(result);
      const requestStatus = getRequestStatus(result);

      if (classification === "completada") {
        clearAccountDeletionContinuation();
        await logout();
        setState("completada");
        return;
      }

      if (classification === "reintento") {
        if (requestStatus === "storage_pendiente" || requestStatus === "auth_pendiente") {
          await logout();
        }
        setState("reintento");
        return;
      }

      setState("error");
      setMessage("No fue posible completar la eliminacion en este momento.");
    } catch (error) {
      const classification = classifyAccountDeletionExecutionError(error);
      const requestStatus = getRequestStatus(error);

      if (classification === "reintento" || classification === "red") {
        if (requestStatus === "storage_pendiente" || requestStatus === "auth_pendiente") {
          await logout();
        }
        setState("reintento");
        setMessage(classification === "red" ? "No pudimos confirmar el estado final. Reintenta sin crear otra solicitud." : "");
        return;
      }

      if (classification === "bloqueada") {
        clearAccountDeletionContinuation();
        setBlockingReasons(getBlockingReasons(error));
        setState("bloqueada");
        return;
      }

      if (classification === "reautenticacion_requerida") {
        clearAccountDeletionContinuation();
        setState("reautenticacion_requerida");
        return;
      }

      if (classification === "credencial_invalida") {
        clearAccountDeletionContinuation();
        setState("error");
        setMessage("No fue posible validar la continuacion de eliminacion. Repite el proceso desde tu perfil.");
        return;
      }

      setState("error");
      setMessage(resolveAccountDeletionErrorMessage(error, "No fue posible completar la eliminacion en este momento."));
    } finally {
      executingRef.current = false;
    }
  }, [logout]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void executeDeletion();
  }, [executeDeletion]);

  const isWorking = state === "preparando" || state === "procesando";

  return (
    <main className="mf-page-gradient min-h-screen px-4 py-8 text-[var(--mf-text)]">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-2xl items-center">
        <div className="mf-glass-surface w-full rounded-[28px] border border-[var(--mf-nav-border)] p-6 shadow-[var(--mf-shadow-card)] sm:p-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--mf-text-2)] hover:text-[var(--mf-accent)]">
              <Home size={16} />
              Inicio MasterFade
            </Link>
          </div>

          {isWorking ? (
            <div aria-live="polite" className="space-y-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)]">
                <Loader2 size={26} className="animate-spin text-[var(--mf-accent)] motion-reduce:animate-none" />
              </div>
              <div>
                <h1 className="mf-font-display text-3xl text-[var(--mf-text)]">Estamos eliminando tu cuenta</h1>
                <p className="mt-3 text-sm leading-6 text-[var(--mf-text-2)]">
                  No cierres esta pestaña mientras completamos la eliminacion de tus archivos y acceso.
                </p>
              </div>
            </div>
          ) : null}

          {state === "reintento" ? (
            <div className="space-y-5">
              <AlertTriangle size={34} className="text-amber-200" />
              <div>
                <h1 className="mf-font-display text-3xl">El proceso todavia no ha finalizado</h1>
                <p className="mt-3 text-sm leading-6 text-[var(--mf-text-2)]">
                  Tu cuenta ya esta siendo eliminada. Puedes reintentar de forma segura sin duplicar operaciones.
                </p>
                {message ? <p role="alert" className="mt-3 text-sm text-amber-100">{message}</p> : null}
              </div>
              <button
                type="button"
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-4 text-sm font-semibold"
                disabled={executingRef.current}
                onClick={() => executeDeletion({ manual: true })}
              >
                <RotateCw size={16} />
                Reintentar eliminacion
              </button>
            </div>
          ) : null}

          {state === "bloqueada" ? (
            <div className="space-y-5">
              <AlertTriangle size={34} className="text-amber-200" />
              <div>
                <h1 className="mf-font-display text-3xl">No se pudo eliminar la cuenta</h1>
                <p className="mt-3 text-sm leading-6 text-[var(--mf-text-2)]">
                  Debes resolver estos bloqueos antes de repetir el proceso.
                </p>
              </div>
              {blockingReasons.length ? (
                <ul className="space-y-2">
                  {blockingReasons.map((reason) => (
                    <li key={`${reason.code}-${reason.message}`} className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3 text-sm">
                      {reason.message}
                      {reason.code ? <span className="mt-1 block text-[11px] uppercase tracking-[0.12em] text-[var(--mf-text-2)]">{reason.code}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              <button
                type="button"
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-4 text-sm font-semibold"
                onClick={() => navigate("/home/cliente/perfil", { replace: true })}
              >
                <UserRound size={16} />
                Volver a mi perfil
              </button>
            </div>
          ) : null}

          {state === "reautenticacion_requerida" ? (
            <div className="space-y-5">
              <AlertTriangle size={34} className="text-amber-200" />
              <div>
                <h1 className="mf-font-display text-3xl">Confirma tu identidad otra vez</h1>
                <p className="mt-3 text-sm leading-6 text-[var(--mf-text-2)]">
                  La confirmacion de identidad vencio antes de iniciar la eliminacion.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-4 text-sm font-semibold"
                onClick={() => navigate("/home/cliente/perfil", { replace: true })}
              >
                Volver a mi perfil
              </button>
            </div>
          ) : null}

          {state === "completada" ? (
            <div className="space-y-5">
              <CheckCircle2 size={38} className="text-emerald-200" />
              <div>
                <h1 className="mf-font-display text-3xl">Tu cuenta fue eliminada</h1>
                <p className="mt-3 text-sm leading-6 text-[var(--mf-text-2)]">
                  Tu acceso fue cerrado y tu informacion operativa fue anonimizada. Los registros que deban conservarse por motivos financieros, fiscales o de auditoria permaneceran protegidos.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link to="/" className="inline-flex h-11 items-center rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-4 text-sm font-semibold">
                  Volver al inicio
                </Link>
                <Link to="/register" className="inline-flex h-11 items-center rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-card)] px-4 text-sm font-semibold">
                  Crear una cuenta nueva
                </Link>
              </div>
            </div>
          ) : null}

          {state === "sin_continuacion" ? (
            <div className="space-y-5">
              <AlertTriangle size={34} className="text-[var(--mf-accent)]" />
              <div>
                <h1 className="mf-font-display text-3xl">No hay una eliminacion en curso</h1>
                <p className="mt-3 text-sm leading-6 text-[var(--mf-text-2)]">
                  Inicia el proceso desde tu perfil para confirmar tu identidad y continuar.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-11 items-center rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-4 text-sm font-semibold"
                onClick={() => navigate("/home/cliente/perfil", { replace: true })}
              >
                Volver a mi perfil
              </button>
            </div>
          ) : null}

          {state === "error" ? (
            <div className="space-y-5">
              <AlertTriangle size={34} className="text-red-200" />
              <div>
                <h1 className="mf-font-display text-3xl">No fue posible completar la eliminacion</h1>
                <p role="alert" className="mt-3 text-sm leading-6 text-[var(--mf-text-2)]">
                  {message || "Repite el proceso desde tu perfil si deseas intentarlo nuevamente."}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-11 items-center rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-4 text-sm font-semibold"
                onClick={() => navigate("/home/cliente/perfil", { replace: true })}
              >
                Volver a mi perfil
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
