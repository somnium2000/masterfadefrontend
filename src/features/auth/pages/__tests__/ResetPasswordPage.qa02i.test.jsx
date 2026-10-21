// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ResetPasswordPage from '../ResetPasswordPage.jsx';
import { ThemeProvider } from '../../../../context/ThemeContext.jsx';
const api=vi.hoisted(()=>({getSession:vi.fn().mockResolvedValue({data:{session:{user:{id:'ordinary'}}}}),post:vi.fn(),logout:vi.fn(),success:vi.fn()}));
vi.mock('../../../../config/supabaseClient.js',()=>({supabase:{auth:api}}));
vi.mock('../../../../context/NotificationsContext.jsx',()=>({useNotifications:()=>api}));
vi.mock('../../../../context/AuthContext.jsx',()=>({useAuth:()=>api}));
vi.mock('../../../../services/httpClient.js',()=>({http:api}));
afterEach(cleanup);
test('una sesión ordinaria no habilita cambio sin prueba de recuperación',async()=>{
 render(<ThemeProvider><MemoryRouter initialEntries={['/reset-password']}><ResetPasswordPage/></MemoryRouter></ThemeProvider>);
 await waitFor(()=>expect(screen.getByRole('alert')).toBeInTheDocument());
 expect(screen.queryByLabelText('Nueva contraseña')).not.toBeInTheDocument();expect(api.post).not.toHaveBeenCalled();
});
