const CUSTOMER_MESSAGES = Object.freeze({
  PIXELPAY_PAYMENT_DECLINED: "El pago fue rechazado. Verifica los datos o utiliza otra tarjeta.",
  PIXELPAY_PAYMENT_DATA_INVALID: "Revisa los datos de la tarjeta y la información de facturación.",
  PIXELPAY_PRECONDITION_FAILED: "No fue posible iniciar el cobro porque la operación no cumple una condición requerida. No se realizó otro cargo.",
  PIXELPAY_PAYMENT_PENDING: "Existe un pago pendiente de conciliación. No realices otro cobro.",
  PIXELPAY_PAYMENT_PROCESSING_FAILED: "No fue posible procesar el pago. Intenta nuevamente o utiliza otra tarjeta.",
});

export function getPixelPayPresentation(environment = import.meta.env.VITE_PIXELPAY_ENV) {
  const normalized = String(environment || "sandbox").trim().toLowerCase();
  const live = normalized === "live";
  return {
    environment: live ? "live" : "sandbox",
    providerLabel: live ? "PixelPay" : "PixelPay Sandbox",
    intro: live
      ? "Procesa tu pago de forma segura mediante PixelPay."
      : "Procesa el pago directo mediante PixelPay Sandbox para el entorno QA.",
    cardNotice: live
      ? "Ingresa los datos de tu tarjeta para procesar el pago de forma segura."
      : "PixelPay Sandbox: usa exclusivamente una tarjeta de prueba.",
    privacyNotice: live
      ? "Los datos se envían una sola vez al backend y de ahí a PixelPay. No se almacenan en el navegador ni en MasterFade."
      : "Los datos se envían una sola vez al backend y de ahí a PixelPay Sandbox. No se almacenan en el navegador ni en MasterFade.",
    paymentTitle: live ? "Pago con PixelPay" : "Pago con PixelPay Sandbox",
    payButton: live ? "Pagar con PixelPay" : "Pagar con PixelPay Sandbox",
  };
}

export function getPixelPayCustomerMessage(source = {}) {
  if (source?.processed === true) return "Pago aprobado. La operación se completó correctamente.";
  if (source?.pending_confirmation === true) return CUSTOMER_MESSAGES.PIXELPAY_PAYMENT_PENDING;
  const code = String(source?.customer_error_code || source?.data?.error?.code || source?.code || "")
    .trim()
    .toUpperCase();
  if (CUSTOMER_MESSAGES[code]) return CUSTOMER_MESSAGES[code];
  if (Number(source?.status) === 412) return CUSTOMER_MESSAGES.PIXELPAY_PRECONDITION_FAILED;
  if ([400, 422].includes(Number(source?.status))) return CUSTOMER_MESSAGES.PIXELPAY_PAYMENT_DATA_INVALID;
  if (["AbortError", "TimeoutError"].includes(source?.name)) {
    return "No pudimos confirmar el resultado del pago. No vuelvas a pagar mientras verificamos la operación.";
  }
  return CUSTOMER_MESSAGES.PIXELPAY_PAYMENT_PROCESSING_FAILED;
}
