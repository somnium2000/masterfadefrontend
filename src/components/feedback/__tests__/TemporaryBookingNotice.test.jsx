// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import TemporaryBookingNotice from '../TemporaryBookingNotice.jsx';

const key='mf-agendamiento-aviso-2026-11-17';
const previousExpiry=new Date('2026-11-17T00:00:00-06:00').getTime();

beforeEach(()=>{
  sessionStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(previousExpiry-1000);
});

afterEach(()=>{
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('comunica la postergación sin fecha comprometida ni atribuir responsabilidades',()=>{
  render(<TemporaryBookingNotice/>);
  expect(screen.getByRole('status',{name:'Comunicado sobre el agendamiento en MasterFade'})).toBeVisible();
  expect(screen.getByText(/agendamiento de citas en línea se encuentra temporalmente postergada hasta nuevo aviso/)).toBeInTheDocument();
  expect(screen.getByText(/seguimos trabajando con prioridad en los ajustes y verificaciones necesarios/)).toBeInTheDocument();
  expect(screen.getByText(/Nuestro objetivo es poner este servicio a su disposición lo antes posible/)).toBeInTheDocument();
  expect(screen.getByText(/anunciaremos su habilitación a través de nuestros canales oficiales/)).toBeInTheDocument();
  expect(screen.queryByText(/La fecha anunciada anteriormente/)).toBeNull();
  expect(screen.queryByText(/sin establecer una nueva fecha/)).toBeNull();
  expect(screen.getByText('Equipo MasterFade')).toBeVisible();
  expect(screen.queryByText(/martes 17 de noviembre/i)).toBeNull();
  expect(screen.queryByText(/miércoles 18 de noviembre/i)).toBeNull();
  expect(screen.queryByText(/no es atribuible/i)).toBeNull();
  expect(screen.getByRole('button',{name:'Cerrar comunicado'})).toHaveClass('h-11','w-11');
});

test.each([0,1,86400000,365*86400000])('permanece visible %i ms después de la antigua caducidad',offset=>{
  vi.setSystemTime(previousExpiry+offset);
  render(<TemporaryBookingNotice/>);
  expect(screen.getByRole('status')).toBeVisible();
});

test('no crea un temporizador para ocultarse automáticamente',()=>{
  const view=render(<TemporaryBookingNotice/>);
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(365*86400000);
  expect(screen.getByRole('status')).toBeVisible();
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

test('X cierra el comunicado y conserva la decisión durante la sesión',()=>{
  const view=render(<TemporaryBookingNotice/>);
  fireEvent.click(screen.getByRole('button',{name:'Cerrar comunicado'}));
  expect(sessionStorage.getItem(key)).toBe('dismissed');
  view.unmount();
  render(<TemporaryBookingNotice/>);
  expect(screen.queryByRole('status')).toBeNull();
});

test('el comunicado reaparece en una sesión nueva',()=>{
  const view=render(<TemporaryBookingNotice/>);
  fireEvent.click(screen.getByRole('button',{name:'Cerrar comunicado'}));
  view.unmount();
  sessionStorage.clear();
  render(<TemporaryBookingNotice/>);
  expect(screen.getByRole('status')).toBeVisible();
});

test('sin sessionStorage permite cerrar y reaparece al remontar',()=>{
  vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('fixture');});
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('fixture');});
  const view=render(<TemporaryBookingNotice/>);
  fireEvent.click(screen.getByRole('button',{name:'Cerrar comunicado'}));
  expect(screen.queryByRole('status')).toBeNull();
  view.unmount();
  render(<TemporaryBookingNotice/>);
  expect(screen.getByRole('status')).toBeVisible();
});
