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
test('contraseñas finales alternan visibilidad de forma independiente sin perder valores ni enviar',()=>{
 mount(GuestRegistrationConfirmPage);
 const password=screen.getByLabelText('Contraseña final',{exact:true});const confirmation=screen.getByLabelText('Confirmar contraseña',{exact:true});
 fireEvent.change(password,{target:{value:'FinalOwner9!'}});fireEvent.change(confirmation,{target:{value:'FinalOwner9!'}});
 const showPassword=screen.getByRole('button',{name:'Mostrar contraseña final'});const showConfirmation=screen.getByRole('button',{name:'Mostrar confirmación de contraseña'});
 expect(password).toHaveAttribute('type','password');expect(confirmation).toHaveAttribute('type','password');
 fireEvent.click(showPassword);expect(password).toHaveAttribute('type','text');expect(confirmation).toHaveAttribute('type','password');
 fireEvent.pointerUp(showPassword);fireEvent.blur(showPassword);expect(password).toHaveAttribute('type','text');expect(password).toHaveValue('FinalOwner9!');
 fireEvent.click(showConfirmation);expect(confirmation).toHaveAttribute('type','text');expect(confirmation).toHaveValue('FinalOwner9!');
 fireEvent.click(screen.getByRole('button',{name:'Ocultar contraseña final'}));expect(password).toHaveAttribute('type','password');expect(confirmation).toHaveAttribute('type','text');
 expect(showPassword).toHaveAttribute('type','button');expect(showConfirmation).toHaveAttribute('type','button');expect(api.post).not.toHaveBeenCalled();
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
 fireEvent.click(screen.getByRole('button',{name:'Mostrar contraseña'}));fireEvent.click(screen.getByRole('button',{name:'Mostrar confirmación de contraseña'}));
 fireEvent.click(screen.getByLabelText('Acepto términos y condiciones para crear mi cuenta.'));fireEvent.click(screen.getByRole('button',{name:'Crear cuenta'}));
 expect(await screen.findByRole('status')).toHaveTextContent('Registro pendiente');expect(api.login).not.toHaveBeenCalled();
 expect(screen.getByLabelText('Contraseña',{exact:true})).toHaveValue('');expect(screen.getByLabelText('Contraseña',{exact:true})).toHaveAttribute('type','password');
 expect(screen.getByLabelText('Confirmar contraseña',{exact:true})).toHaveAttribute('type','password');expect(screen.getByRole('button',{name:'Mostrar contraseña'})).toHaveAttribute('aria-pressed','false');
 expect(screen.getByRole('button',{name:'Crear cuenta'})).toBeDisabled();
 expect(screen.getByRole('button',{name:'Reenviar en 60s'})).toBeDisabled();
 await waitFor(()=>expect(api.post).toHaveBeenCalledOnce());
});

test('confirmación conserva borrador y consentimientos al leer términos y privacidad', () => {
  mount(GuestRegistrationConfirmPage);
  for (const [label, value] of [['Nombre', 'New'], ['Apellido', 'Owner'], ['Contraseña final', 'FinalOwner9!'], ['Confirmar contraseña', 'FinalOwner9!']]) fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
  const terms = screen.getByRole('checkbox', { name: 'Acepto términos y condiciones para crear mi cuenta.' });
  const marketing = screen.getByRole('checkbox', { name: 'Acepto recibir comunicaciones comerciales.' });
  for (const [name, hash] of [['Términos y condiciones', 'terminos-y-condiciones'], ['Política de privacidad', 'politica-de-privacidad']]) {
    const link = screen.getByRole('link', { name, exact: true });
    expect(link).toHaveAttribute('href', `/terminos-y-condiciones#${hash}`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    fireEvent.click(link);
  }
  expect(terms).toBeRequired(); expect(terms).not.toBeChecked();
  expect(marketing).not.toBeRequired(); expect(marketing).not.toBeChecked();
  expect(screen.getByLabelText('Nombre', { exact: true })).toHaveValue('New');
  expect(screen.getByLabelText('Contraseña final', { exact: true })).toHaveValue('FinalOwner9!');
  fireEvent.submit(document.querySelector('form'));
  expect(screen.getByRole('alert')).toHaveTextContent('aceptación de términos');
  expect(api.post).not.toHaveBeenCalled();
});
