import {beforeEach,expect,test,vi} from 'vitest';
import {listClientePlanConsumos} from '../clienteApi.js';
const mock=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../../../services/httpClient.js',()=>({http:{get:mock.get}}));
vi.mock('../../../../config/supabaseClient.js',()=>({supabase:null}));
beforeEach(()=>mock.get.mockReset().mockResolvedValue({data:{consumos:[],pagination:{page:1,limit:5,total:41,total_pages:9}}}));
test('solicita página real de cinco registros, sin caché y con abort de la vista',async()=>{
 const controller=new AbortController();const response=await listClientePlanConsumos({page:9,id_suscripcion:'subscription',limit:40},{signal:controller.signal});
 const [url,options]=mock.get.mock.calls[0];expect(url).toBe('/v1/cliente/planes/consumos?page=9&id_suscripcion=subscription&limit=5');
 expect(options).toMatchObject({cache:false,dedupe:false,signal:controller.signal});expect(response.pagination.total).toBe(41);
});
