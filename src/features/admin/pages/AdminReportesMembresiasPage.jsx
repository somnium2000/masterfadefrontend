import AdminReportesSubmodulePage from './AdminReportesSubmodulePage.jsx';

// JK: Wrapper dedicado para la ruta /reportes/membresias reutilizando logica central.
export default function AdminReportesMembresiasPage() {
  return <AdminReportesSubmodulePage moduleType="membresias" />;
}
