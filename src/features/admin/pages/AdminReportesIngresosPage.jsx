import AdminReportesSubmodulePage from './AdminReportesSubmodulePage.jsx';

// JK: Wrapper dedicado para la ruta /reportes/ingresos reutilizando logica central.
export default function AdminReportesIngresosPage() {
  return <AdminReportesSubmodulePage moduleType="ingresos" />;
}
