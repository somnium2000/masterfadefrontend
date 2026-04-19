const fs = require('fs');
const path = 'src/features/admin/pages/AdminCitasPreviewPage.jsx';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(/\r\n/g, '\n');

const replacements = [
  {
    target: `    idBarbero: String(block?.idBarbero || '').trim(),
    serviceIds: nextServiceIds,`,
    replacement: `    idBarbero: String(block?.idBarbero || '').trim(),
    selectionType: String(block?.selectionType || 'services').trim().toLowerCase() === 'package' ? 'package' : 'services',
    packageId: String(block?.packageId || '').trim(),
    serviceIds: nextServiceIds,`
  },
  {
    target: `    && left.idBarbero === right.idBarbero
    && left.selectedDate === right.selectedDate`,
    replacement: `    && left.idBarbero === right.idBarbero
    && left.selectionType === right.selectionType
    && left.packageId === right.packageId
    && left.selectedDate === right.selectedDate`
  },
  {
    target: `      idBarbero,
      serviceIds: [],`,
    replacement: `      idBarbero,
      selectionType: 'services',
      packageId: '',
      serviceIds: [],`
  },
  {
    target: `  const [servicesLoading, setServicesLoading] = useState(false);
  const [services, setServices] = useState([]);`,
    replacement: `  const [servicesLoading, setServicesLoading] = useState(false);
  const [services, setServices] = useState([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [packages, setPackages] = useState([]);`
  },
  {
    target: `  const selectedDate = activeBlock?.selectedDate || '';
  const selectedTime = activeBlock?.selectedTime || '';`,
    replacement: `  const selectionType = activeBlock?.selectionType || 'services';
  const selectedPackageId = activeBlock?.packageId || '';
  const selectedDate = activeBlock?.selectedDate || '';
  const selectedTime = activeBlock?.selectedTime || '';`
  },
  {
    target: `  const servicesById = useMemo(() => {`,
    replacement: `  const packagesById = useMemo(() => {
    const map = new Map();
    (Array.isArray(packages) ? packages : []).forEach((pkg) => {
      if (!pkg?.id_paquete) return;
      map.set(pkg.id_paquete, pkg);
    });
    return map;
  }, [packages]);

  const selectedPackage = useMemo(
    () => packagesById.get(selectedPackageId) || null,
    [packagesById, selectedPackageId]
  );

  const servicesById = useMemo(() => {`
  },
  {
    target: `  const bookingBlocksSummary = useMemo(
    () =>
      bookingBlocks.map((block, index) => {
        const blockServices = (Array.isArray(block.serviceIds) ? block.serviceIds : [])
          .map((serviceId) => servicesById.get(serviceId))
          .filter(Boolean);
        const blockTotal = blockServices.reduce((total, service) => total + Number(service?.precio_hnl || 0), 0);
        const contactName = String(block?.contactName || '').trim();
        return {
          ...block,
          index,
          alias: block.alias || (index === 0 ? 'Titular' : \`Acompañante \${index}\`),
          barbero: barbersById.get(block.idBarbero) || null,
          selectedServices: blockServices,
          // AM: preview expone selection_type para compatibilidad con PublicBookingConfirmStep
          selection_type: 'services',
          selectedPackage: null,
          total_hnl: blockTotal,
          isComplete: Boolean(
            block.idBarbero
              && blockServices.length > 0
              && block.selectedDate
              && block.selectedTime
              // AM: contactName requerido en preview para coherencia con toggleService
              && contactName
          ),
        };
      }),
    [bookingBlocks, servicesById, barbersById]
  );`,
    replacement: `  const bookingBlocksSummary = useMemo(
    () =>
      bookingBlocks.map((block, index) => {
        const blockServices = (Array.isArray(block.serviceIds) ? block.serviceIds : [])
          .map((serviceId) => servicesById.get(serviceId))
          .filter(Boolean);
        const blockTotal = blockServices.reduce((total, service) => total + Number(service?.precio_hnl || 0), 0);
        const blockPackage = packagesById.get(block.packageId) || null;
        
        let finalTotal = blockTotal;
        if (block.selectionType === 'package' && blockPackage) {
            finalTotal = blockPackage.precio_hnl != null ? Number(blockPackage.precio_hnl) : blockTotal;
        }

        const contactName = String(block?.contactName || '').trim();
        const hasSelection = block.selectionType === 'package' ? Boolean(block.packageId) : blockServices.length > 0;

        return {
          ...block,
          index,
          alias: block.alias || (index === 0 ? 'Titular' : \`Acompañante \${index}\`),
          barbero: barbersById.get(block.idBarbero) || null,
          selectedServices: blockServices,
          selection_type: block.selectionType || 'services',
          selectedPackage: blockPackage,
          total_hnl: finalTotal,
          isComplete: Boolean(
            block.idBarbero
              && hasSelection
              && block.selectedDate
              && block.selectedTime
              && contactName
          ),
        };
      }),
    [bookingBlocks, servicesById, barbersById, packagesById]
  );`
  },
  {
    target: `      const [barbersResponse, servicesResponse] = await Promise.all([
        listPublicAgendaBarberos({ id_sucursal: selectedBranchId }),
        listPublicCatalogServicios({ id_sucursal: selectedBranchId }),
      ]);
      if (requestSeq !== branchDataRequestSeqRef.current) return;

      const barbersPayload = barbersResponse?.data ?? barbersResponse;
      const servicesPayload = servicesResponse?.data ?? servicesResponse;
      const nextBarbers = Array.isArray(barbersPayload?.barberos) ? barbersPayload.barberos : [];
      const nextServices = Array.isArray(servicesPayload?.servicios) ? servicesPayload.servicios : [];`,
    replacement: `      const [barbersResponse, servicesResponse, packagesResponse] = await Promise.all([
        listPublicAgendaBarberos({ id_sucursal: selectedBranchId }),
        listPublicCatalogServicios({ id_sucursal: selectedBranchId }),
        listPublicCatalogPaquetes({ id_sucursal: selectedBranchId }),
      ]);
      if (requestSeq !== branchDataRequestSeqRef.current) return;

      const barbersPayload = barbersResponse?.data ?? barbersResponse;
      const servicesPayload = servicesResponse?.data ?? servicesResponse;
      const packagesPayload = packagesResponse?.data ?? packagesResponse;
      
      const nextBarbers = Array.isArray(barbersPayload?.barberos) ? barbersPayload.barberos : [];
      const nextServices = Array.isArray(servicesPayload?.servicios) ? servicesPayload.servicios : [];
      const nextPackages = Array.isArray(packagesPayload?.paquetes) ? packagesPayload.paquetes : [];`
  },
  {
    target: `      setBarbers(nextBarbers);
      setServices(nextServices);`,
    replacement: `      setBarbers(nextBarbers);
      setServices(nextServices);
      setPackages(nextPackages);`
  }
];

let modifications = 0;
for (const { target, replacement } of replacements) {
    if (content.includes(target)) {
        content = content.replace(target, replacement);
        modifications++;
    } else {
        console.error("Failed to find target:\n" + target);
    }
}

fs.writeFileSync(path, content, 'utf8');
console.log('Modifications made:', modifications);
