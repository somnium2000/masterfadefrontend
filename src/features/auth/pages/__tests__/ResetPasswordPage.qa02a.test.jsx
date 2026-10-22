// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ResetPasswordPage from '../ResetPasswordPage.jsx';
import { ThemeProvider } from '../../../../context/ThemeContext.jsx';

const api = vi.hoisted(() => ({ post: vi.fn(), logout: vi.fn(), warning: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock('../../../../services/httpClient.js', () => ({ http: api }));
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => api }));
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => api }));
const proof='/reset-password#type=recovery&token_hash='+'a'.repeat(64);
beforeEach(() => {
 vi.clearAllMocks();api.post.mockResolvedValue({ok:true,data:{password_updated:true,login_required:true}});api.logout.mockResolvedValue({ok:true});
});
afterEach(cleanup);
async function mount(path = proof) {
 const mounted=render(<ThemeProvider><MemoryRouter initialEntries={[path]} future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Routes>
 <Route path="/reset-password" element={<ResetPasswordPage/>}/><Route path="/login" element={<p>Login final</p>}/>
 </Routes></MemoryRouter></ThemeProvider>);
 if(path===proof)await screen.findByLabelText('Nueva contraseña');
 return mounted;
}
function fill(password='SyntheticOnly9!',confirm=password){
 fireEvent.change(screen.getByLabelText('Nueva contraseña'),{target:{value:password}});
 fireEvent.change(screen.getByLabelText('Confirmar contraseña'),{target:{value:confirm}});
}
test('prueba de recuperación monta formulario y conserva política/confirmación',async()=>{
 await mount();fill('short');fireEvent.click(screen.getByRole('button',{name:'Actualizar contraseña'}));
 expect(screen.getByRole('alert')).toHaveTextContent('al menos 8 caracteres');expect(api.post).not.toHaveBeenCalled();
 fill('SyntheticOnly9!','OtherOnly9!');fireEvent.click(screen.getByRole('button',{name:'Actualizar contraseña'}));
 expect(screen.getByRole('alert')).toHaveTextContent('no coinciden');expect(api.post).not.toHaveBeenCalled();expect(api.warning).not.toHaveBeenCalled();expect(api.error).not.toHaveBeenCalled();
});
test.each(['Enter',' '])('ambos controles Reset revelan con %s y se ocultan al soltar, blur o cancelar',async key=>{
 await mount();const inputs=[screen.getByLabelText('Nueva contraseña'),screen.getByLabelText('Confirmar contraseña')];
 screen.getAllByRole('button',{name:'Mantén presionado para ver la contraseña'}).forEach((b,i)=>{
 fireEvent.keyDown(b,{key});expect(inputs[i]).toHaveAttribute('type','text');fireEvent.keyUp(b,{key});expect(inputs[i]).toHaveAttribute('type','password');
 fireEvent.keyDown(b,{key});fireEvent.blur(b);expect(inputs[i]).toHaveAttribute('type','password');
 fireEvent.pointerDown(b);expect(inputs[i]).toHaveAttribute('type','text');fireEvent.pointerCancel(b);expect(inputs[i]).toHaveAttribute('type','password');
 });expect(api.post).not.toHaveBeenCalled();
});
test.each([false,true])('error técnico de actualización (rechazo=%s) es seguro y libera formulario',async rejected=>{
 const error={status:503,message:'SQLSTATE secret_token host.internal stack trace'};
 api.post.mockImplementation(async()=>{if(rejected)throw error;return Promise.reject(error);});
 await mount();fill();fireEvent.click(screen.getByRole('button',{name:'Actualizar contraseña'}));
 await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('No se pudo actualizar'));
 expect(screen.queryByText(/SQLSTATE|host.internal/)).not.toBeInTheDocument();expect(api.error).not.toHaveBeenCalled();expect(api.logout).not.toHaveBeenCalled();
 expect(screen.getByRole('button',{name:'Actualizar contraseña'})).toBeEnabled();
});
test('éxito: POST sensible al servidor, logout confirmado y Login',async()=>{
 await mount();fill();fireEvent.click(screen.getByRole('button',{name:'Actualizar contraseña'}));await screen.findByText('Login final');
 expect(api.post).toHaveBeenCalledOnce();expect(api.logout).toHaveBeenCalledOnce();
 expect(api.post.mock.calls[0][0]).toBe('/v1/auth/reset-password');expect(api.post.mock.calls[0][2]).toMatchObject({sensitiveBody:true,skipCsrf:true});
});
test.each(['otp_expired','unknown'])('hash malicioso usa mensaje público para %s',async code=>{
 await mount('/reset-password#error=access_denied&error_code='+code+'&error_description=SQLSTATE_secret_token');await screen.findByRole('alert');
 expect(screen.getByRole('alert')).toHaveTextContent(code==='otp_expired'?'expiró':'no es válido');expect(screen.queryByText(/SQLSTATE/)).not.toBeInTheDocument();expect(api.post).not.toHaveBeenCalled();
});
test('sin prueba no monta campos aunque exista una sesión ajena',async()=>{
 await mount('/reset-password');await screen.findByRole('alert');expect(screen.queryByLabelText('Nueva contraseña')).not.toBeInTheDocument();expect(api.post).not.toHaveBeenCalled();
});
test('token malformado no hace peticiones',async()=>{
 await mount('/reset-password#type=recovery&token_hash=bad');await screen.findByRole('alert');expect(api.post).not.toHaveBeenCalled();
});
test('enlace expirado del servidor es seguro',async()=>{
 api.post.mockRejectedValue({status:401,data:{error:{code:'OTP_EXPIRED',message:'private diagnostic'}}});await mount();fill();
 fireEvent.click(screen.getByRole('button',{name:'Actualizar contraseña'}));await screen.findByRole('alert');expect(screen.getByRole('alert')).toHaveTextContent('expiró');expect(api.logout).not.toHaveBeenCalled();
});
test('doble submit y desmontaje: petición única y abortada, sin logout/navegación tardía',async()=>{
 let resolve;api.post.mockReturnValue(new Promise(r=>resolve=r));const m=await mount();fill();
 fireEvent.submit(screen.getByRole('button',{name:'Actualizar contraseña'}).closest('form'));fireEvent.submit(screen.getByRole('button',{name:'Guardando...'}).closest('form'));
 expect(api.post).toHaveBeenCalledOnce();const signal=api.post.mock.calls[0][2].signal;m.unmount();expect(signal.aborted).toBe(true);
 await act(async()=>resolve({ok:true}));expect(api.logout).not.toHaveBeenCalled();
});
test('logout no confirmado permite reintentar sólo cierre, sin reutilizar la prueba',async()=>{
 api.logout.mockResolvedValueOnce({ok:false}).mockResolvedValueOnce({ok:true});await mount();fill();
 fireEvent.click(screen.getByRole('button',{name:'Actualizar contraseña'}));await screen.findByRole('alert');expect(screen.queryByText('Login final')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Finalizar cierre de sesión'}));await screen.findByText('Login final');expect(api.post).toHaveBeenCalledOnce();expect(api.logout).toHaveBeenCalledTimes(2);
});
