import { useRef, useState } from "react";
import { CreditCard, Loader2, LockKeyhole } from "lucide-react";
import { useConfirmationSound } from "../../../components/feedback/ConfirmationCard.jsx";
import PaymentErrorContent from "../../../components/feedback/PaymentErrorContent.jsx";
import MembershipConfirmation from "./MembershipConfirmation.jsx";
import { Button } from "../../../components/ui/button.jsx";
import { PaymentCheckoutSteps } from "../../payments/PaymentCheckoutPresentation.jsx";
import { getPixelPayCustomerMessage } from "../../payments/pixelPayPresentation.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog.jsx";

export const HONDURAS_DEPARTMENTS = [
  ["HN-AT", "Atlantida"], ["HN-CH", "Choluteca"], ["HN-CL", "Colon"], ["HN-CM", "Comayagua"],
  ["HN-CP", "Copan"], ["HN-CR", "Cortes"], ["HN-EP", "El Paraiso"], ["HN-FM", "Francisco Morazan"],
  ["HN-GD", "Gracias a Dios"], ["HN-IB", "Islas de la Bahia"], ["HN-IN", "Intibuca"], ["HN-LE", "Lempira"],
  ["HN-LP", "La Paz"], ["HN-OC", "Ocotepeque"], ["HN-OL", "Olancho"], ["HN-SB", "Santa Barbara"],
  ["HN-VA", "Valle"], ["HN-YO", "Yoro"],
];
const BILLING_ADDRESS_PLACEHOLDERS = new Set(["QA", "TEST", "PRUEBA", "N/A", "NA", "NONE", "NULL"]);

function digits(value) {
  return String(value || "").replace(/\D+/g, "");
}

export function formatVipCardNumber(value) {
  return digits(value).slice(0, 19).replace(/(.{4})/g, "$1 ").trim();
}

export function formatVipExpiry(value) {
  const valueDigits = digits(value).slice(0, 4);
  return valueDigits.length <= 2 ? valueDigits : `${valueDigits.slice(0, 2)}/${valueDigits.slice(2)}`;
}

export function toVipPixelPayExpiry(value) {
  const match = String(value || "").trim().match(/^(0[1-9]|1[0-2])\/([0-9]{2})$/);
  return match ? `${match[2]}${match[1]}` : "";
}

