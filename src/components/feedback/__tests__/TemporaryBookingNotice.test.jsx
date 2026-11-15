// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import TemporaryBookingNotice from '../TemporaryBookingNotice.jsx';
const expiry=new Date('2026-11-17T00:00:00-06:00').getTime();
const key='mf-agendamiento-aviso-2026-11-17';
beforeEach(()=>{sessionStorage.clear();vi.useFakeTimers();vi.setSystemTime(expiry-1000);});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
test('muestra el comunicado sin alterar su contenido ni controles',()=>{
 render(<TemporaryBookingNotice/>);
 expect(screen.getByRole('status',{name:'Comunicado temporal sobre el agendamiento en MasterFade'})).toBeVisible();
 expect(screen.getByText(/no es atribuible a MasterFade/)).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Cerrar comunicado'})).toHaveClass('h-11','w-11');
});
test.each([0,1,86400000])('no aparece al montar %i ms después de medianoche Honduras',offset=>{
 vi.setSystemTime(expiry+offset);render(<TemporaryBookingNotice/>);expect(screen.queryByRole('status')).toBeNull();
});
test('desaparece automáticamente exactamente al vencer, con montaje anterior',()=>{
 render(<TemporaryBookingNotice/>);act(()=>vi.advanceTimersByTime(999));expect(screen.getByRole('status')).toBeVisible();
 act(()=>vi.advanceTimersByTime(1));expect(screen.queryByRole('status')).toBeNull();
});
test('X cierra y conserva la decisión al remontar durante la sesión',()=>{
 const view=render(<TemporaryBookingNotice/>);fireEvent.click(screen.getByRole('button',{name:'Cerrar comunicado'}));
 expect(sessionStorage.getItem(key)).toBe('dismissed');view.unmount();render(<TemporaryBookingNotice/>);expect(screen.queryByRole('status')).toBeNull();
});
test('sin sessionStorage permite cerrar y respeta el vencimiento',()=>{
 vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('fixture');});
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('fixture');});
 const view=render(<TemporaryBookingNotice/>);fireEvent.click(screen.getByRole('button',{name:'Cerrar comunicado'}));expect(screen.queryByRole('status')).toBeNull();
 view.unmount();render(<TemporaryBookingNotice/>);act(()=>vi.advanceTimersByTime(1000));expect(screen.queryByRole('status')).toBeNull();
});
test('libera el temporizador al desmontar',()=>{
 const view=render(<TemporaryBookingNotice/>);expect(vi.getTimerCount()).toBeGreaterThan(0);view.unmount();expect(vi.getTimerCount()).toBe(0);
});
