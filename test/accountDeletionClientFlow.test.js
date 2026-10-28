import test from "node:test";
import assert from "node:assert/strict";

import {
  ACCOUNT_DELETION_CONTINUATION_KEY,
  classifyAccountDeletionExecutionError,
  classifyAccountDeletionExecutionResult,
  clearAccountDeletionContinuation,
  normalizeAccountDeletionResponse,
  readAccountDeletionContinuation,
  resolveAccountDeletionErrorCode,
  saveAccountDeletionContinuation,
  shouldKeepAccountDeletionContinuationForFailure,
} from "../src/features/cliente/lib/accountDeletionContinuation.js";

const VALID_REFERENCE = "DEL-ABCDEF123456";
const VALID_TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO12";
const VALID_EXPIRES_AT = "2026-07-11T12:10:00.000Z";

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

function validContinuation(overrides = {}) {
  return {
    reference: VALID_REFERENCE,
    executionToken: VALID_TOKEN,
    executionExpiresAt: VALID_EXPIRES_AT,
    savedAt: "2026-07-11T12:00:00.000Z",
    ...overrides,
  };
}

test("guarda continuacion valida", () => {
  const storage = createMemoryStorage();
  const saved = saveAccountDeletionContinuation(validContinuation(), storage);
  assert.equal(saved.reference, VALID_REFERENCE);
  assert.equal(saved.executionToken, VALID_TOKEN);
  assert.ok(storage.getItem(ACCOUNT_DELETION_CONTINUATION_KEY));
});

test("lee continuacion valida", () => {
  const storage = createMemoryStorage();
  saveAccountDeletionContinuation(validContinuation(), storage);
  const read = readAccountDeletionContinuation(storage);
  assert.equal(read.reference, VALID_REFERENCE);
  assert.equal(read.executionExpiresAt, VALID_EXPIRES_AT);
});

test("limpia continuacion", () => {
  const storage = createMemoryStorage();
  saveAccountDeletionContinuation(validContinuation(), storage);
  clearAccountDeletionContinuation(storage);
  assert.equal(readAccountDeletionContinuation(storage), null);
});

test("referencia invalida se rechaza", () => {
  const storage = createMemoryStorage();
  const saved = saveAccountDeletionContinuation(validContinuation({ reference: "bad" }), storage);
  assert.equal(saved, null);
  assert.equal(storage.getItem(ACCOUNT_DELETION_CONTINUATION_KEY), null);
});

test("token demasiado corto se rechaza", () => {
  const storage = createMemoryStorage();
  assert.equal(saveAccountDeletionContinuation(validContinuation({ executionToken: "short" }), storage), null);
});

test("token demasiado largo se rechaza", () => {
  const storage = createMemoryStorage();
  assert.equal(saveAccountDeletionContinuation(validContinuation({ executionToken: "x".repeat(101) }), storage), null);
});

test("JSON corrupto se limpia", () => {
  const storage = createMemoryStorage();
  storage.setItem(ACCOUNT_DELETION_CONTINUATION_KEY, "{bad-json");
  assert.equal(readAccountDeletionContinuation(storage), null);
  assert.equal(storage.getItem(ACCOUNT_DELETION_CONTINUATION_KEY), null);
});

test("no almacena IDs internos", () => {
  const storage = createMemoryStorage();
  saveAccountDeletionContinuation(validContinuation({ id_usuario: "u", id_cliente: "c", id_persona: "p" }), storage);
  const raw = storage.getItem(ACCOUNT_DELETION_CONTINUATION_KEY);
  assert.doesNotMatch(raw, /id_usuario|id_cliente|id_persona/);
});

test("no almacena correo", () => {
  const storage = createMemoryStorage();
  saveAccountDeletionContinuation(validContinuation({ email: "cliente@example.com" }), storage);
  assert.doesNotMatch(storage.getItem(ACCOUNT_DELETION_CONTINUATION_KEY), /cliente@example.com|email/);
});

test("no almacena contrasena", () => {
  const storage = createMemoryStorage();
  saveAccountDeletionContinuation(validContinuation({ password: "secret" }), storage);
  assert.doesNotMatch(storage.getItem(ACCOUNT_DELETION_CONTINUATION_KEY), /secret|password/);
});

test("no almacena reauth token", () => {
  const storage = createMemoryStorage();
  saveAccountDeletionContinuation(validContinuation({ reauth_token: "jwt-token" }), storage);
  assert.doesNotMatch(storage.getItem(ACCOUNT_DELETION_CONTINUATION_KEY), /reauth|jwt-token/);
});

test("normaliza correctamente respuesta data", () => {
  const payload = { completed: true };
  assert.equal(normalizeAccountDeletionResponse({ data: payload }), payload);
});

test("resuelve codigo funcional del error", () => {
  const error = { data: { error: { code: "CLIENT_ACCOUNT_DELETION_BLOCKED" } } };
  assert.equal(resolveAccountDeletionErrorCode(error), "CLIENT_ACCOUNT_DELETION_BLOCKED");
});

test("clasifica fallo reintentable", () => {
  const error = { status: 503, data: { data: { retryable: true } } };
  assert.equal(classifyAccountDeletionExecutionError(error), "reintento");
});

test("clasifica bloqueo", () => {
  const error = { data: { error: { code: "CLIENT_ACCOUNT_DELETION_BLOCKED" } } };
  assert.equal(classifyAccountDeletionExecutionError(error), "bloqueada");
});

test("clasifica reautenticacion requerida", () => {
  const error = { data: { error: { code: "CLIENT_ACCOUNT_DELETION_REAUTH_REQUIRED" } } };
  assert.equal(classifyAccountDeletionExecutionError(error), "reautenticacion_requerida");
});

test("clasifica credencial invalida", () => {
  const error = { data: { error: { code: "CLIENT_ACCOUNT_DELETION_EXECUTION_CREDENTIAL_INVALID" } } };
  assert.equal(classifyAccountDeletionExecutionError(error), "credencial_invalida");
});

test("error de red conserva continuacion", () => {
  const error = new Error("network");
  assert.equal(classifyAccountDeletionExecutionError(error), "red");
  assert.equal(shouldKeepAccountDeletionContinuationForFailure(error), true);
});

test("exito indica que debe limpiarse la continuacion", () => {
  assert.equal(classifyAccountDeletionExecutionResult({ completed: true }), "completada");
});

test("registro almacenado no contiene token en una URL", () => {
  const storage = createMemoryStorage();
  saveAccountDeletionContinuation(validContinuation(), storage);
  const raw = storage.getItem(ACCOUNT_DELETION_CONTINUATION_KEY);
  assert.doesNotMatch(raw, /https?:\/\//);
  assert.doesNotMatch(raw, /executionToken=.*[?&]/);
});