export function validateVipPaymentForm(form, referenceDate = new Date()) {
  const errors = {};
  const cardDigits = digits(form.cardNumber);
  const phoneDigits = digits(form.phone);
  const expiryMatch = String(form.expiry || "").trim().match(/^(0[1-9]|1[0-2])\/([0-9]{2})$/);
  if (cardDigits.length < 13 || cardDigits.length > 19) errors.cardNumber = "Ingresa un número de tarjeta válido.";
  if (String(form.cardHolder || "").trim().length < 2) errors.cardHolder = "Ingresa el nombre del titular.";
  if (!expiryMatch) {
    errors.expiry = "Ingresa una fecha MM/AA válida.";
  } else {
    const month = Number(expiryMatch[1]);
    const year = 2000 + Number(expiryMatch[2]);
    const currentYear = referenceDate.getUTCFullYear();
    const currentMonth = referenceDate.getUTCMonth() + 1;
    if (year < currentYear || (year === currentYear && month < currentMonth)) errors.expiry = "La tarjeta está vencida.";
  }
  if (![3, 4].includes(digits(form.cvv).length)) errors.cvv = "Ingresa un CVV de 3 o 4 dígitos.";
  const address = String(form.address || "").trim();
  if (address.length < 2 || BILLING_ADDRESS_PLACEHOLDERS.has(address.toUpperCase())) {
    errors.address = "Ingresa una dirección de facturación válida.";
  }
  if (!String(form.city || "").trim()) errors.city = "Ingresa la ciudad.";
  if (!HONDURAS_DEPARTMENTS.some(([code]) => code === form.state)) errors.state = "Selecciona un departamento válido.";
  if (phoneDigits.length < 8 || phoneDigits.length > 15) errors.phone = "Ingresa un teléfono de 8 a 15 dígitos.";
  return errors;
}

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
  pendingConfirmation = false,
  paymentIntent = null,
  paymentConfirmation = null,
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
  const [fieldErrors, setFieldErrors] = useState({});
  const operationId = paymentIntent?.id_payment_intent || orderSummary?.id_order || 'membership';
  const [errorDisplay, setErrorDisplay] = useState({ message: errorMessage, open, operationId, acknowledged: false });
  if (errorDisplay.message !== errorMessage || errorDisplay.open !== open || errorDisplay.operationId !== operationId) {
    setErrorDisplay({ message: errorMessage, open, operationId, acknowledged: false });
  }
  const acknowledgeError = () => setErrorDisplay({ message: errorMessage, open, operationId, acknowledged: true });
  const acknowledgeRef = useRef(null);
  const cardInputRef = useRef(null);
  const summaryContinueRef = useRef(null);
  const uncertainMessage = getPixelPayCustomerMessage({ code: 'PIXELPAY_PAYMENT_UNCERTAIN' });
  const pendingMessage = getPixelPayCustomerMessage({ pending_confirmation: true });
  const reconciling = pendingConfirmation || errorMessage === uncertainMessage || errorMessage === pendingMessage;
  const confirmationVisible = open && step === 'success' && !reconciling && !loading && (!errorMessage || Boolean(paymentConfirmation));
  const showTransactionError = Boolean(errorMessage) && !confirmationVisible && !reconciling && !loading && !errorDisplay.acknowledged;
  const onCheckDrawn = useConfirmationSound(confirmationVisible, operationId);
  const displayStep = step === 'success' && !confirmationVisible ? 'payment' : step;
  const safeErrorMessages = ['PIXELPAY_PAYMENT_DECLINED', 'PIXELPAY_PAYMENT_DATA_INVALID', 'PIXELPAY_PRECONDITION_FAILED', 'PIXELPAY_PAYMENT_PROCESSING_FAILED'].map(code => getPixelPayCustomerMessage({ code }));
  const safeErrorDescription = safeErrorMessages.includes(errorMessage) ? errorMessage : getPixelPayCustomerMessage({ code: 'PIXELPAY_PAYMENT_PROCESSING_FAILED' });

  const setPaymentField = (field) => (event) => {
    const rawValue = event.target.value;
    const value = field === "cardNumber" ? formatVipCardNumber(rawValue)
      : field === "expiry" ? formatVipExpiry(rawValue)
        : field === "cvv" ? digits(rawValue).slice(0, 4)
          : field === "phone" ? digits(rawValue).slice(0, 15)
            : rawValue;
    setPaymentForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: "" }));
  };
  const submitPixelPay = () => {
    const validationErrors = validateVipPaymentForm(paymentForm);
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length || reconciling) return;
    onConfirmPayment?.({
      card: {
        number: digits(paymentForm.cardNumber), holder: paymentForm.cardHolder.trim(),
        expire: toVipPixelPayExpiry(paymentForm.expiry),
        cvv: digits(paymentForm.cvv),
      },
      billing: {
        address: paymentForm.address.trim(), country: "HN", state: paymentForm.state,
        city: paymentForm.city.trim(), phone: digits(paymentForm.phone),
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

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (!next && showTransactionError) { acknowledgeError(); return; }
      if (disableClose) return;
      if (!next) {
        setPaymentForm((current) => ({ ...current, cardNumber: "", expiry: "", cvv: "" }));
        setFieldErrors({});
      }
      onOpenChange?.(next);
    }}
    >
      <DialogContent
        key={showTransactionError ? 'error' : confirmationVisible ? 'success' : 'form'}
        className={showTransactionError ? 'payment-result-dialog' : confirmationVisible ? 'membership-confirmation-dialog' : displayStep === 'payment' ? 'mf-payment-dialog' : 'max-h-[85vh] overflow-y-auto sm:max-w-xl'}
        role={showTransactionError ? 'alertdialog' : 'dialog'}
        onOpenAutoFocus={(event) => {
          if (showTransactionError) { event.preventDefault(); acknowledgeRef.current?.focus(); }
          else if (displayStep === 'payment' && cardInputRef.current) { event.preventDefault(); cardInputRef.current.focus(); }
          else if (displayStep === 'summary' && summaryContinueRef.current) { event.preventDefault(); summaryContinueRef.current.focus(); }
        }}
        onCloseAutoFocus={(event) => { if (open) event.preventDefault(); }}
      >
        {showTransactionError ? (
          <PaymentErrorContent description={safeErrorDescription} acknowledgeRef={acknowledgeRef} onAcknowledge={acknowledgeError} />
        ) : confirmationVisible ? (
          <>
            <DialogTitle className="sr-only">Confirmación de compra VIP</DialogTitle>
            <DialogDescription className="sr-only">Resultado confirmado de tu compra</DialogDescription>
            <MembershipConfirmation plan={plan} branchLabel={branchLabel} totals={totals} paymentConfirmation={paymentConfirmation} onCheckDrawn={onCheckDrawn} onDone={onFinish} />
          </>
        ) : (
          <>
            <DialogHeader className="pt-3">
              <DialogTitle>{displayStep === "payment" ? "Pago seguro" : "Resumen de compra"}</DialogTitle>
              <DialogDescription>
                {displayStep === "payment"
                  ? "Ingresa los datos solicitados para procesar el pago con PixelPay."
                  : "Verifica los datos antes de continuar al pago."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {displayStep === "payment" ? (
                <>
                  <PaymentCheckoutSteps processing={loading || reconciling} />
                  <div className="mf-payment-panel mf-payment-summary">
                    <div><p className="mf-checkout-section-title">Tu membresía</p><h3>{plan?.nombre_plan || "Plan"}</h3><p>{branchLabel}</p></div>
                    <div><p>Total a pagar · {totals?.moneda_codigo || "HNL"}</p><strong>{formatMoney(totals?.total_hnl)}</strong></div>
                  </div>
                  <div className="mf-payment-panel text-sm">
                    <p className="flex items-center gap-2 font-semibold text-[var(--mf-text)]">
                      <LockKeyhole size={14} />
                      Pago seguro
                    </p>
                    <p className="mt-1 text-[var(--mf-text-2)]">Los datos se envían a PixelPay y no se guardan en este navegador.</p>

                    <div className="mf-payment-form">
                      <label className="text-xs text-[var(--mf-text-2)]">
                        Numero de tarjeta
                        <input ref={cardInputRef} className="mf-input mt-1 w-full" type="text" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" maxLength={23} value={paymentForm.cardNumber} onChange={setPaymentField("cardNumber")} />
                        {fieldErrors.cardNumber ? <span className="mt-1 block text-xs text-[var(--mf-danger)]">{fieldErrors.cardNumber}</span> : null}
                      </label>
                      <label className="text-xs text-[var(--mf-text-2)]">
                        Nombre del titular
                        <input className="mf-input mt-1 w-full" type="text" autoComplete="cc-name" placeholder="Como aparece en tu tarjeta" value={paymentForm.cardHolder} onChange={setPaymentField("cardHolder")} />
                        {fieldErrors.cardHolder ? <span className="mt-1 block text-xs text-[var(--mf-danger)]">{fieldErrors.cardHolder}</span> : null}
                      </label>
                      <label className="text-xs text-[var(--mf-text-2)]">
                        Vencimiento
                        <input className="mf-input mt-1 w-full" type="text" placeholder="MM/AA" inputMode="numeric" autoComplete="cc-exp" maxLength={5} value={paymentForm.expiry} onChange={setPaymentField("expiry")} />
                        {fieldErrors.expiry ? <span className="mt-1 block text-xs text-[var(--mf-danger)]">{fieldErrors.expiry}</span> : null}
                      </label>
                      <label className="text-xs text-[var(--mf-text-2)]">
                        CVV
                        <input className="mf-input mt-1 w-full" type="password" inputMode="numeric" autoComplete="cc-csc" placeholder="CVV" maxLength={4} value={paymentForm.cvv} onChange={setPaymentField("cvv")} />
                        {fieldErrors.cvv ? <span className="mt-1 block text-xs text-[var(--mf-danger)]">{fieldErrors.cvv}</span> : null}
                      </label>
                      <label className="text-xs text-[var(--mf-text-2)]">Dirección de facturación<input className="mf-input mt-1 w-full" autoComplete="street-address" value={paymentForm.address} onChange={setPaymentField("address")} />{fieldErrors.address ? <span className="mt-1 block text-xs text-[var(--mf-danger)]">{fieldErrors.address}</span> : null}</label>
                      <label className="text-xs text-[var(--mf-text-2)]">Ciudad<input className="mf-input mt-1 w-full" autoComplete="address-level2" value={paymentForm.city} onChange={setPaymentField("city")} />{fieldErrors.city ? <span className="mt-1 block text-xs text-[var(--mf-danger)]">{fieldErrors.city}</span> : null}</label>
                      <label className="text-xs text-[var(--mf-text-2)]">Departamento<select className="mf-select mt-1 w-full" autoComplete="address-level1" value={paymentForm.state} onChange={setPaymentField("state")}>{HONDURAS_DEPARTMENTS.map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}</select>{fieldErrors.state ? <span className="mt-1 block text-xs text-[var(--mf-danger)]">{fieldErrors.state}</span> : null}</label>
                      <label className="text-xs text-[var(--mf-text-2)]">País<input className="mf-input mt-1 w-full" autoComplete="country" value="HN" readOnly /></label>
                      <label className="text-xs text-[var(--mf-text-2)]">Teléfono<input className="mf-input mt-1 w-full" type="tel" inputMode="numeric" autoComplete="tel" maxLength={15} value={paymentForm.phone} onChange={setPaymentField("phone")} />{fieldErrors.phone ? <span className="mt-1 block text-xs text-[var(--mf-danger)]">{fieldErrors.phone}</span> : null}</label>
                    </div>
                    <p className="mt-3 inline-flex items-center gap-2 text-xs text-[var(--mf-text-2)]">
                      <CreditCard size={13} />
                      PAN y CVV permanecen únicamente en memoria y se limpian al enviar o cerrar.
                    </p>
                    {reconciling ? (
                      <p role="status" className="mt-3 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm font-medium text-[var(--mf-text)]">
                        {getPixelPayCustomerMessage({ pending_confirmation: true })}
                      </p>
                    ) : null}
                  </div>
                </>
              ) : null}
              {displayStep === "summary" ? (
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


            </div>

            {displayStep === "payment" ? (
              <DialogFooter className="mf-payment-footer">
                <Button type="button" className="mf-payment-submit" onClick={submitPixelPay} disabled={loading || disableClose || reconciling}>
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <LockKeyhole size={15} />}
                  Pagar con PixelPay
                </Button>
                <Button type="button" variant="outline" className="mf-payment-back" onClick={() => { onBackToSummary?.(); }} disabled={loading || disableClose}>Volver al resumen</Button>
                <Button type="button" variant="ghost" onClick={onCancel} disabled={loading || disableClose}>Cancelar</Button>
              </DialogFooter>
            ) : (
              <DialogFooter>
                <Button type="button" variant="outline" onClick={onCancel} disabled={loading || disableClose}>Cancelar</Button>
                <Button ref={summaryContinueRef} type="button" onClick={onContinueToPayment} disabled={loading || disableClose}>
                  {loading ? <Loader2 size={15} className="animate-spin" /> : null}Continuar al pago
                </Button>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
