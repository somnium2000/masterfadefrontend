import test from "node:test";
import assert from "node:assert/strict";
import {
  INTERNAL_ACCOUNT_DELETION_ALLOWED_ROLES,
  INTERNAL_ACCOUNT_DELETION_ACTIVE_MESSAGE,
  INTERNAL_ACCOUNT_DELETION_PHRASE,
  areInternalAcknowledgementsComplete,
  buildInternalAccountDeletionCreatePayload,
  canSubmitInternalAccountDeletion,
  createInternalAccountDeletionIdempotencyKey,
  getVisibleInternalDependencies,
  isInternalAccountProtected,
  isInternalCancellationAllowed,
  isInternalPhraseValid,
  mapInternalRequestState,
  normalizeInternalAccountDeletionPreview,
  normalizeInternalAccountDeletionRequest,
  sanitizeInternalAccountDeletionError,
} from "../src/features/account/lib/internalAccountDeletionFlow.js";

const preview = {
  can_request: true,
  dependencies: {
    active_roles: ["admin"],
    active_employee_records: 1,
    branches_assigned: 1,
    future_operational_appointments: 3,
    active_weekly_schedules: 2,
  },
  consequences: {
    account_remains_active_until_decision: true,
  },
};

const acks = {
  acknowledge_account_remains_active: true,
  acknowledge_operational_dependencies: true,
  acknowledge_access_revocation: true,
  acknowledge_history_retention: true,
};

test("normaliza preview", () => {
  const normalized = normalizeInternalAccountDeletionPreview({ data: preview });
  assert.equal(normalized.can_request, true);
  assert.equal(normalized.requires_approval, true);
  assert.deepEqual(normalized.dependencies.active_roles, ["admin"]);
});

test("detecta cuenta protegida", () => {
  assert.equal(isInternalAccountProtected({
    can_request: false,
    blocking_reasons: [{ code: "INTERNAL_ACCOUNT_DELETION_PROTECTED", message: "Protegida" }],
  }), true);
});

test("dependencias con citas", () => {
  const items = getVisibleInternalDependencies(preview);
  assert.equal(items.some((item) => item.key === "future_operational_appointments" && item.count === 3), true);
});

test("dependencias sin registros", () => {
  assert.deepEqual(getVisibleInternalDependencies({ can_request: true, dependencies: {} }), []);
});

test("frase exacta valida", () => {
  assert.equal(isInternalPhraseValid(INTERNAL_ACCOUNT_DELETION_PHRASE), true);
});

test("frase incorrecta", () => {
  assert.equal(isInternalPhraseValid("solicitar eliminacion de mi cuenta"), false);
});

test("cuatro acknowledgements requeridos", () => {
  assert.equal(areInternalAcknowledgementsComplete(acks), true);
  assert.equal(areInternalAcknowledgementsComplete({ ...acks, acknowledge_history_retention: false }), false);
});

test("payload no contiene IDs", () => {
  const payload = buildInternalAccountDeletionCreatePayload({
    idempotencyKey: "internal-account-deletion-abc",
    reauthToken: "reauth-token",
    confirmationPhrase: INTERNAL_ACCOUNT_DELETION_PHRASE,
    acknowledgements: acks,
    usuarioId: "forbidden",
    empleadoId: "forbidden",
  });
  assert.equal(Object.hasOwn(payload, "usuarioId"), false);
  assert.equal(Object.hasOwn(payload, "empleadoId"), false);
  assert.equal(Object.hasOwn(payload, "id_usuario"), false);
  assert.equal(Object.hasOwn(payload, "id_empleado"), false);
});

test("payload contiene reauth token solo en memoria", () => {
  const payload = buildInternalAccountDeletionCreatePayload({
    idempotencyKey: "internal-account-deletion-abc",
    reauthToken: "fresh-token",
    confirmationPhrase: INTERNAL_ACCOUNT_DELETION_PHRASE,
    acknowledgements: acks,
  });
  assert.equal(payload.reauth_token, "fresh-token");
});

test("APP JWT no se usa como reauth", () => {
  const payload = buildInternalAccountDeletionCreatePayload({
    idempotencyKey: "internal-account-deletion-abc",
    reauthToken: "",
    appJwt: "cookie-session",
    confirmationPhrase: INTERNAL_ACCOUNT_DELETION_PHRASE,
    acknowledgements: acks,
  });
  assert.equal(payload.reauth_token, "");
  assert.equal(Object.hasOwn(payload, "appJwt"), false);
});

test("solicitud pendiente se representa correctamente", () => {
  const request = normalizeInternalAccountDeletionRequest({
    id_solicitud: "id",
    referencia_publica: "DEL-123",
    estado_codigo: "pendiente_aprobacion",
    requiere_aprobacion: true,
  });
  assert.equal(request.can_cancel, true);
  assert.equal(mapInternalRequestState(request).title, "Solicitud pendiente de revision");
});

test("cancelacion permitida en pendiente", () => {
  assert.equal(isInternalCancellationAllowed({ estado_codigo: "pendiente_aprobacion", can_cancel: true }), true);
});

test("cancelacion no permitida despues de decision", () => {
  assert.equal(isInternalCancellationAllowed({ estado_codigo: "aprobada", can_cancel: false }), false);
});

test("mensaje de cuenta activa", () => {
  assert.match(mapInternalRequestState(null).accountActiveMessage, /continuara activa/);
  assert.equal(INTERNAL_ACCOUNT_DELETION_ACTIVE_MESSAGE.includes("continuara activa"), true);
});

test("error funcional sanitizado", () => {
  assert.equal(sanitizeInternalAccountDeletionError(new Error("postgres relation failed"), "Fallback"), "Fallback");
  assert.equal(sanitizeInternalAccountDeletionError(new Error("La solicitud ya no puede cancelarse.")), "La solicitud ya no puede cancelarse.");
});

test("doble envio bloqueado", () => {
  assert.equal(canSubmitInternalAccountDeletion({
    preview,
    phrase: INTERNAL_ACCOUNT_DELETION_PHRASE,
    acknowledgements: acks,
    submitting: true,
  }), false);
});

test("no se genera token de continuacion", () => {
  const payload = buildInternalAccountDeletionCreatePayload({
    idempotencyKey: "internal-account-deletion-abc",
    reauthToken: "fresh-token",
    confirmationPhrase: INTERNAL_ACCOUNT_DELETION_PHRASE,
    acknowledgements: acks,
  });
  assert.equal(Object.keys(payload).some((key) => key.includes("execution") || key.includes("continuation")), false);
});

test("no se usa sessionStorage", () => {
  assert.equal(String(createInternalAccountDeletionIdempotencyKey).includes("sessionStorage"), false);
});

test("no se navega a la ruta publica del cliente", () => {
  assert.equal(String(mapInternalRequestState).includes("/eliminacion-de-cuenta"), false);
});

test("cliente no esta incluido en roles permitidos", () => {
  assert.equal(INTERNAL_ACCOUNT_DELETION_ALLOWED_ROLES.includes("cliente"), false);
});
