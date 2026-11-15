export const SONGBIRD_SANDBOX_URL = 'https://songbirdstag.cardinalcommerce.com/edge/v1/songbird.js';
let active = false;

function loadSongbird(signal) {
  return new Promise((resolve,reject)=>{
    if (signal?.aborted) return reject(new Error('SONGBIRD_INTERRUPTED'));
    const script=document.createElement('script');script.src=SONGBIRD_SANDBOX_URL;script.referrerPolicy='no-referrer';
    const done=()=>{script.onload=null;script.onerror=null;signal?.removeEventListener('abort',abort);};
    const abort=()=>{done();script.remove();reject(new Error('SONGBIRD_INTERRUPTED'));};
    script.onload=()=>{done();resolve(window.Cardinal);};script.onerror=()=>{done();script.remove();reject(new Error('SONGBIRD_LOAD_FAILED'));};
    signal?.addEventListener('abort',abort,{once:true});document.head.append(script);
  });
}
const unwrap=value=>value.default||value;
export async function loadSongbirdSdk() {
  const [core,manager,modal]=await Promise.all([import('@pixelpay/sdk-core'),import('@pixelpay/sdk-core/lib/libraries/CardinalManager.js'),
    import('@pixelpay/sdk-core/lib/libraries/PixelPayModal.js')]);
  return {sdk:unwrap(core),Manager:unwrap(manager),Modal:unwrap(modal)};
}

export async function createSongbirdSession({ handoff, transport, onState=()=>{}, signal,
  loadCardinal=loadSongbird, loadSdk=loadSongbirdSdk }) {
  if (active) throw new Error('SONGBIRD_BROWSER_BUSY');
  if (signal?.aborted || handoff?.protocol!=='songbird-sandbox-v1' || handoff.ephemeral_contract_verified!==true
    || typeof handoff.jwt!=='string' || handoff.jwt.length>16000 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(handoff.jwt)
    || typeof handoff.order_id!=='string' || !/^[A-Za-z0-9_-]{1,160}$/.test(handoff.order_id)
    || !/^[a-f0-9-]{36}$/i.test(handoff.lease_id||'') || Date.parse(handoff.expires_at)<=Date.now()
    || !Number.isFinite(Date.parse(handoff.expires_at))) throw new Error('SONGBIRD_HANDOFF_INVALID');
  active=true;
  let stopped=false;let manager;let cardinal;let previous;let facadeInstalled=false;let timer;let settleStop;let cleanupSdk;
  const sessionAbort=new AbortController();
  const stoppedPromise=new Promise(resolve=>{settleStop=resolve;});
  const handlers=new Set();
  const stop=()=>{
    if(stopped)return;stopped=true;clearTimeout(timer);
    sessionAbort.abort();
    cleanupSdk?.();
    for(const name of handlers)cardinal?.off(name);
    if(facadeInstalled){if(previous===undefined)delete window.Cardinal;else window.Cardinal=previous;}
    delete handoff.jwt;
    settleStop({state:'interrupted'});
    active=false;signal?.removeEventListener('abort',stop);
  };
  signal?.addEventListener('abort',stop,{once:true});
  timer=setTimeout(()=>{onState({state:'interrupted'});stop();},Math.max(0,Date.parse(handoff.expires_at)-Date.now()));
  try {
    const {sdk,Manager,Modal}=await loadSdk();
    cardinal=await loadCardinal(sessionAbort.signal);
    if(stopped||signal?.aborted||!cardinal)throw new Error('SONGBIRD_INTERRUPTED');
    previous=window.Cardinal;
    cleanupSdk=()=>{Manager.clearAllEvents();Modal?.hide();};
    // AM: Keep the SDK's UI/message logic; credentials and all financial methods are absent.
    const facade={
      configure:options=>cardinal.configure({...options,logging:{level:'off'}}),
      on:(name,handler)=>{handlers.add(name);cardinal.on(name,(...args)=>{
        if(stopped)return;
        try {
          Promise.resolve(handler(...args)).catch(()=>{onState({state:'interrupted'});stop();});
        } finally {
          if(name==='ui.close'){onState({state:'interrupted'});stop();}
        }
      });},
      off:name=>cardinal.off(name),setup:(...args)=>cardinal.setup(...args),continue:(...args)=>cardinal.continue(...args),
    };
    window.Cardinal=new Proxy(cardinal,{get:(target,name)=>name in facade?facade[name]
      :typeof target[name]==='function'?target[name].bind(target):target[name],set:(target,name,value)=>{target[name]=value;return true;}});
    facadeInstalled=true;
    const settings=new sdk.Models.Settings();settings.setupEndpoint('https://pixelpay.dev');settings.setupEnvironment('sandbox');
    const request=new sdk.Requests.SaleTransaction();request.order_id=handoff.order_id;request.order_currency='HNL';
    manager=new Manager(settings,request);
    const failure=()=>{const response=new sdk.Responses.FailureResponse();response.setStatus(520);response.success=false;response.data={};return response;};
    // AM: An abandoned native handler must never clear another session's global Cardinal events.
    const halted=new Promise(()=>{});
    let setupClaimed=false;let validationClaimed=false;
    manager.service={
      async authenticationLookup(value){
        if(stopped)return halted;if(setupClaimed)return failure();setupClaimed=true;
        const r=await transport('setup',{lease_id:handoff.lease_id,reference:value.reference});
        if(stopped)return halted;onState(r);
        if(r.state!=='challenge_ready'||!r.challenge)return failure();
        const response=new sdk.Responses.SuccessResponse();response.setStatus(200);response.success=true;response.action='continue';
        response.data={identifier:r.challenge.authenticationId,continue_url:r.challenge.acsUrl,
          continue_payload:r.challenge.payload,transaction_id:r.challenge.transactionId};return response;
      },
      async authenticationContinue(value){
        if(stopped)return halted;if(validationClaimed)return failure();validationClaimed=true;
        const r=await transport('validated',{lease_id:handoff.lease_id,jwt:value.payload});if(stopped)return halted;onState(r);return failure();
      },
      async retryTransaction(){if(stopped)return halted;onState({state:'financial_finalization_blocked'});return failure();},
    };
    // AM: The local loader has already loaded only the fixed Sandbox script; native init loads no second script.
    // startCardinalTransaction is the exact native event/UI flow called by SDK init after script/configuration.
    window.Cardinal.configure({payment:{framework:'inline'}});
    window.Cardinal.onSetupCompleteBusy=false;window.Cardinal.onValidatedBusy=false;
    const native=manager.startCardinalTransaction(handoff.jwt,manager);
    delete handoff.jwt;
    const run=Promise.race([native.then(()=>({state:'financial_finalization_blocked'}),()=>({state:'interrupted'})),stoppedPromise]).finally(stop);
    return { stop, run };
  } catch {stop();throw new Error('SONGBIRD_SESSION_UNAVAILABLE');}
}
