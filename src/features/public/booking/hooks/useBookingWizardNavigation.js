import { useCallback, useEffect, useMemo } from 'react';
import { BOOKING_ROUTES } from '../constants/bookingRoutes.js';

function safePathname(value) {
  return String(value || '').trim() || BOOKING_ROUTES.root;
}

function startsAt(pathname, route) {
  return safePathname(pathname).startsWith(route);
}

export function resolveBookingStepFromPath(pathname) {
  const path = safePathname(pathname);
  if (path === BOOKING_ROUTES.root) return 'root';
  if (startsAt(path, BOOKING_ROUTES.barbers)) return 'barbers';
  if (startsAt(path, BOOKING_ROUTES.agenda)) return 'agenda';
  if (startsAt(path, BOOKING_ROUTES.confirm)) return 'confirm';
  if (startsAt(path, BOOKING_ROUTES.payment)) return 'payment';
  if (startsAt(path, BOOKING_ROUTES.success)) return 'success';
  return 'unknown';
}

export function resolveBookingRootRedirect(pathname) {
  return safePathname(pathname) === BOOKING_ROUTES.root ? BOOKING_ROUTES.barbers : '';
}

export function resolveConfirmStepRedirect({
  pathname,
  selectedBranchId,
  selectedBarberId,
  allBlocksComplete,
} = {}) {
  if (!startsAt(pathname, BOOKING_ROUTES.confirm)) return '';
  if (!selectedBranchId || !selectedBarberId) return BOOKING_ROUTES.barbers;
  if (!allBlocksComplete) return BOOKING_ROUTES.agenda;
  return '';
}

export function resolvePaymentStepRedirect({
  pathname,
  allBlocksComplete,
  isPendingPaymentResumeRoute,
  paymentConfirmed,
} = {}) {
  if (!startsAt(pathname, BOOKING_ROUTES.payment)) return '';
  if (!allBlocksComplete && !isPendingPaymentResumeRoute) return BOOKING_ROUTES.agenda;
  if (paymentConfirmed) return BOOKING_ROUTES.success;
  return '';
}

export function resolveAgendaStepRedirect({
  pathname,
  selectedBranchId,
  selectedBarberId,
} = {}) {
  if (!startsAt(pathname, BOOKING_ROUTES.agenda)) return '';
  if (!selectedBranchId || !selectedBarberId) return BOOKING_ROUTES.barbers;
  return '';
}

export function resolveConfirmedPaymentRedirect({
  pathname,
  paymentConfirmed,
} = {}) {
  if (!paymentConfirmed) return '';
  return safePathname(pathname) !== BOOKING_ROUTES.success ? BOOKING_ROUTES.success : '';
}

export function canNavigateToAgenda({
  selectedBranchId,
  selectedBarberId,
} = {}) {
  return Boolean(selectedBranchId && selectedBarberId);
}

export function canNavigateToBarbers({ holdResult } = {}) {
  return !holdResult;
}

export function canNavigateToPayment({
  allBlocksComplete,
  paymentConfirmed,
} = {}) {
  return Boolean(allBlocksComplete && !paymentConfirmed);
}

export function resolveBookingLayoutNavigationState({
  pathname,
  bookingMode,
  availabilityError,
  barbersLoading,
} = {}) {
  return {
    currentStep: resolveBookingStepFromPath(pathname),
    rootRedirectPath: resolveBookingRootRedirect(pathname),
    showTopbarBackToBarberos: startsAt(pathname, BOOKING_ROUTES.agenda),
    homePath: bookingMode === 'authenticated' ? BOOKING_ROUTES.customerHome : BOOKING_ROUTES.home,
    homeLabel: 'Inicio MasterFade',
    showBranchDataErrorBanner: Boolean(
      startsAt(pathname, BOOKING_ROUTES.barbers)
      && availabilityError
      && !barbersLoading
    ),
  };
}

export default function useBookingWizardNavigation({
  location,
  navigate,
  bookingMode,
  selectedBranchId,
  selectedBarberId,
  allBlocksComplete,
  isPendingPaymentResumeRoute,
  paymentConfirmed,
  holdResult,
  availabilityError,
  barbersLoading,
} = {}) {
  const pathname = safePathname(location?.pathname);

  useEffect(() => {
    const target = resolveConfirmStepRedirect({
      pathname,
      selectedBranchId,
      selectedBarberId,
      allBlocksComplete,
    });
    if (target) navigate(target, { replace: true });
  }, [allBlocksComplete, navigate, pathname, selectedBarberId, selectedBranchId]);

  useEffect(() => {
    const target = resolvePaymentStepRedirect({
      pathname,
      allBlocksComplete,
      isPendingPaymentResumeRoute,
      paymentConfirmed,
    });
    if (target) navigate(target, { replace: true });
  }, [allBlocksComplete, isPendingPaymentResumeRoute, navigate, paymentConfirmed, pathname]);

  useEffect(() => {
    const target = resolveAgendaStepRedirect({
      pathname,
      selectedBranchId,
      selectedBarberId,
    });
    if (target) navigate(target, { replace: true });
  }, [navigate, pathname, selectedBarberId, selectedBranchId]);

  useEffect(() => {
    const target = resolveConfirmedPaymentRedirect({ pathname, paymentConfirmed });
    if (target) navigate(target, { replace: true });
  }, [navigate, paymentConfirmed, pathname]);

  const goToAgenda = useCallback(() => {
    if (!canNavigateToAgenda({ selectedBranchId, selectedBarberId })) return;
    navigate(BOOKING_ROUTES.agenda);
  }, [navigate, selectedBarberId, selectedBranchId]);

  const goToBarberos = useCallback(() => {
    if (!canNavigateToBarbers({ holdResult })) return;
    navigate(BOOKING_ROUTES.barbers);
  }, [holdResult, navigate]);

  const goToPayment = useCallback(() => {
    if (!canNavigateToPayment({ allBlocksComplete, paymentConfirmed })) return;
    navigate(BOOKING_ROUTES.payment);
  }, [allBlocksComplete, navigate, paymentConfirmed]);

  const layoutNavigationState = useMemo(
    () => resolveBookingLayoutNavigationState({
      pathname,
      bookingMode,
      availabilityError,
      barbersLoading,
    }),
    [availabilityError, barbersLoading, bookingMode, pathname]
  );

  return {
    ...layoutNavigationState,
    goToAgenda,
    goToBarberos,
    goToPayment,
  };
}
