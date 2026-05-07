const fs = require('fs');
const path = 'src/features/admin/pages/AdminCitasPreviewPage.jsx';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(/\r\n/g, '\n');

const replacements = [
  {
    target: `  const fetchAvailability = useCallback(async () => {
    if (!selectedBranchId || !activeBlockBarberId || !servicesCsv) {
      setAvailabilityMap({});
      setAvailabilityLoading(false);
      return;
    }

    const cacheKey = [selectedBranchId, activeBlockBarberId, servicesCsv, monthRange.from, monthRange.to].join('|');`,
    replacement: `  const fetchAvailability = useCallback(async () => {
    const hasSelection = selectionType === 'package' ? Boolean(selectedPackageId) : Boolean(servicesCsv);
    if (!selectedBranchId || !activeBlockBarberId || !hasSelection) {
      setAvailabilityMap({});
      setAvailabilityLoading(false);
      return;
    }

    const cacheKey = [selectedBranchId, activeBlockBarberId || 'auto', selectionType, selectedPackageId, servicesCsv, monthRange.from, monthRange.to].join('|');`
  },
  {
    target: `      const response = await listPublicAgendaDisponibilidad(
        {
          id_sucursal: selectedBranchId,
          id_barbero: activeBlockBarberId,
          servicios: servicesCsv,
          fecha_desde: monthRange.from,
          fecha_hasta: monthRange.to,
        },
        { signal: controller.signal }
      );`,
    replacement: `      const response = await listPublicAgendaDisponibilidad(
        {
          id_sucursal: selectedBranchId,
          id_barbero: activeBlockBarberId || undefined,
          selection_type: selectionType,
          servicios: selectionType === 'services' ? servicesCsv : undefined,
          id_paquete: selectionType === 'package' ? selectedPackageId : undefined,
          fecha_desde: monthRange.from,
          fecha_hasta: monthRange.to,
        },
        { signal: controller.signal }
      );`
  },
  {
    target: `  }, [
    activeBlockBarberId,
    effectiveActiveBlockIndex,
    minBookingDateKey,
    monthRange.from,
    monthRange.to,
    selectedBranchId,
    selectedDate,
    servicesCsv,
    updateBlockAtIndex,
  ]);`,
    replacement: `  }, [
    activeBlockBarberId,
    effectiveActiveBlockIndex,
    minBookingDateKey,
    monthRange.from,
    monthRange.to,
    selectedBranchId,
    selectedDate,
    servicesCsv,
    selectionType,
    selectedPackageId,
    updateBlockAtIndex,
  ]);`
  },
  {
    target: `  const fetchSlots = useCallback(async () => {
    if (!selectedBranchId || !activeBlockBarberId || !servicesCsv || !selectedDate) {
      setSlots(buildDefaultSlots());
      setSlotsLoading(false);
      return;
    }

    const cacheKey = [selectedBranchId, activeBlockBarberId, servicesCsv, selectedDate].join('|');`,
    replacement: `  const fetchSlots = useCallback(async () => {
    const hasSelection = selectionType === 'package' ? Boolean(selectedPackageId) : Boolean(servicesCsv);
    if (!selectedBranchId || !activeBlockBarberId || !hasSelection || !selectedDate) {
      setSlots(buildDefaultSlots());
      setSlotsLoading(false);
      return;
    }

    const cacheKey = [selectedBranchId, activeBlockBarberId || 'auto', selectionType, selectedPackageId, servicesCsv, selectedDate].join('|');`
  },
  {
    target: `      const response = await listPublicAgendaHorarios(
        {
          id_sucursal: selectedBranchId,
          id_barbero: activeBlockBarberId,
          servicios: servicesCsv,
          fecha: selectedDate,
        },
        { signal: controller.signal }
      );`,
    replacement: `      const response = await listPublicAgendaHorarios(
        {
          id_sucursal: selectedBranchId,
          id_barbero: activeBlockBarberId || undefined,
          selection_type: selectionType,
          servicios: selectionType === 'services' ? servicesCsv : undefined,
          id_paquete: selectionType === 'package' ? selectedPackageId : undefined,
          fecha: selectedDate,
        },
        { signal: controller.signal }
      );`
  },
  {
    target: `  }, [
    activeBlockBarberId,
    effectiveActiveBlockIndex,
    notifications,
    selectedBranchId,
    selectedDate,
    selectedTime,
    servicesCsv,
    updateBlockAtIndex,
  ]);`,
    replacement: `  }, [
    activeBlockBarberId,
    effectiveActiveBlockIndex,
    notifications,
    selectedBranchId,
    selectedDate,
    selectedTime,
    servicesCsv,
    selectionType,
    selectedPackageId,
    updateBlockAtIndex,
  ]);`
  },
  {
    target: `  const fetchSlotsForBarber = useCallback(async ({ barberId, dateKey, servicesCsvValue }) => {
    if (!selectedBranchId || !barberId || !dateKey || !servicesCsvValue) {
      return buildDefaultSlots();
    }

    const cacheKey = [selectedBranchId, barberId, servicesCsvValue, dateKey].join('|');`,
    replacement: `  const fetchSlotsForBarber = useCallback(async ({ barberId, dateKey, servicesCsvValue, selectionTypeValue, packageIdValue }) => {
    const hasSel = selectionTypeValue === 'package' ? Boolean(packageIdValue) : Boolean(servicesCsvValue);
    if (!selectedBranchId || !barberId || !dateKey || !hasSel) {
      return buildDefaultSlots();
    }

    const cacheKey = [selectedBranchId, barberId, selectionTypeValue, packageIdValue, servicesCsvValue, dateKey].join('|');`
  },
  {
    target: `    const response = await listPublicAgendaHorarios({
      id_sucursal: selectedBranchId,
      id_barbero: barberId,
      servicios: servicesCsvValue,
      fecha: dateKey,
    });`,
    replacement: `    const response = await listPublicAgendaHorarios({
      id_sucursal: selectedBranchId,
      id_barbero: barberId,
      selection_type: selectionTypeValue,
      servicios: selectionTypeValue === 'services' ? servicesCsvValue : undefined,
      id_paquete: selectionTypeValue === 'package' ? packageIdValue : undefined,
      fecha: dateKey,
    });`
  },
  {
    target: `  const selectSuggestedBarber = useCallback(async (barberId, timeKey) => {`,
    replacement: `  const selectSelectionType = useCallback((type) => {
    updateBlockAtIndex(effectiveActiveBlockIndex, {
      selectionType: type,
      packageId: '',
      serviceIds: [],
      selectedDate: '',
      selectedTime: '',
    });
  }, [effectiveActiveBlockIndex, updateBlockAtIndex]);

  const selectPackage = useCallback((pkgId) => {
    updateBlockAtIndex(effectiveActiveBlockIndex, {
      selectionType: 'package',
      packageId: pkgId,
      serviceIds: [],
      selectedDate: '',
      selectedTime: '',
    });
  }, [effectiveActiveBlockIndex, updateBlockAtIndex]);

  const selectSuggestedBarber = useCallback(async (barberId, timeKey) => {`
  },
  {
    target: `      // --- Vista previa: paquetes deshabilitados; stubs estaticos ---
      packages: [],
      packagesLoading: false,
      selectionType: 'services',
      selectedPackage: null,
      selectedPackageId: null,
      selectPackage: () => {},
      selectSelectionType: () => {},`,
    replacement: `      packages,
      packagesLoading,
      selectionType,
      selectedPackage,
      selectedPackageId,
      selectPackage,
      selectSelectionType,`
  }
];

let modifications = 0;
for (const { target, replacement } of replacements) {
    // Normalize target matching for safety against previous manual edits
    if (content.includes(target)) {
        content = content.replace(target, replacement);
        modifications++;
    } else {
        console.error("Failed to find target:\n" + target.substring(0, 100) + "...");
    }
}

fs.writeFileSync(path, content, 'utf8');
console.log('Modifications made:', modifications);
