export const PASSWORD_POLICY_MESSAGE = 'La contraseña debe tener al menos 8 caracteres, mayúscula, minúscula y número.';
export const NEUTRAL_RECOVERY_MESSAGE = 'Si el correo existe, recibirás un enlace para restablecer tu contraseña.';

export function publicAuthError(error, stage) {
  const code = String(error?.data?.error?.code || error?.code || '').toUpperCase();
  const status = Number(error?.status || error?.statusCode || 0);
  if (status === 429 || ['AUTH_RESET_RATE_LIMIT', 'OVER_REQUEST_RATE_LIMIT', 'OVER_EMAIL_SEND_RATE_LIMIT'].includes(code)) {
    return 'Demasiados intentos. Intenta nuevamente más tarde.';
  }
  if (stage === 'recovery') return 'No se pudo enviar el enlace en este momento. Intenta nuevamente.';
  if (stage === 'link') {
    if (['OTP_EXPIRED', 'TOKEN_EXPIRED', 'AUTH_SOCIAL_CONFIRM_TOKEN_EXPIRED'].includes(code)) return 'El enlace expiró. Solicita uno nuevo.';
    if (status >= 500 || code === 'NETWORK_UNAVAILABLE') return 'No se pudo validar el enlace en este momento. Intenta nuevamente.';
    return 'El enlace no es válido. Solicita uno nuevo.';
  }
  if (['AUTH_RECOVERY_ACTIVE_SESSION', 'AUTH_RECOVERY_IDENTITY_MISMATCH'].includes(code)) {
    return 'Cierra la sesión actual y vuelve a abrir este mismo enlace.';
  }
  if (code === 'AUTH_RESET_UNCONFIRMED') {
    return 'No se pudo confirmar si la contraseña cambió. No reutilices este enlace; solicita uno nuevo e intenta iniciar sesión con la contraseña elegida.';
  }
  if (code === 'WEAK_PASSWORD') return PASSWORD_POLICY_MESSAGE;
  if (code === 'SAME_PASSWORD') return 'La nueva contraseña debe ser diferente de la anterior.';
  return 'No se pudo actualizar la contraseña en este momento. Intenta nuevamente.';
}
