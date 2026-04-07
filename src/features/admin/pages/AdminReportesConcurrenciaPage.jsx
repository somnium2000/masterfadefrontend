import AdminReportesSubmodulePage from './AdminReportesSubmodulePage.jsx';

// JK: Wrapper dedicado para la ruta /reportes/concurrencia reutilizando logica central.
export default function AdminReportesConcurrenciaPage() {
  return <AdminReportesSubmodulePage moduleType="concurrencia" />;
}
