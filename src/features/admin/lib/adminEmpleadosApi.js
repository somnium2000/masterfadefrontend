// src/features/admin/lib/adminEmpleadosApi.js
import { http } from '../../../services/httpClient.js';

const BASE = '/v1/admin/empleados';

/** GET /v1/admin/empleados */
export async function listAdminEmpleados() {
    return http.get(BASE);
}
