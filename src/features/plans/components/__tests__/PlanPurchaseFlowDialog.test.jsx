// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import PlanPurchaseFlowDialog, {
  formatVipCardNumber,
  formatVipExpiry,
  toVipPixelPayExpiry,
  validateVipPaymentForm,
} from "../PlanPurchaseFlowDialog.jsx";

const orderSummary = {
  plan: { nombre_plan: "VIP", sucursal_nombre: "Centro", beneficios: [] },
  totales: { subtotal_hnl: 300, descuento_hnl: 0, total_hnl: 300, moneda_codigo: "HNL" },
};

afterEach(cleanup);

describe("formulario PixelPay VIP", () => {
  it("agrupa tarjeta, convierte MM/AA y valida campos específicos", () => {
    expect(formatVipCardNumber("4111a1111-1111 1111")).toBe("4111 1111 1111 1111");
    expect(formatVipExpiry("1230")).toBe("12/30");
    expect(toVipPixelPayExpiry("12/30")).toBe("3012");
    expect(validateVipPaymentForm({
      cardNumber: "4111", cardHolder: "", expiry: "09/26", cvv: "1",
      address: "QA", city: "", state: "XX", phone: "12",
    }, new Date("2026-10-25T12:00:00Z"))).toEqual({
      cardNumber: "Ingresa un número de tarjeta válido.",
      cardHolder: "Ingresa el nombre del titular.",
      expiry: "La tarjeta está vencida.",
      cvv: "Ingresa un CVV de 3 o 4 dígitos.",
      address: "Ingresa una dirección de facturación válida.",
      city: "Ingresa la ciudad.",
      state: "Selecciona un departamento válido.",
      phone: "Ingresa un teléfono de 8 a 15 dígitos.",
    });
  });

  it("envía L 300 sin alterarlo, normaliza el payload y limpia PAN/CVV", () => {
    const onConfirmPayment = vi.fn();
    render(<PlanPurchaseFlowDialog open step="payment" orderSummary={orderSummary} onConfirmPayment={onConfirmPayment} />);
    fireEvent.change(screen.getByLabelText("Numero de tarjeta"), { target: { value: "4111111111111111" } });
    fireEvent.change(screen.getByLabelText("Nombre del titular"), { target: { value: "Cliente QA" } });
    fireEvent.change(screen.getByLabelText("Vencimiento"), { target: { value: "1230" } });
    fireEvent.change(screen.getByLabelText("CVV"), { target: { value: "987" } });
    fireEvent.change(screen.getByLabelText("Dirección de facturación"), { target: { value: "Blvd Suyapa" } });
    fireEvent.change(screen.getByLabelText("Ciudad"), { target: { value: "Tegucigalpa" } });
    fireEvent.change(screen.getByLabelText("Departamento"), { target: { value: "HN-CR" } });
    fireEvent.change(screen.getByLabelText("Teléfono"), { target: { value: "+504 9999-9999" } });
    fireEvent.click(screen.getByRole("button", { name: "Pagar con PixelPay" }));
    expect(onConfirmPayment).toHaveBeenCalledExactlyOnceWith({
      card: { number: "4111111111111111", holder: "Cliente QA", expire: "3012", cvv: "987" },
      billing: { address: "Blvd Suyapa", country: "HN", state: "HN-CR", city: "Tegucigalpa", phone: "50499999999" },
    });
    expect(screen.getByRole('heading', { name: 'VIP' })).toBeInTheDocument();
    expect(screen.getByText('Centro')).toBeInTheDocument();
    expect(screen.getByText('L 300.00')).toBeInTheDocument();
    expect(screen.getByLabelText("Numero de tarjeta")).toHaveValue("");
    expect(screen.getByLabelText("CVV")).toHaveValue("");
  });

  it("bloquea otro cobro cuando la confirmación está pendiente", () => {
    render(<PlanPurchaseFlowDialog open step="payment" orderSummary={orderSummary} pendingConfirmation />);
    expect(screen.getByText("Existe un pago pendiente de conciliación. No realices otro cobro.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pagar con PixelPay" })).toBeDisabled();
  });

  it("prioriza pagar y conserva las acciones secundarias", () => {
    const onBackToSummary = vi.fn();
    const onCancel = vi.fn();
    render(<PlanPurchaseFlowDialog open step="payment" orderSummary={orderSummary} onBackToSummary={onBackToSummary} onCancel={onCancel} />);
    const pay = screen.getByRole('button', { name: 'Pagar con PixelPay' });
    expect(pay.parentElement.firstElementChild).toBe(pay);
    fireEvent.click(screen.getByRole('button', { name: 'Volver al resumen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onBackToSummary).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
