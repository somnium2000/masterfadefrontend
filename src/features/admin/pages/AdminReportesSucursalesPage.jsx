import AdminReportesSubmodulePage from './AdminReportesSubmodulePage.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';

// JK: Wrapper dedicado para la ruta /reportes/sucursales reutilizando logica central.
export default function AdminReportesSucursalesPage() {
  const { user, roles = [], branchIds = [], empresaId } = useAuth();
  if (!Array.isArray(roles) || !roles.includes('super_admin')) return null;
  const scopeKey = JSON.stringify({
    userId: user?.id_usuario || user?.id || null,
    roles: [...roles].sort(),
    branchIds: Array.isArray(branchIds) ? [...branchIds].sort() : [],
    empresaId: empresaId || null,
  });
  return <AdminReportesSubmodulePage key={scopeKey} moduleType="sucursales" />;
}
