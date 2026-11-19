import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { test } from "node:test";

const { chromium } = createRequire(import.meta.url)(process.env.MASTERFADE_PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.MASTERFADE_BROWSER_URL || "http://qa.masterfadeapp.com:4173";
const CLIENT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const BRANCH = "33333333-3333-4333-8333-333333333333";
const ORDER = "44444444-4444-4444-8444-444444444444";
const INTENT = "55555555-5555-4555-8555-555555555555";
const SUBSCRIPTION = "66666666-6666-4666-8666-666666666666";
const screenshotDir = String(process.env.MASTERFADE_SCREENSHOT_DIR || "").trim();

const names = ["MASTER BLACK", "MASTER ELITE", "MASTER EXPERIENCIA", "Máster Royal"];
const prices = [300, 600, 1000, 1500];
const catalogPlans = names.map((nombre_plan, index) => ({
  id_plan: `70000000-0000-4000-8000-00000000000${index}`,
  id_plan_sucursal: `80000000-0000-4000-8000-00000000000${index}`,
  id_sucursal: BRANCH,
  nombre_plan,
  descripcion: `Plan QA ${index + 1}`,
  precio_hnl: prices[index],
  periodo_membresia_codigo: "mensual",
  categoria_nivel: index + 1,
  beneficios: [
    { tipo: "servicio", nombre: "Corte", cantidad: 2 },
    { tipo: "cortesia", nombre: "Lavado", cantidad: 1 },
  ],
}));

test("VIP QA en navegador conserva precio, activa una vez y nunca usa PixelPay", { timeout: 120_000 }, async () => {
  const browser = await chromium.launch({
    ...(process.env.MASTERFADE_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.MASTERFADE_CHROMIUM_EXECUTABLE }
      : {}),
    args: [
      "--no-proxy-server",
      "--host-resolver-rules=MAP qa.masterfadeapp.com 127.0.0.1",
      "--unsafely-treat-insecure-origin-as-secure=http://qa.masterfadeapp.com:4173",
    ],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    if (typeof globalThis.crypto?.randomUUID === "function") return;
    globalThis.crypto.randomUUID = () => {
      const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const value = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
    };
  });
  const page = await context.newPage();
  const calls = [];
  const externalCalls = [];
  let simulatorBody = null;
  let simulatorRelease;
  let paid = false;
  let selectedPlan = catalogPlans[0];

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== baseURL) {
      externalCalls.push(url.toString());
      return route.fulfill({ status: 204, body: "" });
    }
    if (!url.pathname.startsWith("/v1/")) return route.continue();
    const method = route.request().method();
    calls.push({ method, path: url.pathname });
    let data = {};
    if (url.pathname === "/v1/auth/me") {
      data = { user: { id_usuario: USER, email: "vip.qa@example.test" }, roles: ["cliente"], cliente_id: CLIENT };
    } else if (url.pathname === "/v1/auth/csrf") {
      data = { csrf_token: "synthetic-csrf" };
    } else if (url.pathname === "/v1/auth/session/touch") {
      data = { touched: true };
    } else if (url.pathname === "/v1/commerce/eligibility") {
      data = { booking: true, vipPurchase: true };
    } else if (url.pathname === "/v1/public/catalog/sucursales") {
      data = { sucursales: [{ id_sucursal: BRANCH, nombre_sucursal: "MasterFade Blvd. Suyapa", estado: true }] };
    } else if (url.pathname === "/v1/public/catalog/planes") {
      data = { planes: catalogPlans };
    } else if (url.pathname === "/v1/cliente/planes/estado") {
      data = { estado_plan: paid ? "activa" : "sin_plan", planes_activos: paid ? [{ id_suscripcion: SUBSCRIPTION, estado_suscripcion_codigo: "activa" }] : [] };
    } else if (url.pathname === "/v1/cliente/planes/consumos") {
      data = { consumos: [], pagination: { page: 1, limit: 5, total: 0, total_pages: 1 } };
    } else if (url.pathname === "/v1/cliente/me") {
      data = { id_cliente: CLIENT, id_usuario: USER, email: "vip.qa@example.test", perfil_completo: true };
    } else if (url.pathname === "/v1/cliente/puntos/resumen") {
      data = { saldo_total: 0, historial: [] };
    } else if (url.pathname === "/v1/cliente/planes/orden") {
      const orderBody = route.request().postDataJSON();
      selectedPlan = catalogPlans.find((plan) => plan.id_plan_sucursal === orderBody?.id_plan_sucursal) || catalogPlans[0];
      data = {
        id_order: ORDER,
        plan: { ...selectedPlan, sucursal_nombre: "MasterFade Blvd. Suyapa" },
        cliente: { id_cliente: CLIENT, email: "vip.qa@example.test" },
        totales: { subtotal_hnl: selectedPlan.precio_hnl, descuento_hnl: 0, total_hnl: selectedPlan.precio_hnl, moneda_codigo: "HNL" },
      };
    } else if (url.pathname === "/v1/cliente/planes/pago-intent") {
      data = { id_payment_intent: INTENT, estado_intent_codigo: "creado", monto_hnl: selectedPlan.precio_hnl, moneda_codigo: "HNL" };
    } else if (url.pathname === "/v1/cliente/planes/simulator/event") {
      simulatorBody = route.request().postDataJSON();
      await new Promise((resolve) => { simulatorRelease = resolve; });
      paid = true;
      data = {
        processed: true,
        duplicate: false,
        normalized_status: "PAID",
        confirmation: {
          id_suscripcion: SUBSCRIPTION,
          estado: "activa",
          inicio_at: "2030-01-01T06:00:00Z",
          fin_at: "2030-02-01T06:00:00Z",
        },
      };
    } else if (method !== "GET") {
      return route.fulfill({ status: 400, json: { ok: false, error: { code: "UNEXPECTED_FIXTURE_CALL" } } });
    }
    return route.fulfill({ status: 200, json: { ok: true, data } });
  });

  try {
    await page.goto(`${baseURL}/home/cliente/planes`);
    await page.locator(`select:has(option[value="${BRANCH}"])`).selectOption(BRANCH);
    try {
      for (const name of names.slice(0, 3)) await page.getByRole("heading", { name, exact: true }).waitFor();
      await page.getByRole("button", { name: "Siguiente", exact: true }).last().click();
      const royalHeading = page.getByRole("heading", { name: names[3], exact: true });
      await royalHeading.waitFor();
      await page.getByRole("button", { name: "Quiero este plan" }).last().click();
    } catch (error) {
      throw new Error(`No cargó el catálogo VIP. Llamadas: ${JSON.stringify(calls)}. Vista: ${await page.locator("body").innerText()}`, { cause: error });
    }
    assert.equal(await page.evaluate(() => typeof globalThis.crypto?.randomUUID), "function");
    try {
      await page.getByRole("heading", { name: "Resumen de compra" }).waitFor();
    } catch (error) {
      throw new Error(`No se creó la orden VIP. Llamadas: ${JSON.stringify(calls)}. Vista: ${await page.locator("body").innerText()}`, { cause: error });
    }
    assert.equal(await page.getByText("L 1500.00", { exact: true }).count() > 0, true);
    await page.getByRole("button", { name: "Continuar al pago" }).click();
    await page.getByRole("heading", { name: "Pago seguro" }).waitFor();
    assert.equal(await page.getByText("Demostración QA · Sin cobros reales", { exact: true }).count(), 0);
    assert.equal(await page.getByText(/Prohibido introducir tarjetas reales/).count(), 0);
    assert.equal(await page.getByText(/Escenario simulator/).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Ejecutar simulación" }).count(), 0);
    assert.equal(await page.getByLabel("CVV").getAttribute("type"), "password");
    assert.equal(await page.getByLabel("Número de tarjeta").getAttribute("autocomplete"), "off");

    if (screenshotDir) {
      await mkdir(screenshotDir, { recursive: true });
      await page.screenshot({ path: path.join(screenshotDir, "vip-commercial-desktop-1440x900.png") });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("dialog").evaluate((dialog) => { dialog.scrollTop = 0; });
      const mobileDialog = await page.getByRole("dialog").boundingBox();
      assert.ok(mobileDialog && mobileDialog.width <= 390 && mobileDialog.height <= 844);
      await page.screenshot({ path: path.join(screenshotDir, "vip-commercial-mobile-390x844.png") });
      await page.setViewportSize({ width: 1440, height: 900 });
    }

    await page.getByLabel("Número de tarjeta").fill("4111111111111111");
    await page.getByLabel("Nombre del titular").fill("Cliente QA");
    await page.getByLabel("Vencimiento").fill("12/40");
    await page.getByLabel("CVV").fill("123");
    await page.getByLabel("Dirección de facturación").fill("Blvd Suyapa");
    await page.getByLabel("Ciudad").fill("Tegucigalpa");
    await page.getByLabel("Departamento").selectOption("HN-FM");
    await page.getByLabel("Teléfono").fill("99999999");

    await page.getByRole("button", { name: "Pagar", exact: true }).evaluate((button) => {
      button.click();
      button.click();
    });
    const processingButton = page.getByRole("button", { name: "Procesando pago...", exact: true });
    await processingButton.waitFor({ state: "attached" });
    assert.equal(await processingButton.isDisabled(), true);
    assert.ok(simulatorRelease);
    assert.equal(await page.getByLabel("Número de tarjeta").inputValue(), "");
    assert.equal(await page.getByLabel("Nombre del titular").inputValue(), "");
    assert.equal(await page.getByLabel("Vencimiento").inputValue(), "");
    assert.equal(await page.getByLabel("CVV").inputValue(), "");
    assert.equal(await page.getByLabel("Dirección de facturación").inputValue(), "");
    assert.equal(await page.getByLabel("Ciudad").inputValue(), "");
    assert.equal(await page.getByLabel("Teléfono").inputValue(), "");
    simulatorRelease();
    await page.getByRole("heading", { name: "¡Membresía VIP confirmada!" }).waitFor();
    assert.deepEqual(simulatorBody, { id_payment_intent: INTENT, monto_prueba_hnl: 1 });
    assert.equal(calls.filter((call) => call.path === "/v1/cliente/planes/orden").length, 1);
    assert.equal(calls.filter((call) => call.path === "/v1/cliente/planes/pago-intent").length, 1);
    assert.equal(calls.filter((call) => call.path === "/v1/cliente/planes/simulator/event").length, 1);
    assert.equal(calls.filter((call) => call.path.includes("/pixelpay/")).length, 0);
    assert.equal(externalCalls.some((url) => /pixelpay/i.test(url)), false);
    assert.equal(externalCalls.some((url) => /4111111111111111|cvv|Cliente%20QA|Blvd%20Suyapa/i.test(url)), false);
    assert.equal(await page.getByText("L 1500.00", { exact: true }).count() > 0, true);
    const persistedBrowserData = await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }));
    assert.equal(/4111111111111111|"cvv"|Cliente QA|Blvd Suyapa/.test(persistedBrowserData), false);
  } finally {
    await context.close();
    await browser.close();
  }
});
