import AdminReportesSubmodulePage from './AdminReportesSubmodulePage.jsx';

// JK: Wrapper dedicado para la ruta /reportes/barberos reutilizando logica central.
export default function AdminReportesBarberosPage() {
  return <AdminReportesSubmodulePage moduleType="barberos" />;
}
