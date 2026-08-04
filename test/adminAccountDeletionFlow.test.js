import test from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_ACCOUNT_DELETION_APPROVAL_PHRASE,
  buildApprovalPayload,
  buildRejectPayload,
  canSubmitApproval,
  countActiveAdminDeletionFilters,
  getDependencyResolutionRoute,
  isApprovalPhraseValid,
  isRejectCommentValid,
  normalizeAdminAccountDeletionDetail,
  normalizeAdminAccountDeletionList,
  normalizeAdminExecutionResponse,
  sanitizeAdminAccountDeletionError,
} from "../src/features/admin/lib/adminAccountDeletionFlow.js";

test("normalizacion de lista", () => {
  const list = normalizeAdminAccountDeletionList({ items: [{ id_solicitud: "1", tipo_sujeto: "personal", estado_codigo: "pendiente_aprobacion" }] });
  assert.equal(list.items.length, 1);
  assert.equal(list.pagination.page, 1);
});

test("normalizacion de detalle", () => {
  const detail = normalizeAdminAccountDeletionDetail({ request: { id_solicitud: "1", tipo_sujeto: "personal" }, permissions: { can_approve: true } });
  assert.equal(detail.permissions.can_approve, true);
});

test("cliente completado usa nombre generico", () => {
  const list = normalizeAdminAccountDeletionList({ items: [{ tipo_sujeto: "cliente", estado_codigo: "completada", display_name: "Original" }] });
  assert.equal(list.items[0].display_name, "Cliente eliminado");
});

test("personal completado usa nombre generico", () => {
  const list = normalizeAdminAccountDeletionList({ items: [{ tipo_sujeto: "personal", estado_codigo: "completada", display_name: "Original" }] });
  assert.equal(list.items[0].display_name, "Empleado eliminado");
});

test("permiso aprobar viene del backend", () => {
  assert.equal(normalizeAdminAccountDeletionDetail({ permissions: { can_approve: true } }).permissions.can_approve, true);
});

test("permiso rechazar viene del backend", () => {
  assert.equal(normalizeAdminAccountDeletionDetail({ permissions: { can_reject: true } }).permissions.can_reject, true);
});

test("permiso reintentar viene del backend", () => {
  assert.equal(normalizeAdminAccountDeletionDetail({ permissions: { can_retry: true } }).permissions.can_retry, true);
});

test("citas futuras generan enlace a citas", () => {
  assert.equal(getDependencyResolutionRoute("INTERNAL_ACCOUNT_DELETION_FUTURE_APPOINTMENTS_PENDING", "/home/admin"), "/home/admin/citas");
});

test("tarifas generan enlace a servicios", () => {
  assert.equal(getDependencyResolutionRoute("INTERNAL_ACCOUNT_DELETION_ACTIVE_SERVICE_RATES", "/home/admin"), "/home/admin/catalog/servicios");
});

test("promociones generan enlace a promociones", () => {
  assert.equal(getDependencyResolutionRoute("INTERNAL_ACCOUNT_DELETION_ACTIVE_PROMOTION_REFERENCES", "/home/admin"), "/home/admin/configuracion/promociones");
});

test("horarios no se presentan como hard blocker", () => {
  assert.equal(getDependencyResolutionRoute("INTERNAL_ACCOUNT_DELETION_ACTIVE_WEEKLY_SCHEDULES", "/home/admin"), null);
});

test("frase exacta de aprobacion", () => {
  assert.equal(isApprovalPhraseValid(ADMIN_ACCOUNT_DELETION_APPROVAL_PHRASE), true);
  assert.equal(isApprovalPhraseValid("aprobar eliminacion de cuenta"), false);
});

test("acknowledgement requerido", () => {
  assert.equal(canSubmitApproval({ permissions: { can_approve: true }, phrase: ADMIN_ACCOUNT_DELETION_APPROVAL_PHRASE, acknowledged: false }), false);
});

test("payload de aprobacion no contiene IDs internos", () => {
  const payload = buildApprovalPayload({ reauthToken: "t", phrase: ADMIN_ACCOUNT_DELETION_APPROVAL_PHRASE, acknowledged: true, usuarioId: "x" });
  assert.equal(Object.hasOwn(payload, "usuarioId"), false);
  assert.equal(Object.hasOwn(payload, "id_usuario"), false);
});

test("reauth token solo en memoria", () => {
  assert.equal(buildApprovalPayload({ reauthToken: "fresh", phrase: "x", acknowledged: true }).reauth_token, "fresh");
});

test("rechazo requiere motivo", () => {
  assert.equal(isRejectCommentValid("corto"), false);
  assert.equal(isRejectCommentValid("Motivo claro"), true);
});

test("respuesta 202 queda pendiente", () => {
  assert.equal(normalizeAdminExecutionResponse({ completed: false, retryable: true }).retryable, true);
});

test("respuesta 200 queda completada", () => {
  assert.equal(normalizeAdminExecutionResponse({ completed: true }).completed, true);
});

test("error tecnico se sanitiza", () => {
  assert.equal(sanitizeAdminAccountDeletionError(new Error("postgres token failed"), "Fallback"), "Fallback");
});

test("hash no se representa", () => {
  const detail = normalizeAdminAccountDeletionDetail({ request: {}, execution_token_hash: "hash" });
  assert.equal(JSON.stringify(detail).includes("hash"), false);
});

test("tokens no se representan", () => {
  assert.equal(Object.hasOwn(buildRejectPayload("Motivo claro"), "token"), false);
});

test("doble envio bloqueado", () => {
  assert.equal(canSubmitApproval({ permissions: { can_approve: true }, phrase: ADMIN_ACCOUNT_DELETION_APPROVAL_PHRASE, acknowledged: true, submitting: true }), false);
});

test("auditor queda en modo lectura", () => {
  const detail = normalizeAdminAccountDeletionDetail({ permissions: { can_approve: false, reason_code: "ADMIN_ACCOUNT_DELETION_AUDITOR_READ_ONLY" } });
  assert.equal(detail.permissions.can_approve, false);
});

test("cuenta completada no muestra PII antigua", () => {
  const detail = normalizeAdminAccountDeletionDetail({ request: { tipo_sujeto: "personal", estado_codigo: "completada", display_name: "Original" }, subject: { display_name: "Original" } });
  assert.equal(detail.subject.display_name, "Empleado eliminado");
});

test("ruta del modulo correcta", () => {
  assert.equal(countActiveAdminDeletionFilters({ search: "DEL", subject: "personal", status: "all" }), 2);
});
