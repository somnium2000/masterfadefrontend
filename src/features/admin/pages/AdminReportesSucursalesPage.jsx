import AdminReportesSubmodulePage from './AdminReportesSubmodulePage.jsx';

// JK: Wrapper dedicado para la ruta /reportes/sucursales reutilizando logica central.
export default function AdminReportesSucursalesPage() {
  return <AdminReportesSubmodulePage moduleType="sucursales" />;
}
