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
const challenge={state:'challenge_ready',challenge:{acsUrl:'https://centinelapistag.cardinalcommerce.com/synthetic-challenge',payload:'synthetic-challenge',
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

test('native inline handler mounts the bank iframe in the browser without another Sale',async()=>{
  const api=cardinal('abandon');const transport=vi.fn().mockResolvedValue(challenge);
  api.continue.mockImplementation(()=>{});
  const session=await createSongbirdSession({handoff:handoff(),transport,loadCardinal:async()=>api});mounted.push(session);
  api.emit('payments.setupComplete',{sessionId:'synthetic-reference'});
  await vi.waitFor(()=>expect(api.continue).toHaveBeenCalledOnce());
  expect(api.continue.mock.calls[0][2].OrderDetails.OrderNumber).toBe('MF-OFFLINE');
  const resolve=vi.fn();const reject=vi.fn();
  api.emit('ui.inline.setup','<iframe title="Banco de prueba" class="pixelpay-modal-iframe"></iframe>',
    {paymentType:'CCA',data:{mode:'static',challengeWindowSizeId:'02'}},resolve,reject);
  const frame=document.querySelector('.pixelpay-modal-container iframe');
  expect(reject.mock.calls).toEqual([]);expect(resolve).toHaveBeenCalledOnce();expect(frame?.title).toBe('Banco de prueba');
  expect(transport.mock.calls.map(c=>c[0])).toEqual(['setup']);
  session.stop();await session.run;
});
test('two simultaneous sessions cannot initialize Cardinal twice; abort settles the lost challenge',async()=>{
  const api=cardinal('abandon');const controller=new AbortController();
  const session=await createSongbirdSession({handoff:handoff(),transport:vi.fn(),signal:controller.signal,loadCardinal:async()=>api});mounted.push(session);
  const otherLoad=vi.fn();await expect(createSongbirdSession({handoff:handoff(),transport:vi.fn(),loadCardinal:otherLoad})).rejects.toThrow('SONGBIRD_BROWSER_BUSY');
  expect(otherLoad).not.toHaveBeenCalled();controller.abort();expect(await session.run).toEqual({state:'interrupted'});
  expect(api.off).toHaveBeenCalledWith('payments.setupComplete');
});
test('NOACTION persists failed authentication without the native retry branch or a paid booking',async()=>{
  const api=cardinal('noaction');const transport=vi.fn(action=>Promise.resolve(action==='setup'?challenge:{state:'authentication_failed'}));
  const session=await createSongbirdSession({handoff:handoff(),transport,loadCardinal:async()=>api});mounted.push(session);
  expect(await session.run).toEqual({state:'authentication_failed'});
  expect(transport.mock.calls.map(call=>call[0])).toEqual(['setup','validated']);
  expect(transport.mock.calls[1][1]).toEqual({lease_id:'11111111-1111-4111-8111-111111111111',action_code:'NOACTION'});
});

test('setup forwards native browser EMV fields only and validation binds its ActionCode',async()=>{
  const api=cardinal();const transport=vi.fn(action=>Promise.resolve(action==='setup'?challenge:{state:'authentication_complete'}));
  const views=[];const session=await createSongbirdSession({handoff:handoff(),transport,onState:r=>views.push(r),loadCardinal:async()=>api});mounted.push(session);
  await session.run;
  const setup=transport.mock.calls[0][1];
  expect(Object.keys(setup.emv).sort()).toEqual(['browser_java_enabled','browser_language','browser_color_depth',
    'browser_screen_height','browser_screen_width','browser_time_zone','user_agent','browser_javascript_enabled'].sort());
  expect(setup.emv.browser_javascript_enabled).toBe('true');
  expect(setup.emv).not.toHaveProperty('ip_address');expect(setup.emv).not.toHaveProperty('browser_header');
  expect(setup).not.toHaveProperty('card_number');expect(setup).not.toHaveProperty('order_id');
  expect(transport.mock.calls[1][1].action_code).toBe('SUCCESS');
  expect(views.every(value=>!value.challenge&&!value.jwt&&!value.payload)).toBe(true);
});

test.each(['ERROR','FAILURE','CANCEL','TIMEOUT','UNKNOWN'])('Cardinal %s is persisted without JWT/provider continuation',async action=>{
  const api=cardinal('abandon');const transport=vi.fn().mockResolvedValue({state:'authentication_failed'});
  const session=await createSongbirdSession({handoff:handoff(),transport,loadCardinal:async()=>api});mounted.push(session);
  api.emit('payments.validated',{ActionCode:action},'opaque.should.not-forward');
  expect(await session.run).toEqual({state:'authentication_failed'});
  expect(transport.mock.calls.map(c=>c[0])).toEqual(['validated']);
  expect(transport.mock.calls[0][1]).not.toHaveProperty('jwt');
  expect(transport.mock.calls[0][1].action_code).toBe(action==='UNKNOWN'?'ERROR':action);
  api.emit('payments.validated',{ActionCode:action},'opaque.should.not-forward');expect(transport).toHaveBeenCalledTimes(1);
});

test('SUCCESS without an authentic-shaped JWT persists failure instead of calling the SDK continuation',async()=>{
  const api=cardinal('abandon');const transport=vi.fn().mockResolvedValue({state:'authentication_failed'});
  const session=await createSongbirdSession({handoff:handoff(),transport,loadCardinal:async()=>api});mounted.push(session);
  api.emit('payments.validated',{ActionCode:'SUCCESS'},'not-a-jwt');await session.run;
  expect(transport.mock.calls[0][1].action_code).toBe('ERROR');expect(transport.mock.calls[0][1]).not.toHaveProperty('jwt');
});

test('unverified continue response remains blocked, with no browser finalization transport',async()=>{
  const api=cardinal();const views=[];
  const transport=vi.fn(action=>Promise.resolve(action==='setup'?challenge:{state:'contract_blocked',block_code:'PIXELPAY_SONGBIRD_AUTH_RESULT_UNACCREDITED'}));
  const session=await createSongbirdSession({handoff:handoff(),transport,onState:r=>views.push(r),loadCardinal:async()=>api});mounted.push(session);
  expect(await session.run).toEqual({state:'contract_blocked'});
  expect(transport.mock.calls.map(c=>c[0])).toEqual(['setup','validated']);
  expect(views.at(-1).state).toBe('contract_blocked');expect(views.at(-1).block_code).toBe('PIXELPAY_SONGBIRD_AUTH_RESULT_UNACCREDITED');
  expect(views.every(v=>v.financial_finalization_enabled===false)).toBe(true);
});

test.each([['foreign_host','https://evil.invalid/challenge'],['live_cardinal','https://centinelapi.cardinalcommerce.com/challenge'],['http','http://centinelapistag.cardinalcommerce.com/challenge'],
  ['embedded_credentials','https://user:pass@centinelapistag.cardinalcommerce.com/challenge']])('untrusted challenge URL category %s never enters Cardinal.continue',async(_category,acsUrl)=>{
  const api=cardinal();const interrupt=vi.fn();const transport=vi.fn().mockResolvedValue({...challenge,challenge:{...challenge.challenge,acsUrl}});
  const session=await createSongbirdSession({handoff:handoff(),transport,onInterrupt:interrupt,loadCardinal:async()=>api});mounted.push(session);
  expect(await session.run).toEqual({state:'interrupted'});expect(api.continue).not.toHaveBeenCalled();expect(interrupt).toHaveBeenCalledOnce();
  expect(transport.mock.calls.map(c=>c[0])).toEqual(['setup']);
});

test('an abandoned browser claim records a local interruption once, even after signal abort',async()=>{
  const api=cardinal('abandon');const controller=new AbortController();const interrupt=vi.fn().mockResolvedValue({});
  const session=await createSongbirdSession({handoff:handoff(),transport:vi.fn(),onInterrupt:interrupt,signal:controller.signal,loadCardinal:async()=>api});mounted.push(session);
  controller.abort();session.stop();await session.run;
  expect(interrupt).toHaveBeenCalledTimes(1);
  expect(interrupt).toHaveBeenCalledWith({lease_id:'11111111-1111-4111-8111-111111111111',interrupt_reason:'SIGNAL_ABORT'});
});

test('invalid script API erases the token and cannot leave the browser mutex locked',async()=>{
  const token=handoff();const interrupt=vi.fn();
  await expect(createSongbirdSession({handoff:token,transport:vi.fn(),onInterrupt:interrupt,loadCardinal:async()=>({})})).rejects.toThrow('SONGBIRD_SESSION_UNAVAILABLE');
  expect(token).not.toHaveProperty('jwt');expect(interrupt).toHaveBeenCalledOnce();
  const session=await createSongbirdSession({handoff:handoff(),transport:vi.fn(),loadCardinal:async()=>cardinal('abandon')});mounted.push(session);
  session.stop();expect(await session.run).toEqual({state:'interrupted'});
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

test.each(['UI_CLOSED','PANEL_CLEANUP'])('interrupt reason %s is fixed and one-shot while lookup is pending',async reason=>{
  const api=cardinal('abandon');const interrupt=vi.fn();let finish;
  const transport=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));
  const controller=new AbortController();
  const session=await createSongbirdSession({handoff:handoff(),transport,onInterrupt:interrupt,signal:controller.signal,loadCardinal:async()=>api});mounted.push(session);
  api.emit('payments.setupComplete',{sessionId:'synthetic-reference'});
  await vi.waitFor(()=>expect(transport).toHaveBeenCalledOnce());
  if(reason==='UI_CLOSED')api.emit('ui.close');
  else if(reason==='PANEL_CLEANUP')controller.abort('PANEL_CLEANUP');
  await session.run;session.stop();
  expect(interrupt).toHaveBeenCalledExactlyOnceWith({lease_id:'11111111-1111-4111-8111-111111111111',interrupt_reason:reason});
  finish?.(challenge);await Promise.resolve();expect(api.continue).not.toHaveBeenCalled();
});
test('native setup rejection emits fixed SDK error without serializing error text',async()=>{
  const api=cardinal();const interrupt=vi.fn();
  const session=await createSongbirdSession({handoff:handoff(),transport:vi.fn().mockRejectedValue(new Error('SENSITIVE_ERROR')),onInterrupt:interrupt,loadCardinal:async()=>api});mounted.push(session);
  await session.run;
  expect(interrupt).toHaveBeenCalledExactlyOnceWith({lease_id:'11111111-1111-4111-8111-111111111111',interrupt_reason:'SDK_HANDLER_ERROR'});
  expect(JSON.stringify(interrupt.mock.calls)).not.toContain('SENSITIVE_ERROR');
});

test.each([
  ['https://cas.client.cardinaltrusted.com',true],
  ['https://client.cardinaltrusted.com',false],
  ['https://evil.cas.client.cardinaltrusted.com',false],
  ['https://cas.client.cardinaltrusted.com.evil.invalid',false],
  ['http://cas.client.cardinaltrusted.com',false],
  ['https://cas.client.cardinaltrusted.com:8443',false],
])('CAS origin %s is allowed only by exact match',async(origin,allowed)=>{
  const api=cardinal();const transport=vi.fn(action=>Promise.resolve(action==='setup'
    ?{...challenge,challenge:{...challenge.challenge,acsUrl:origin+'/merchantacs/threeds/v2/creq'}}
    :{state:'contract_blocked',financial_finalization_enabled:false}));
  const session=await createSongbirdSession({handoff:handoff(),transport,loadCardinal:async()=>api});mounted.push(session);
  await session.run;expect(api.continue.mock.calls.length).toBe(allowed?1:0);
  expect(transport.mock.calls.map(c=>c[0])).toEqual(allowed?['setup','validated']:['setup']);
});
