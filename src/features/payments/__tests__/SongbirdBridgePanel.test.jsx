// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import SongbirdBridgePanel from '../SongbirdBridgePanel.jsx';
import {requestSongbirdBridge} from '../../public/booking/publicBookingApi.js';
import {createSongbirdSession,loadSongbirdSdk} from '../songbirdSession.js';
vi.mock('../../public/booking/publicBookingApi.js',()=>({requestSongbirdBridge:vi.fn()}));
vi.mock('../songbirdSession.js',()=>({createSongbirdSession:vi.fn(),loadSongbirdSdk:vi.fn()}));
const props={enabled:true,groupId:'group',intentId:'intent',email:'synthetic@example.test',identity:'owner'};
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();sessionStorage.clear();});
afterEach(()=>{cleanup();delete window.Models;delete window.Requests;delete window.Responses;});
test.each([false,undefined,null,'true'])('without an explicit capability %s there are no requests or scripts',enabled=>{
  render(<SongbirdBridgePanel {...props} enabled={enabled}/>);expect(requestSongbirdBridge).not.toHaveBeenCalled();expect(createSongbirdSession).not.toHaveBeenCalled();
});
test('production contract blocked state never loads SDK, Cardinal or calls claim',async()=>{
  requestSongbirdBridge.mockResolvedValue({state:'contract_blocked',can_start:false});render(<SongbirdBridgePanel {...props}/>);
  await screen.findByText(/requiere un contrato de PixelPay/);expect(screen.queryByRole('button')).toBeNull();
  expect(requestSongbirdBridge.mock.calls.map(c=>c[0].action)).toEqual(['status']);expect(createSongbirdSession).not.toHaveBeenCalled();
});
test('claim is one shot under double click and no opaque value enters storage',async()=>{
  let finish;requestSongbirdBridge.mockImplementation(body=>body.action==='status'?Promise.resolve({state:'handoff_ready',can_start:true}):new Promise(resolve=>{finish=resolve;}));
  render(<SongbirdBridgePanel {...props}/>);const button=await screen.findByRole('button',{name:'Iniciar autenticación 3DS'});
  fireEvent.click(button);fireEvent.click(button);expect(requestSongbirdBridge.mock.calls.filter(c=>c[0].action==='claim')).toHaveLength(1);
  await act(async()=>finish({state:'contract_blocked',can_start:false}));
  expect(createSongbirdSession).not.toHaveBeenCalled();expect(JSON.stringify({...sessionStorage,...localStorage})).toBe('{}');
});
test('reload/in-flight lease recovers metadata only, without automatically claiming or reissuing a Sale',async()=>{
  requestSongbirdBridge.mockResolvedValue({state:'browser_leased',can_start:false,can_resume:false});
  const view=render(<SongbirdBridgePanel {...props}/>);await screen.findByText(/La autenticación ya se inició en un navegador/);view.unmount();
  render(<SongbirdBridgePanel {...props}/>);await waitFor(()=>expect(requestSongbirdBridge).toHaveBeenCalledTimes(2));
  expect(requestSongbirdBridge.mock.calls.every(c=>c[0].action==='status')).toBe(true);expect(createSongbirdSession).not.toHaveBeenCalled();
});
test('changing account/context while claim is pending aborts and ignores the old handoff',async()=>{
  let finish;requestSongbirdBridge.mockImplementation(body=>body.action==='claim'?new Promise(resolve=>{finish=resolve;}):Promise.resolve({state:'handoff_ready',can_start:true}));
  const view=render(<SongbirdBridgePanel {...props}/>);fireEvent.click(await screen.findByRole('button'));
  const oldSignal=requestSongbirdBridge.mock.calls.find(c=>c[0].action==='claim')[1].signal;
  view.rerender(<SongbirdBridgePanel {...props} identity="other" intentId="other"/>);expect(oldSignal.aborted).toBe(true);
  await act(async()=>finish({handoff:{jwt:'SENSITIVE_CANARY'},state:'browser_leased'}));expect(createSongbirdSession).not.toHaveBeenCalled();
  expect(screen.queryByText('SENSITIVE_CANARY')).toBeNull();
});
test('expired hold cannot start; backend authentication-complete never claims a paid appointment',async()=>{
  requestSongbirdBridge.mockResolvedValue({state:'handoff_ready',can_start:true});const view=render(<SongbirdBridgePanel {...props} allowStart={false}/>);
  const button=await screen.findByRole('button');expect(button.disabled).toBe(true);fireEvent.click(button);
  expect(requestSongbirdBridge.mock.calls.filter(c=>c[0].action==='claim')).toHaveLength(0);
  view.unmount();requestSongbirdBridge.mockResolvedValue({state:'authentication_complete',can_start:false});render(<SongbirdBridgePanel {...props}/>);
  await screen.findByText(/La autenticación no confirma el pago/);
});

