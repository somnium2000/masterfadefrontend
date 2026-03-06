import { http } from '../../../services/httpClient.js';

export async function getPublicCatalog() {
  const [servicesResponse, packagesResponse] = await Promise.all([
    http.get('/v1/public/catalog/servicios'),
    http.get('/v1/public/catalog/paquetes'),
  ]);

  return {
    services: servicesResponse?.data?.servicios || [],
    packages: packagesResponse?.data?.paquetes || [],
  };
}
