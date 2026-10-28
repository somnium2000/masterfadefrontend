import { describe, expect, it } from "vitest";
import {
  getPixelPayCustomerMessage,
  getPixelPayPresentation,
} from "../pixelPayPresentation.js";

describe("presentación segura de PixelPay", () => {
  it("conserva textos Sandbox en QA y los elimina en live", () => {
    expect(getPixelPayPresentation("sandbox")).toMatchObject({
      environment: "sandbox",
      providerLabel: "PixelPay Sandbox",
      cardNotice: "PixelPay Sandbox: usa exclusivamente una tarjeta de prueba.",
    });
    expect(getPixelPayPresentation("live")).toMatchObject({
      environment: "live",
      providerLabel: "PixelPay",
      cardNotice: "Ingresa los datos de tu tarjeta para procesar el pago de forma segura.",
    });
  });

  it.each([
    [{ processed: true }, "Pago aprobado. La operación se completó correctamente."],
    [{ customer_error_code: "PIXELPAY_PAYMENT_DECLINED" }, "El pago fue rechazado. Verifica los datos o utiliza otra tarjeta."],
    [{ status: 422, data: { error: { code: "PIXELPAY_PAYMENT_DATA_INVALID" } } }, "Revisa los datos de la tarjeta y la información de facturación."],
    [{ status: 412 }, "No fue posible iniciar el cobro porque la operación no cumple una condición requerida. No se realizó otro cargo."],
    [{ name: "TimeoutError" }, "No pudimos confirmar el resultado del pago. No vuelvas a pagar mientras verificamos la operación."],
    [{ pending_confirmation: true }, "Existe un pago pendiente de conciliación. No realices otro cobro."],
  ])("mapea resultados a mensajes productivos sin detalles técnicos", (source, expected) => {
    expect(getPixelPayCustomerMessage(source)).toBe(expected);
  });

  it("no muestra mensajes crudos del proveedor", () => {
    expect(getPixelPayCustomerMessage({
      status: 502,
      data: { error: { message: "SQLSTATE 23505 secret_key=abc PixelPay stack" } },
    })).toBe("No fue posible procesar el pago. Intenta nuevamente o utiliza otra tarjeta.");
  });
});