test('reload before upstream completion can explicitly recover metadata without automatically claiming a lease',async()=>{
  requestSongbirdBridge.mockResolvedValueOnce({state:'awaiting_response',can_start:false})
    .mockResolvedValueOnce({state:'handoff_ready',can_start:true});
  render(<SongbirdBridgePanel {...props}/>);
  fireEvent.click(await screen.findByRole('button',{name:'Actualizar estado 3DS'}));
  await screen.findByRole('button',{name:'Iniciar autenticación 3DS'});
  expect(requestSongbirdBridge.mock.calls.map(c=>c[0].action)).toEqual(['status','status']);
  expect(createSongbirdSession).not.toHaveBeenCalled();
});

test.each([
  [{state:'handoff_ready'},/La autenticación está preparada/],
  [{state:'browser_leased'},/La autenticación ya se inició en un navegador/],
  [{state:'expired'},/Este intento no se puede reabrir/],
  [{state:'authentication_failed'},/La autenticación no fue aprobada/],
  [{state:'challenge_ready'},/Completa el desafío de tu banco/],
  [{state:'contract_blocked',block_code:'PIXELPAY_SONGBIRD_AUTH_RESULT_UNACCREDITED'},/respuesta de autenticación requiere verificación de PixelPay/],
])('real bridge state %j remains distinct from a paid booking',async(response,message)=>{
  requestSongbirdBridge.mockResolvedValue({...response,can_start:false,financial_finalization_enabled:false});
  render(<SongbirdBridgePanel {...props}/>);await screen.findByText(message);
  expect(screen.queryByRole('button',{name:'Iniciar autenticación 3DS'})).toBeNull();
  expect(createSongbirdSession).not.toHaveBeenCalled();
});

test('ready CTA is primary; local expiry removes it without claiming or loading Cardinal',async()=>{
  vi.useFakeTimers();
  try{
    requestSongbirdBridge.mockResolvedValue({state:'handoff_ready',can_start:true,expires_at:new Date(Date.now()+1000).toISOString()});
    await act(async()=>{render(<SongbirdBridgePanel {...props}/>);});
    const button=screen.getByRole('button',{name:'Iniciar autenticación 3DS'});
    expect(button.className).toContain('mf-accent-gradient');expect(button.disabled).toBe(false);
    await act(async()=>{await vi.advanceTimersByTimeAsync(1001);});
    expect(screen.getByText('Sesión 3DS vencida')).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Iniciar autenticación 3DS'})).toBeNull();
    expect(requestSongbirdBridge.mock.calls.map(c=>c[0].action)).toEqual(['status']);
    expect(createSongbirdSession).not.toHaveBeenCalled();
  }finally{vi.useRealTimers();}
});

