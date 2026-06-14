export const CARD_BRAND_LABELS = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  unknown: 'Tipo de tarjeta no identificado',
};

export function detectCardBrand(cardNumber = '') {
  const digits = String(cardNumber).replace(/\D/g, '');

  if (/^4/.test(digits)) return 'visa';

  if (
    /^(5[1-5])/.test(digits)
    || /^(222[1-9]|22[3-9]\d|2[3-6]\d{2}|27[01]\d|2720)/.test(digits)
  ) {
    return 'mastercard';
  }

  if (/^3[47]/.test(digits)) return 'amex';
  if (/^(6011|65|64[4-9])/.test(digits)) return 'discover';

  return 'unknown';
}
