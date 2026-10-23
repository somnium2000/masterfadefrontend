// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../../../../context/ThemeContext.jsx';
import RegisterPage from '../RegisterPage.jsx';
import GuestRegistrationConfirmPage from '../GuestRegistrationConfirmPage.jsx';
const api=vi.hoisted(()=>({post:vi.fn(),login:vi.fn(),success:vi.fn(),info:vi.fn()}));
vi.mock('../../../../services/httpClient.js',()=>({http:api}));
vi.mock('../../../../context/AuthContext.jsx',()=>({useAuth:()=>({login:api.login})}));
vi.mock('../../../../context/NotificationsContext.jsx',()=>({useNotifications:()=>api}));
beforeEach(()=>{vi.clearAllMocks();api.post.mockResolvedValue({ok:true,data:{registered:true}});window.history.replaceState(null,'','/register/confirm#operation=11111111-1111-4111-8111-111111111111&token='+'a'.repeat(64));});
afterEach(()=>{cleanup();window.history.replaceState(null,'','/');});
function mount(Component){return render(<ThemeProvider><MemoryRouter><Component/></MemoryRouter></ThemeProvider>);}
function complete(){for(const [label,value]of [['Nombre','New'],['Apellido','Owner'],['Contraseña final','FinalOwner9!'],['Confirmar contraseña','FinalOwner9!']])fireEvent.change(screen.getByLabelText(label,{exact:true}),{target:{value}});fireEvent.click(screen.getByLabelText('Acepto términos y condiciones para crear mi cuenta.'));}
test('abrir enlace no llama a API; confirmación inválida no habilita formulario',()=>{
 window.history.replaceState(null,'','/register/confirm#token=bad');mount(GuestRegistrationConfirmPage);
 expect(screen.getByRole('alert')).toHaveTextContent('no es válido');expect(api.post).not.toHaveBeenCalled();
});
test.each([false,true])('confirmación final con marketing=%s, sin sesión automática ni token residual en URL',async marketing=>{
 mount(GuestRegistrationConfirmPage);expect(api.post).not.toHaveBeenCalled();complete();
 if(marketing)fireEvent.click(screen.getByLabelText('Acepto recibir comunicaciones comerciales.'));
 fireEvent.click(screen.getByRole('button',{name:'Completar registro'}));
 expect(await screen.findByRole('status')).toHaveTextContent('Registro completado');
 expect(api.post).toHaveBeenCalledWith('/v1/auth/register/confirm',expect.objectContaining({contrasena:'FinalOwner9!',acepta_terminos:true,consentimiento_marketing:marketing}),expect.objectContaining({sensitiveBody:true,skipAuthInvalidation:true}));
 expect(window.location.hash).toBe('');expect(api.login).not.toHaveBeenCalled();
});
test.each([401,410,503])('error %s seguro, sin mensaje técnico ni toast y con reintento',async status=>{
 api.post.mockRejectedValue({status,message:'SQLSTATE secret.internal'});mount(GuestRegistrationConfirmPage);complete();
 fireEvent.click(screen.getByRole('button',{name:'Completar registro'}));expect(await screen.findByRole('alert')).not.toHaveTextContent('SQLSTATE');
 expect(screen.getByRole('button',{name:'Completar registro'})).toBeEnabled();
});
test('no permite doble envío y descarta respuesta tras desmontar',async()=>{
 let resolve;api.post.mockReturnValue(new Promise(r=>{resolve=r;}));const view=mount(GuestRegistrationConfirmPage);complete();
 const button=screen.getByRole('button',{name:'Completar registro'});fireEvent.click(button);fireEvent.click(button);expect(api.post).toHaveBeenCalledOnce();
 const signal=api.post.mock.calls[0][2].signal;view.unmount();expect(signal.aborted).toBe(true);resolve({ok:true});await Promise.resolve();
 expect(window.location.hash).not.toBe('');
});
test('histórico 202 limpia contraseña inicial, muestra pendiente y no hace login',async()=>{
 api.post.mockResolvedValue({ok:true,data:{pending_verification:true}});mount(RegisterPage);
 for(const [name,value]of [['Nombre','New'],['Apellido','Owner'],['Correo (sera tu usuario/login)','guest@example.test'],['Contraseña','InitialOnly9!'],['Confirmar contraseña','InitialOnly9!']])fireEvent.change(screen.getByLabelText(name,{exact:true}),{target:{value}});
 fireEvent.click(screen.getByLabelText('Acepto terminos y condiciones para crear mi cuenta.'));fireEvent.click(screen.getByRole('button',{name:'Crear cuenta'}));
 expect(await screen.findByRole('status')).toHaveTextContent('Registro pendiente');expect(api.login).not.toHaveBeenCalled();
 expect(screen.getByLabelText('Contraseña',{exact:true})).toHaveValue('');expect(screen.getByRole('button',{name:'Crear cuenta'})).toBeDisabled();
 expect(screen.getByRole('button',{name:'Reenviar en 60s'})).toBeDisabled();
 await waitFor(()=>expect(api.post).toHaveBeenCalledOnce());
});
