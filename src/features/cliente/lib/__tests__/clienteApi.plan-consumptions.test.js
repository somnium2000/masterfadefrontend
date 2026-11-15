import {beforeEach,expect,test,vi} from 'vitest';
import {listClientePlanConsumos,listClientePlanConsumosPorCita} from '../clienteApi.js';
const mock=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../../../services/httpClient.js',()=>({http:{get:mock.get}}));
vi.mock('../../../../config/supabaseClient.js',()=>({supabase:null}));
beforeEach(()=>mock.get.mockReset().mockResolvedValue({data:{consumos:[],pagination:{page:1,limit:5,total:41,total_pages:9}}}));
test('solicita página real de cinco registros, sin caché y con abort de la vista',async()=>{
 const controller=new AbortController();const response=await listClientePlanConsumos({page:9,id_suscripcion:'subscription',limit:40},{signal:controller.signal});
 const [url,options]=mock.get.mock.calls[0];expect(url).toBe('/v1/cliente/planes/consumos?page=9&id_suscripcion=subscription&limit=5');
 expect(options).toMatchObject({cache:false,dedupe:false,signal:controller.signal});expect(response.pagination.total).toBe(41);
});

// AM: El contrato agrupado es opt-in y no sustituye el listado tradicional.
test('consulta cinco citas completas con agrupacion SQL y mantiene cancelacion de peticion',async()=>{
 mock.get.mockResolvedValueOnce({data:{citas:[],membresias:[],pagination:{page:2,limit:5,total:6,total_pages:2},total_consumos:18}});
 const controller=new AbortController(),response=await listClientePlanConsumosPorCita({page:2,id_suscripcion:'subscription',limit:40},{signal:controller.signal});
 const [url,options]=mock.get.mock.calls[0],parsed=new URL(url,'https://fixture.invalid');
 expect(parsed.pathname).toBe('/v1/cliente/planes/consumos');expect(Object.fromEntries(parsed.searchParams)).toEqual({page:'2',id_suscripcion:'subscription',agrupar_por:'cita',limit:'5'});
 expect(options).toMatchObject({cache:false,dedupe:false,signal:controller.signal});expect(response.total_consumos).toBe(18);expect(response.pagination.total).toBe(6);
});