test('one CTA click uses SDK browser globals and starts native Cardinal setup once',async()=>{
  const native=await vi.importActual('../songbirdSession.js');
  const loaded=await native.loadSongbirdSdk();
  Object.assign(window,{Models:loaded.sdk.Models,Requests:loaded.sdk.Requests,Responses:loaded.sdk.Responses});
  loadSongbirdSdk.mockResolvedValue({...loaded,sdk:{}});
  const handlers=new Map();
  const cardinal={configure:vi.fn(),on:vi.fn((name,handler)=>handlers.set(name,handler)),off:vi.fn(name=>handlers.delete(name)),
    setup:vi.fn(()=>queueMicrotask(()=>handlers.get('payments.setupComplete')?.({sessionId:'synthetic-reference'}))),continue:vi.fn()};
  const handoff={protocol:'songbird-sandbox-v1',lease_id:'11111111-1111-4111-8111-111111111111',
    expires_at:new Date(Date.now()+60000).toISOString(),jwt:'synthetic.initial.signature',ephemeral_contract_verified:true,order_id:'MF-OFFLINE'};
  requestSongbirdBridge.mockImplementation(body=>Promise.resolve(body.action==='status'?{state:'handoff_ready',can_start:true}
    :body.action==='claim'?{state:'browser_leased',handoff}
    :body.action==='setup'?{state:'challenge_ready',challenge:{acsUrl:'https://centinelapistag.cardinalcommerce.com/challenge',
      payload:'synthetic-challenge',authenticationId:'synthetic-auth',transactionId:'synthetic-tx'}}:{state:'authentication_failed'}));
  createSongbirdSession.mockImplementation(options=>native.createSongbirdSession({...options,loadCardinal:async()=>cardinal}));
  render(<SongbirdBridgePanel {...props}/>);
  const button=await screen.findByRole('button',{name:'Iniciar autenticación 3DS'});
  fireEvent.click(button);fireEvent.click(button);
  await waitFor(()=>expect(cardinal.continue).toHaveBeenCalledOnce());
  expect(createSongbirdSession).toHaveBeenCalledOnce();
  expect(cardinal.setup).toHaveBeenCalledExactlyOnceWith('init',{jwt:'synthetic.initial.signature'});
  expect(requestSongbirdBridge.mock.calls.map(c=>c[0].action)).toEqual(['status','claim','setup']);
  expect(screen.getByText(/Completa el desafío de tu banco/)).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Iniciar autenticación 3DS'})).toBeNull();
  expect(handoff).not.toHaveProperty('jwt');
  await act(async()=>{handlers.get('payments.validated')?.({ActionCode:'ERROR'});});
  await screen.findByText(/La autenticación no fue aprobada/);
});

test('active browser lease reports a local interrupt outside its aborted request epoch',async()=>{
  let resolveRun;let options;
  requestSongbirdBridge.mockImplementation(body=>Promise.resolve(body.action==='status'
    ?{state:'handoff_ready',can_start:true}:body.action==='claim'?{state:'browser_leased',handoff:{jwt:'opaque'}}:{}));
  const stop=vi.fn();createSongbirdSession.mockImplementation(async input=>{
    options=input;return{stop,run:new Promise(resolve=>{resolveRun=resolve;})};
  });
  const view=render(<SongbirdBridgePanel {...props}/>);fireEvent.click(await screen.findByRole('button'));
  await waitFor(()=>expect(createSongbirdSession).toHaveBeenCalledOnce());view.unmount();
  expect(options.signal.aborted).toBe(true);await options.onInterrupt({lease_id:'lease'});
  const call=requestSongbirdBridge.mock.calls.find(c=>c[0].action==='interrupt');
  expect(call[0].lease_id).toBe('lease');expect(call[1].signal).toBeUndefined();
  await act(async()=>resolveRun({state:'interrupted'}));
});

test('eligibility revalidation prevents a new claim but preserves an active lease; revocation still aborts',async()=>{
  let resolveRun;let options;const stop=vi.fn();
  requestSongbirdBridge.mockImplementation(body=>Promise.resolve(body.action==='status'?{state:'handoff_ready',can_start:true}:{state:'browser_leased',handoff:{jwt:'opaque'}}));
  createSongbirdSession.mockImplementation(async input=>{options=input;return{stop,run:new Promise(resolve=>{resolveRun=resolve;})};});
  const view=render(<SongbirdBridgePanel {...props} eligibilityChecking/>);
  const button=await screen.findByRole('button',{name:'Iniciar autenticación 3DS'});
  expect(button.disabled).toBe(true);fireEvent.click(button);expect(createSongbirdSession).not.toHaveBeenCalled();
  view.rerender(<SongbirdBridgePanel {...props} eligibilityChecking={false}/>);
  fireEvent.click(button);await waitFor(()=>expect(createSongbirdSession).toHaveBeenCalledOnce());
  view.rerender(<SongbirdBridgePanel {...props} eligibilityChecking/>);
  expect(options.signal.aborted).toBe(false);expect(stop).not.toHaveBeenCalled();
  view.rerender(<SongbirdBridgePanel {...props}/>);
  expect(options.signal.aborted).toBe(false);
  view.rerender(<SongbirdBridgePanel {...props} enabled={false}/>);
  expect(options.signal.aborted).toBe(true);expect(options.signal.reason).toBe('PANEL_CLEANUP');
  await act(async()=>resolveRun({state:'interrupted'}));
  expect(requestSongbirdBridge.mock.calls.filter(c=>c[0].action==='claim')).toHaveLength(1);
});
