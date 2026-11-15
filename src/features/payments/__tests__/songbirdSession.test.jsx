// @vitest-environment jsdom
import {afterEach,expect,test,vi} from 'vitest';
import {createSongbirdSession,loadSongbirdSdk} from '../songbirdSession.js';

const handoff=()=>({protocol:'songbird-sandbox-v1',lease_id:'11111111-1111-4111-8111-111111111111',
  expires_at:new Date(Date.now()+60000).toISOString(),jwt:'synthetic.initial.signature',ephemeral_contract_verified:true,order_id:'MF-OFFLINE'});
const mounted=[];
afterEach(()=>{for(const session of mounted)session.stop();mounted.length=0;delete window.Cardinal;});
function cardinal(mode='success'){
  const handlers=new Map();const emit=(name,...args)=>handlers.get(name)?.(...args);
  const api={configure:vi.fn(),on:vi.fn((name,fn)=>handlers.set(name,fn)),off:vi.fn(name=>handlers.delete(name)),
    setup:vi.fn(()=>{if(mode!=='abandon')queueMicrotask(()=>emit('payments.setupComplete',{sessionId:'synthetic-reference'}));}),
    continue:vi.fn(()=>{queueMicrotask(()=>emit('payments.validated',mode==='noaction'?{ActionCode:'NOACTION'}:{ActionCode:'SUCCESS'},
      mode==='noaction'?undefined:'synthetic.validated.signature'));}),emit};
  return api;
}
const challenge={state:'challenge_ready',challenge:{acsUrl:'https://acs.offline.invalid/challenge',payload:'synthetic-challenge',
  authenticationId:'synthetic-auth',transactionId:'synthetic-tx'}};
test('native SDK manager walks setup/challenge/validated through a closed bridge and never executes a Sale',async()=>{
  const api=cardinal();const transport=vi.fn(action=>Promise.resolve(action==='setup'?challenge:{state:'authentication_complete',financial_finalization_enabled:false}));
  const load=vi.fn(async()=>api);const views=[];
  const token=handoff();const session=await createSongbirdSession({handoff:token,transport,onState:r=>views.push(r),loadCardinal:load});mounted.push(session);
  expect(await session.run).toEqual({state:'financial_finalization_blocked'});
  expect(transport.mock.calls.map(call=>call[0])).toEqual(['setup','validated']);
  expect(api.configure.mock.calls[0][0].logging.level).toBe('off');
  expect(api.continue.mock.calls[0][0]).toBe('cca');
  expect(views.some(r=>r.state==='financial_finalization_blocked')).toBe(true);
  expect(token).not.toHaveProperty('jwt');
  expect(JSON.stringify({...localStorage,...sessionStorage})).not.toContain('synthetic.initial.signature');
});
test('missing/expired/unaccredited handoff loads neither SDK nor external script',async()=>{
  for(const patch of [{ephemeral_contract_verified:false},{expires_at:'2000-01-01T00:00:00Z'},
    {protocol:'live'},{jwt:'not-a-token'},{lease_id:'wrong'}]){
    const load=vi.fn();await expect(createSongbirdSession({handoff:{...handoff(),...patch},transport:vi.fn(),loadCardinal:load,loadSdk:load})).rejects.toThrow();
    expect(load).not.toHaveBeenCalled();
  }
});
test('two simultaneous sessions cannot initialize Cardinal twice; abort settles the lost challenge',async()=>{
  const api=cardinal('abandon');const controller=new AbortController();
  const session=await createSongbirdSession({handoff:handoff(),transport:vi.fn(),signal:controller.signal,loadCardinal:async()=>api});mounted.push(session);
  const otherLoad=vi.fn();await expect(createSongbirdSession({handoff:handoff(),transport:vi.fn(),loadCardinal:otherLoad})).rejects.toThrow('SONGBIRD_BROWSER_BUSY');
  expect(otherLoad).not.toHaveBeenCalled();controller.abort();expect(await session.run).toEqual({state:'interrupted'});
  expect(api.off).toHaveBeenCalledWith('payments.setupComplete');
});
test('NOACTION never turns into a new financial transport or a paid booking',async()=>{
  const api=cardinal('noaction');const transport=vi.fn().mockResolvedValue(challenge);
  const session=await createSongbirdSession({handoff:handoff(),transport,loadCardinal:async()=>api});mounted.push(session);
  expect(await session.run).toEqual({state:'financial_finalization_blocked'});
  expect(transport.mock.calls.map(call=>call[0])).toEqual(['setup']);
});
test('duplicate setup and validation events cannot repeat an authentication operation',async()=>{
  const api=cardinal();const transport=vi.fn(action=>Promise.resolve(action==='setup'?challenge:{state:'authentication_complete'}));
  const session=await createSongbirdSession({handoff:handoff(),transport,loadCardinal:async()=>api});mounted.push(session);
  api.emit('payments.setupComplete',{sessionId:'synthetic-reference'});
  await session.run;expect(transport.mock.calls.map(c=>c[0])).toEqual(['setup','validated']);
});
test('actual SDK is version-pinned and bridge creates no credentialed Transaction service',async()=>{
  const {sdk,Manager}=await loadSongbirdSdk();expect(typeof Manager).toBe('function');
  const settings=new sdk.Models.Settings();expect(settings.auth_hash).toBeUndefined();expect(settings.auth_key).toBeUndefined();
});

test('closing the native Cardinal challenge stops the session without continuation or financial transport',async()=>{
  const api=cardinal('abandon');const transport=vi.fn();
  const session=await createSongbirdSession({handoff:handoff(),transport,loadCardinal:async()=>api});mounted.push(session);
  api.emit('ui.close');expect(await session.run).toEqual({state:'interrupted'});
  api.emit('payments.setupComplete',{sessionId:'late'});expect(transport).not.toHaveBeenCalled();
  expect(window.Cardinal).toBeUndefined();
});

test('expiry bounds script loading too and cannot leave a browser claim silently retryable',async()=>{
  vi.useFakeTimers();
  try{
    const token=handoff();token.expires_at=new Date(Date.now()+1000).toISOString();
    const pending=createSongbirdSession({handoff:token,transport:vi.fn(),loadCardinal:signal=>new Promise((_resolve,reject)=>{
      signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
    })});
    const caught=pending.catch(e=>e);
    await vi.advanceTimersByTimeAsync(1001);expect((await caught).message).toBe('SONGBIRD_SESSION_UNAVAILABLE');
    expect(token).not.toHaveProperty('jwt');
  }finally{vi.useRealTimers();}
});

test('late lookup from an abandoned session cannot clear the new session Cardinal handlers',async()=>{
  let finish;
  const oldApi=cardinal('abandon');const oldTransport=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));
  const oldSession=await createSongbirdSession({handoff:handoff(),transport:oldTransport,loadCardinal:async()=>oldApi});mounted.push(oldSession);
  oldApi.emit('payments.setupComplete',{sessionId:'old-reference'});
  await Promise.resolve();oldSession.stop();await oldSession.run;
  const newApi=cardinal('abandon');
  const newSession=await createSongbirdSession({handoff:handoff(),transport:vi.fn(),loadCardinal:async()=>newApi});mounted.push(newSession);
  const offBefore=newApi.off.mock.calls.length;
  finish({state:'contract_blocked'});await Promise.resolve();await Promise.resolve();await Promise.resolve();
  expect(newApi.off).toHaveBeenCalledTimes(offBefore);newSession.stop();await newSession.run;
});
