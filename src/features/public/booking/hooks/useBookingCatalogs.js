import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getClienteMembershipEstado,
  getPublicBookingContext,
  listPublicAgendaBarberos,
  listPublicAgendaPromociones,
  listPublicCatalogPaquetes,
  listPublicCatalogServicios,
} from '../publicBookingApi.js';
import { BOOKING_HOLDER_ALIAS, EMPTY_CONTEXT } from '../constants/bookingDefaults.js';
import {
  areServiceIdsEqual,
  createBookingBlock,
  normalizeBookingBlock,
} from '../utils/bookingMappers.js';
import { readNumberParam } from '../utils/bookingValidators.js';
import {
  MAX_PROMOTIONS_PER_BOOKING,
  extractMessage,
  normalizePromotionIds,
} from '../bookingUtils.js';

export default function useBookingCatalogs({
  canUseClienteHold,
  activeBlockBarberId,
  setBookingBlocks,
  setAvailabilityError,
  notifyError,
} = {}) {
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState('');
  const [contextData, setContextData] = useState(EMPTY_CONTEXT);

  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [barbersLoading, setBarbersLoading] = useState(false);
  const [barbersRefreshing, setBarbersRefreshing] = useState(false);
  const [barbers, setBarbers] = useState([]);

  const [servicesLoading, setServicesLoading] = useState(false);
  const [services, setServices] = useState([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [packages, setPackages] = useState([]);
  const [promotionsLoading, setPromotionsLoading] = useState(false);
  const [promotions, setPromotions] = useState([]);
  const [promotionsLoadError, setPromotionsLoadError] = useState('');
  const [membershipStateData, setMembershipStateData] = useState(null);

  const contextAbortRef = useRef(null);
  const branchDataAbortRef = useRef(null);
  const membershipStateAbortRef = useRef(null);
  const branchDataRequestSeqRef = useRef(0);
  const branchDataCacheRef = useRef(new Map());
  const barbersCountRef = useRef(0);
  const servicesCountRef = useRef(0);
  const packagesCountRef = useRef(0);
  const promotionsCountRef = useRef(0);

  const branchList = useMemo(
    () => (Array.isArray(contextData?.sucursales) ? contextData.sucursales : []),
    [contextData?.sucursales]
  );

  const maxPromotionsPerBooking = useMemo(
    () => Math.max(
      1,
      Math.trunc(
        readNumberParam(
          contextData?.parametros,
          'agendamiento_max_promociones_por_reserva',
          MAX_PROMOTIONS_PER_BOOKING
        )
      )
    ),
    [contextData?.parametros]
  );

  useEffect(() => {
    barbersCountRef.current = Array.isArray(barbers) ? barbers.length : 0;
  }, [barbers]);

  useEffect(() => {
    servicesCountRef.current = Array.isArray(services) ? services.length : 0;
  }, [services]);

  useEffect(() => {
    packagesCountRef.current = Array.isArray(packages) ? packages.length : 0;
  }, [packages]);

  useEffect(() => {
    promotionsCountRef.current = Array.isArray(promotions) ? promotions.length : 0;
  }, [promotions]);

  const abortBranchData = useCallback(() => {
    if (branchDataAbortRef.current) {
      branchDataAbortRef.current.abort();
      branchDataAbortRef.current = null;
    }
  }, []);

  const fetchContext = useCallback(async () => {
    if (contextAbortRef.current) {
      contextAbortRef.current.abort();
    }

    const controller = new AbortController();
    contextAbortRef.current = controller;
    setContextLoading(true);
    setContextError('');
    try {
      const response = await getPublicBookingContext({ signal: controller.signal });
      const payload = response?.data ?? response;
      const nextContext = {
        sucursales: Array.isArray(payload?.sucursales) ? payload.sucursales : [],
        parametros: payload?.parametros || {},
      };
      setContextData(nextContext);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setContextError(extractMessage(err));
    } finally {
      if (contextAbortRef.current === controller) {
        contextAbortRef.current = null;
        setContextLoading(false);
      }
    }
  }, []);

  const fetchBranchData = useCallback(async () => {
    if (!selectedBranchId) {
      abortBranchData();
      branchDataRequestSeqRef.current += 1;
      setBarbers([]);
      setServices([]);
      setPackages([]);
      setPromotions([]);
      setPromotionsLoadError('');
      setBarbersLoading(false);
      setBarbersRefreshing(false);
      setServicesLoading(false);
      setPackagesLoading(false);
      setPromotionsLoading(false);
      return;
    }

    const cacheKey = [selectedBranchId, activeBlockBarberId || 'auto', maxPromotionsPerBooking].join('|');
    const cached = branchDataCacheRef.current.get(cacheKey);
    if (cached) {
      abortBranchData();
      branchDataRequestSeqRef.current += 1;
      setBarbers(cached.barbers);
      setServices(cached.services);
      setPackages(cached.packages);
      setPromotions(cached.promotions);
      setPromotionsLoadError(cached.promotionsLoadError || '');
      if (typeof setAvailabilityError === 'function') {
        setAvailabilityError(cached.availabilityError || '');
      }
      setBarbersLoading(false);
      setBarbersRefreshing(false);
      setServicesLoading(false);
      setPackagesLoading(false);
      setPromotionsLoading(false);
      return;
    }

    abortBranchData();

    const controller = new AbortController();
    branchDataAbortRef.current = controller;
    const requestSeq = branchDataRequestSeqRef.current + 1;
    branchDataRequestSeqRef.current = requestSeq;
    const hasExistingBarbers = barbersCountRef.current > 0;
    const hasExistingCatalog = servicesCountRef.current > 0 || packagesCountRef.current > 0;
    const hasExistingPromotions = promotionsCountRef.current > 0;
    setBarbersLoading(!hasExistingBarbers);
    setBarbersRefreshing(hasExistingBarbers);
    setServicesLoading(!hasExistingCatalog);
    setPackagesLoading(!hasExistingCatalog);
    setPromotionsLoading(!hasExistingPromotions);
    setPromotionsLoadError('');
    if (typeof setAvailabilityError === 'function') {
      setAvailabilityError('');
    }

    try {
      const barbersResponse = await listPublicAgendaBarberos(
        { id_sucursal: selectedBranchId },
        { signal: controller.signal }
      );
      if (requestSeq !== branchDataRequestSeqRef.current) return;

      const barbersPayload = barbersResponse?.data ?? barbersResponse;
      const nextBarbers = Array.isArray(barbersPayload?.barberos) ? barbersPayload.barberos : [];
      const validBarberIds = new Set(nextBarbers.map((barber) => barber.id_empleado));
      const fallbackBarberId = nextBarbers[0]?.id_empleado || '';
      const scopedBarberId = activeBlockBarberId && validBarberIds.has(activeBlockBarberId)
        ? activeBlockBarberId
        : '';

      setBarbers(nextBarbers);
      setBarbersLoading(false);
      setBarbersRefreshing(false);

      const [servicesResult, packagesResult, promotionsResult] = await Promise.allSettled([
        listPublicCatalogServicios({
          id_sucursal: selectedBranchId,
          id_barbero: scopedBarberId || undefined,
        }, { signal: controller.signal }),
        listPublicCatalogPaquetes({
          id_sucursal: selectedBranchId,
          id_barbero: scopedBarberId || undefined,
        }, { signal: controller.signal }),
        listPublicAgendaPromociones({
          id_sucursal: selectedBranchId,
        }, { signal: controller.signal }),
      ]);
      if (requestSeq !== branchDataRequestSeqRef.current) return;
      if (controller.signal.aborted) return;

      let nextServices = [];
      let validServiceIds = new Set();
      if (servicesResult.status === 'fulfilled') {
        const servicesResponse = servicesResult.value;
        const servicesPayload = servicesResponse?.data ?? servicesResponse;
        const rawServices = Array.isArray(servicesPayload?.servicios)
          ? servicesPayload.servicios.filter(
            (service) => service?.activo !== false && service?.agendable && !service?.servicio_informativo
          )
          : [];
        const dedupedServicesMap = new Map();
        rawServices.forEach((service) => {
          const serviceId = String(service?.id_servicio || '').trim();
          if (!serviceId || dedupedServicesMap.has(serviceId)) return;
          dedupedServicesMap.set(serviceId, service);
        });
        nextServices = Array.from(dedupedServicesMap.values());
        validServiceIds = new Set(nextServices.map((service) => service.id_servicio));
      }

      let nextPackages = [];
      let validPackageIds = new Set();
      if (packagesResult.status === 'fulfilled') {
        const packagesResponse = packagesResult.value;
        const packagesPayload = packagesResponse?.data ?? packagesResponse;
        nextPackages = Array.isArray(packagesPayload?.paquetes)
          ? packagesPayload.paquetes
          : [];
        validPackageIds = new Set(nextPackages.map((pkg) => pkg.id_paquete));
      }

      const nextPromotions = promotionsResult.status === 'fulfilled'
        ? (() => {
          const promotionsResponse = promotionsResult.value;
          const promotionsPayload = promotionsResponse?.data ?? promotionsResponse;
          return Array.isArray(promotionsPayload?.promociones)
            ? promotionsPayload.promociones
            : [];
        })()
        : [];
      const validPromotionIds = new Set(nextPromotions.map((promotion) => String(promotion?.id_promocion || '').trim()).filter(Boolean));
      let nextPromotionsLoadError = '';
      let nextAvailabilityError = '';
      if (promotionsResult.status !== 'fulfilled') {
        nextPromotionsLoadError = 'No se pudieron cargar promociones en este momento. Puedes continuar sin promociones.';
        setPromotionsLoadError(nextPromotionsLoadError);
      }
      if (servicesResult.status !== 'fulfilled' || packagesResult.status !== 'fulfilled') {
        nextAvailabilityError = 'No se pudo cargar el catálogo completo de esta sucursal en este momento. Puedes reintentar.';
        if (typeof setAvailabilityError === 'function') {
          setAvailabilityError(nextAvailabilityError);
        }
      }

      setServices(nextServices);
      setPackages(nextPackages);
      setPromotions(nextPromotions);
      branchDataCacheRef.current.set(cacheKey, {
        barbers: nextBarbers,
        services: nextServices,
        packages: nextPackages,
        promotions: nextPromotions,
        promotionsLoadError: nextPromotionsLoadError,
        availabilityError: nextAvailabilityError,
      });

      if (typeof setBookingBlocks === 'function') {
        setBookingBlocks((prev) => {
          const sourceBlocks = prev.length > 0
            ? prev
            : [createBookingBlock({ alias: BOOKING_HOLDER_ALIAS, idBarbero: fallbackBarberId })];

          let hasChanges = false;
          const normalizedSource = sourceBlocks.map((block, index) => normalizeBookingBlock(block, index));

          const nextBlocks = normalizedSource.map((block) => {
            const nextBarberId = validBarberIds.has(block.idBarbero)
              ? block.idBarbero
              : fallbackBarberId;
            const nextServiceIdsRaw = block.serviceIds.filter((serviceId) => validServiceIds.has(serviceId));
            const nextPackageId = validPackageIds.has(block.packageId)
              ? block.packageId
              : '';
            const nextPromotionIds = normalizePromotionIds(block.promotionIds, block.promotionId)
              .filter((id) => validPromotionIds.has(id))
              .slice(0, maxPromotionsPerBooking);
            const nextPromotionId = nextPromotionIds[0] || '';

            const nextPackage = nextPackageId
              ? nextPackages.find((pkg) => pkg?.id_paquete === nextPackageId) || null
              : null;
            const includedByPackage = new Set(
              (Array.isArray(nextPackage?.items) ? nextPackage.items : [])
                .map((item) => String(item?.id_servicio || '').trim())
                .filter(Boolean)
            );
            const nextServiceIds = nextServiceIdsRaw.filter((serviceId) => !includedByPackage.has(serviceId));

            const normalizedSelectionType = nextPackageId && nextServiceIds.length > 0
              ? 'mixed'
              : nextPackageId
                ? 'package'
                : 'services';

            if (
              block.idBarbero === nextBarberId
              && areServiceIdsEqual(block.serviceIds, nextServiceIds)
              && block.selectionType === normalizedSelectionType
              && block.packageId === nextPackageId
              && block.promotionId === nextPromotionId
              && areServiceIdsEqual(block.promotionIds, nextPromotionIds)
            ) {
              return block;
            }

            hasChanges = true;
            return {
              ...block,
              idBarbero: nextBarberId,
              selectionType: normalizedSelectionType,
              packageId: nextPackageId,
              serviceIds: nextServiceIds,
              promotionId: nextPromotionId,
              promotionIds: nextPromotionIds,
              selectedDate: '',
              selectedTime: '',
              selectedDateTime: '',
            };
          });

          return hasChanges ? nextBlocks : normalizedSource;
        });
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (requestSeq !== branchDataRequestSeqRef.current) return;
      const status = Number(err?.status || 0);
      const message = status >= 500
        ? 'No se pudo cargar la agenda de esta sucursal en este momento. Puedes reintentar o cambiar de sucursal.'
        : extractMessage(err);
      setBarbers([]);
      if (typeof setAvailabilityError === 'function') {
        setAvailabilityError(message);
      }
      if (typeof notifyError === 'function') {
        notifyError(message, { dedupeKey: 'public-booking-branch-data-error' });
      }
    } finally {
      if (requestSeq === branchDataRequestSeqRef.current) {
        if (branchDataAbortRef.current === controller) {
          branchDataAbortRef.current = null;
        }
        setBarbersLoading(false);
        setBarbersRefreshing(false);
        setServicesLoading(false);
        setPackagesLoading(false);
        setPromotionsLoading(false);
      }
    }
  }, [
    abortBranchData,
    activeBlockBarberId,
    maxPromotionsPerBooking,
    notifyError,
    selectedBranchId,
    setAvailabilityError,
    setBookingBlocks,
  ]);

  useEffect(() => {
    void fetchContext();
  }, [fetchContext]);

  useEffect(() => {
    if (!branchList.length) {
      setSelectedBranchId('');
      return;
    }

    setSelectedBranchId((prev) =>
      branchList.some((branch) => branch.id_sucursal === prev) ? prev : branchList[0]?.id_sucursal || ''
    );
  }, [branchList]);

  useEffect(() => {
    void fetchBranchData();
  }, [fetchBranchData]);

  useEffect(() => {
    if (!canUseClienteHold) {
      if (membershipStateAbortRef.current) {
        membershipStateAbortRef.current.abort();
        membershipStateAbortRef.current = null;
      }
      setMembershipStateData(null);
      return;
    }

    if (membershipStateAbortRef.current) {
      membershipStateAbortRef.current.abort();
    }
    const controller = new AbortController();
    membershipStateAbortRef.current = controller;
    (async () => {
      try {
        const response = await getClienteMembershipEstado({ signal: controller.signal });
        if (controller.signal.aborted) return;
        const payload = response?.data ?? response;
        setMembershipStateData(payload && typeof payload === 'object' ? payload : null);
      } catch (err) {
        if (err?.name === 'AbortError' || controller.signal.aborted) return;
        setMembershipStateData(null);
      } finally {
        if (membershipStateAbortRef.current === controller) {
          membershipStateAbortRef.current = null;
        }
      }
    })();

    return () => {
      controller.abort();
      if (membershipStateAbortRef.current === controller) {
        membershipStateAbortRef.current = null;
      }
    };
  }, [canUseClienteHold]);

  useEffect(() => () => {
    if (contextAbortRef.current) contextAbortRef.current.abort();
    if (branchDataAbortRef.current) branchDataAbortRef.current.abort();
    if (membershipStateAbortRef.current) membershipStateAbortRef.current.abort();
  }, []);

  return {
    contextLoading,
    contextError,
    setContextError,
    contextData,
    selectedBranchId,
    setSelectedBranchId,
    branchList,
    barbersLoading,
    barbersRefreshing,
    barbers,
    servicesLoading,
    services,
    packagesLoading,
    packages,
    promotionsLoading,
    promotions,
    promotionsLoadError,
    membershipStateData,
    fetchContext,
    fetchBranchData,
    abortBranchData,
  };
}
