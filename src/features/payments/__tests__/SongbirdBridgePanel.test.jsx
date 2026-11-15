// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import SongbirdBridgePanel from '../SongbirdBridgePanel.jsx';
import {requestSongbirdBridge} from '../../public/booking/publicBookingApi.js';
import {createSongbirdSession} from '../songbirdSession.js';
vi.mock('../../public/booking/publicBookingApi.js',()=>({requestSongbirdBridge:vi.fn()}));
vi.mock('../songbirdSession.js',()=>({createSongbirdSession:vi.fn()}));
const props={enabled:true,groupId:'group',intentId:'intent',email:'synthetic@example.test',identity:'owner'};
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();sessionStorage.clear();});
afterEach(cleanup);
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
  const view=render(<SongbirdBridgePanel {...props}/>);await screen.findByText(/No inicies otro pago/);view.unmount();
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
