import { useState } from "react";
import { CheckCircle2, CreditCard, Loader2, LockKeyhole } from "lucide-react";
import { Button } from "../../../components/ui/button.jsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog.jsx";

function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "L 0.00";
  return `L ${amount.toFixed(2)}`;
}

function renderBenefitLabel(benefit = {}) {
  const quantity = Number(benefit?.cantidad || 0);
  const name = String(benefit?.nombre || benefit?.codigo || "Beneficio").trim();
  return `${quantity}x ${name}`;
}

function normalizeBranchLabel(plan = {}) {
  const source = String(plan?.sucursal_nombre || "").trim();
  if (!source) return "Sucursal";
  const dashedUuidPattern = /\s*-\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return source.replace(dashedUuidPattern, "").trim() || "Sucursal";
}

export default function PlanPurchaseFlowDialog({
  open,
  onOpenChange,
  step = "summary",
  orderSummary = null,
  loading = false,
  errorMessage = "",
  disableClose = false,
  onCancel,
  onBackToSummary,
  onContinueToPayment,
  onConfirmPayment,
  onFinish,
}) {
  const [paymentForm, setPaymentForm] = useState({
    cardNumber: "", cardHolder: "", expiry: "", cvv: "",
    address: "", city: "", state: "HN-FM", phone: "",
  });
  const setPaymentField = (field) => (event) => {
    setPaymentForm((current) => ({ ...current, [field]: event.target.value }));
  };
  const submitPixelPay = () => {
    const expiryDigits = paymentForm.expiry.replace(/\D/g, "");
    onConfirmPayment?.({
      card: {
        number: paymentForm.cardNumber.replace(/\D/g, ""), holder: paymentForm.cardHolder.trim(),
        expire: expiryDigits.length === 4 ? `${expiryDigits.slice(2)}${expiryDigits.slice(0, 2)}` : expiryDigits,
        cvv: paymentForm.cvv.replace(/\D/g, ""),
      },
      billing: {
        address: paymentForm.address.trim(), country: "HN", state: paymentForm.state,
        city: paymentForm.city.trim(), phone: paymentForm.phone.replace(/\D/g, ""),
      },
    });
    setPaymentForm((current) => ({ ...current, cardNumber: "", expiry: "", cvv: "" }));
  };
  const plan = orderSummary?.plan || {};
  const totals = orderSummary?.totales || {};
  const cliente = orderSummary?.cliente || {};
  const branchLabel = normalizeBranchLabel(plan);
  const benefits = Array.isArray(plan?.beneficios?.items)
    ? plan.beneficios.items
    : (Array.isArray(plan?.beneficios) ? plan.beneficios : []);
  const serviceBenefits = benefits.filter((benefit) => String(benefit?.tipo || "").toLowerCase() !== "cortesia");
  const courtesyBenefits = benefits.filter((benefit) => String(benefit?.tipo || "").toLowerCase() === "cortesia");
  const cardDigits = paymentForm.cardNumber.replace(/\D/g, "");
  const expiryDigits = paymentForm.expiry.replace(/\D/g, "");
  const cvvDigits = paymentForm.cvv.replace(/\D/g, "");
  const phoneDigits = paymentForm.phone.replace(/\D/g, "");
  const paymentFormValid = cardDigits.length >= 13 && cardDigits.length <= 19
    && paymentForm.cardHolder.trim().length >= 2
    && expiryDigits.length === 4
    && cvvDigits.length >= 3 && cvvDigits.length <= 4
    && paymentForm.address.trim().length >= 2
    && paymentForm.city.trim().length >= 1
    && /^HN-[A-Z]{2}$/.test(paymentForm.state)
    && phoneDigits.length >= 8 && phoneDigits.length <= 15;

  const summaryText = `${plan?.nombre_plan || "Plan"} · ${branchLabel} · ${formatMoney(totals?.total_hnl)}`;

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (disableClose) return;
      if (!next) setPaymentForm((current) => ({ ...current, cardNumber: "", expiry: "", cvv: "" }));
      onOpenChange?.(next);
    }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        {step === "success" ? (
          <div className="pt-5">
            <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full border border-emerald-400/35 bg-emerald-500/15 text-emerald-200">
              <CheckCircle2 size={26} />
            </div>
            <h3 className="mt-4 text-center text-xl font-semibold text-[var(--mf-text)]">Pago confirmado</h3>
            <p className="mt-2 text-center text-sm text-[var(--mf-text-2)]">
              Tu suscripcion ya esta activa y lista para usar en esta sucursal.
            </p>
            <div className="mt-6">
              <Button type="button" className="w-full" onClick={onFinish}>
                Entendido
              </Button>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader className="pt-3">
              <DialogTitle>{step === "payment" ? "Pago seguro" : "Resumen de compra"}</DialogTitle>
              <DialogDescription>
                {step === "payment"
                  ? "Ingresa los datos solicitados para procesar el pago con PixelPay."
                  : "Verifica los datos antes de continuar al pago."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {step === "payment" ? (
                <>
                  <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Resumen rapido</p>
                    <p className="mt-2 text-sm text-[var(--mf-text)]">{summaryText}</p>
                  </div>

                  <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4 text-sm">
                    <p className="flex items-center gap-2 font-semibold text-[var(--mf-text)]">
                      <LockKeyhole size={14} />
                      Pago seguro
                    </p>
                    <p className="mt-1 text-[var(--mf-text-2)]">Los datos se envían a PixelPay y no se guardan en este navegador.</p>

                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className="text-xs text-[var(--mf-text-2)]">
                        Numero de tarjeta
                        <input className="mf-input mt-1 w-full" type="text" autoComplete="cc-number" value={paymentForm.cardNumber} onChange={setPaymentField("cardNumber")} />
                      </label>
                      <label className="text-xs text-[var(--mf-text-2)]">
                        Nombre del titular
                        <input className="mf-input mt-1 w-full" type="text" autoComplete="cc-name" value={paymentForm.cardHolder} onChange={setPaymentField("cardHolder")} />
                      </label>
                      <label className="text-xs text-[var(--mf-text-2)]">
                        Vencimiento
                        <input className="mf-input mt-1 w-full" type="text" placeholder="MM/AA" autoComplete="cc-exp" value={paymentForm.expiry} onChange={setPaymentField("expiry")} />
                      </label>
                      <label className="text-xs text-[var(--mf-text-2)]">
                        CVV
                        <input className="mf-input mt-1 w-full" type="password" autoComplete="cc-csc" value={paymentForm.cvv} onChange={setPaymentField("cvv")} />
                      </label>
                      <label className="text-xs text-[var(--mf-text-2)]">Dirección de facturación<input className="mf-input mt-1 w-full" value={paymentForm.address} onChange={setPaymentField("address")} /></label>
                      <label className="text-xs text-[var(--mf-text-2)]">Ciudad<input className="mf-input mt-1 w-full" value={paymentForm.city} onChange={setPaymentField("city")} /></label>
                      <label className="text-xs text-[var(--mf-text-2)]">Departamento<input className="mf-input mt-1 w-full" placeholder="HN-FM" value={paymentForm.state} onChange={setPaymentField("state")} /></label>
                      <label className="text-xs text-[var(--mf-text-2)]">Teléfono<input className="mf-input mt-1 w-full" value={paymentForm.phone} onChange={setPaymentField("phone")} /></label>
                    </div>
                    <p className="mt-3 inline-flex items-center gap-2 text-xs text-[var(--mf-text-2)]">
                      <CreditCard size={13} />
                      Estos campos son solo demostrativos y no se almacenan.
                    </p>
                  </div>
                </>
              ) : null}
              {step === "summary" ? (
                <>
                  <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Plan</p>
                    <p className="mt-2 text-lg font-semibold text-[var(--mf-text)]">{plan?.nombre_plan || "Plan"}</p>
                    <p className="mt-1 text-sm text-[var(--mf-text-2)]">{branchLabel}</p>
                  </div>

                  <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Servicios incluidos</p>
                    {serviceBenefits.length ? (
                      <ul className="mt-2 space-y-1.5 text-sm text-[var(--mf-text-2)]">
                        {serviceBenefits.map((benefit, index) => (
                          <li key={`service-benefit-${index}`} className="flex items-start justify-between gap-2">
                            <span>{renderBenefitLabel(benefit)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="mt-2 text-sm text-[var(--mf-text-2)]">Sin servicios incluidos.</p>}

                    <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Cortesias incluidas</p>
                    {courtesyBenefits.length ? (
                      <ul className="mt-2 space-y-1.5 text-sm text-[var(--mf-text-2)]">
                        {courtesyBenefits.map((benefit, index) => (
                          <li key={`courtesy-benefit-${index}`} className="flex items-start justify-between gap-2">
                            <span>{renderBenefitLabel(benefit)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="mt-2 text-sm text-[var(--mf-text-2)]">Sin cortesias incluidas.</p>}
                  </div>

                  <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4">
                    <div className="flex items-center justify-between text-sm text-[var(--mf-text-2)]">
                      <span>Subtotal</span>
                      <span>{formatMoney(totals?.subtotal_hnl)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-sm text-[var(--mf-text-2)]">
                      <span>Descuento</span>
                      <span>{formatMoney(totals?.descuento_hnl)}</span>
                    </div>
                    <div className="mt-2 border-t border-[var(--mf-nav-border)] pt-2">
                      <div className="flex items-center justify-between text-base font-semibold text-[var(--mf-text)]">
                        <span>Total</span>
                        <span>{formatMoney(totals?.total_hnl)}</span>
                      </div>
                      <p className="mt-1 text-xs uppercase tracking-[0.1em] text-[var(--mf-text-2)]">
                        Moneda: {totals?.moneda_codigo || "HNL"}
                      </p>
                    </div>
                    {cliente?.email ? (
                      <p className="mt-2 text-xs text-[var(--mf-text-2)]">Correo factura: {cliente.email}</p>
                    ) : null}
                  </div>
                </>
              ) : null}

              {errorMessage ? (
                <div className="rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {errorMessage}
                </div>
              ) : null}
            </div>

            <DialogFooter className="sticky bottom-0 bg-[var(--mf-bg)]/95 pt-3 backdrop-blur">
              <Button type="button" variant="outline" onClick={onCancel} disabled={loading || disableClose}>
                Cancelar
              </Button>
              {step === "payment" ? (
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      onBackToSummary?.();
                    }}
                    disabled={loading || disableClose}
                  >
                    Volver al resumen
                  </Button>
                  <Button type="button" onClick={submitPixelPay} disabled={loading || disableClose || !paymentFormValid}>
                    {loading ? <Loader2 size={15} className="animate-spin" /> : null}
                    Pagar con PixelPay
                  </Button>
                </div>
              ) : (
                <Button type="button" onClick={onContinueToPayment} disabled={loading || disableClose}>
                  {loading ? <Loader2 size={15} className="animate-spin" /> : null}
                  Continuar al pago
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
