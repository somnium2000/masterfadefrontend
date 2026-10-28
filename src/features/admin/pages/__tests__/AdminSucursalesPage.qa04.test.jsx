// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach,beforeEach,expect,test,vi } from 'vitest';
import Page from '../AdminSucursalesPage.jsx';
const api=vi.hoisted(()=>Object.fromEntries(['activateAdminSucursal','createAdminSucursal','getAdminSucursal','inactivateAdminSucursal','listAdminEmpresas','listAdminSucursales','updateAdminSucursal'].map(k=>[k,vi.fn()])));
const auth=vi.hoisted(()=>({roles:['super_admin'],user:{id_usuario:'actor-A'}}));
const notices=vi.hoisted(()=>({success:vi.fn(),error:vi.fn(),warning:vi.fn()}));
const navigate=vi.hoisted(()=>vi.fn());
vi.mock('../../lib/adminSucursalesApi.js',()=>api);
vi.mock('../../../../context/AuthContext.jsx',()=>({useAuth:()=>auth}));
vi.mock('../../../../context/NotificationsContext.jsx',()=>({useNotifications:()=>notices}));
vi.mock('react-router-dom',()=>({useNavigate:()=>navigate}));
const branch=(id='A')=>({id_sucursal:id,nombre_sucursal:`Sucursal ${id}`,id_empresa:'E',nombre_empresa:'Empresa',estado:true});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
async function edit(id='A'){const row=(await screen.findByText(`Sucursal ${id}`)).closest('tr');fireEvent.click(within(row).getByRole('button',{name:'Editar'}));await screen.findByDisplayValue(`Sucursal ${id}`);}
async function save(){fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Actualizar'}));}
beforeEach(()=>{Object.values(api).forEach(m=>m.mockReset());Object.values(notices).forEach(m=>m.mockReset());navigate.mockReset();auth.roles=['super_admin'];auth.user={id_usuario:'actor-A'};localStorage.setItem('mf-view-sucursales','table');api.listAdminSucursales.mockResolvedValue({data:{sucursales:[branch(),branch('B')]}});api.listAdminEmpresas.mockResolvedValue({data:{empresas:[{id_empresa:'E',nombre_empresa:'Empresa'}]}});api.getAdminSucursal.mockImplementation(id=>Promise.resolve({data:{sucursal:branch(id)}}));api.updateAdminSucursal.mockResolvedValue({data:{sucursal:branch()}});});afterEach(cleanup);
test.each(['resolve','reject'])('guardado desmontado descarta %s',async outcome=>{const p=deferred();api.updateAdminSucursal.mockReturnValue(p.promise);const v=render(<Page/>);await edit();await save();const count=api.listAdminSucursales.mock.calls.length;v.unmount();await act(async()=>outcome==='resolve'?p.resolve({data:{sucursal:branch()}}):p.reject({status:401}));expect(notices.success).not.toHaveBeenCalled();expect(navigate).not.toHaveBeenCalled();expect(api.listAdminSucursales).toHaveBeenCalledTimes(count);});
test('guardar A y abrir B no cierra ni modifica editor B',async()=>{const p=deferred();api.updateAdminSucursal.mockReturnValue(p.promise);render(<Page/>);await edit();await save();fireEvent.keyDown(document,{key:'Escape',code:'Escape'});await edit('B');await act(async()=>p.resolve({data:{sucursal:branch()}}));expect(screen.getByDisplayValue('Sucursal B')).toBeInTheDocument();expect(notices.success).not.toHaveBeenCalled();});
test('doble clic síncrono solo guarda una vez',async()=>{const p=deferred();api.updateAdminSucursal.mockReturnValue(p.promise);render(<StrictMode><Page/></StrictMode>);await edit();const button=within(screen.getByRole('dialog')).getByRole('button',{name:'Actualizar'});act(()=>{fireEvent.click(button);fireEvent.click(button);});expect(api.updateAdminSucursal).toHaveBeenCalledTimes(1);await act(async()=>p.resolve({data:{sucursal:branch()}}));});
test('error SQL de lista se muestra funcionalmente',async()=>{api.listAdminSucursales.mockRejectedValue({status:503,message:'SQL password=INTERNAL'});render(<Page/>);await screen.findByRole('button',{name:/Reintentar/});expect(screen.queryByText(/INTERNAL/)).not.toBeInTheDocument();});
test('401 y 403 vigentes al guardar conservan seguridad',async()=>{api.updateAdminSucursal.mockRejectedValue({status:403});render(<Page/>);await edit();await save();await act(async()=>{});expect(navigate).toHaveBeenCalledWith('/unauthorized');});
test('Admin no muestra acciones ni consulta empresas',async()=>{auth.roles=['admin'];render(<Page/>);await screen.findByText('Sucursal A');expect(screen.queryByRole('button',{name:'Editar'})).not.toBeInTheDocument();expect(api.listAdminEmpresas).not.toHaveBeenCalled();});
test('inactivación pendiente y desmontaje no notifica',async()=>{const p=deferred();api.inactivateAdminSucursal.mockReturnValue(p.promise);const v=render(<Page/>);const row=(await screen.findByText('Sucursal A')).closest('tr');fireEvent.click(within(row).getByRole('button',{name:'Inactivar'}));fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Inactivar'}));v.unmount();await act(async()=>p.resolve({data:{sucursal:{...branch(),estado:false}}}));expect(notices.warning).not.toHaveBeenCalled();});
