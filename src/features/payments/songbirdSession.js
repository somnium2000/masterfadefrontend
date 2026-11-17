export const SONGBIRD_SANDBOX_URL = 'https://songbirdstag.cardinalcommerce.com/edge/v1/songbird.js';
const ACS_ORIGINS = new Set(['https://songbirdstag.cardinalcommerce.com','https://centinelapistag.cardinalcommerce.com']);
let active = false;
const EMV_FIELDS = ['browser_java_enabled','browser_language','browser_color_depth','browser_screen_height',
  'browser_screen_width','browser_time_zone','user_agent','browser_javascript_enabled'];
const validJwt=value=>typeof value==='string'&&value.length<=16000&&/^[\w-]+\.[\w-]+\.[\w-]+$/.test(value);
const stateOnly=value=>({state:value?.state||'interrupted',can_start:false,can_resume:false,financial_finalization_enabled:false,
  block_code:value?.block_code==='PIXELPAY_SONGBIRD_AUTH_RESULT_UNACCREDITED'?value.block_code:null});
function validChallenge(value){
  if(!value||typeof value.payload!=='string'||!value.payload||value.payload.length>16000
    ||![value.authenticationId,value.transactionId].every(id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(id)))return false;
  try{const url=new URL(value.acsUrl);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.hash
    &&ACS_ORIGINS.has(url.origin);}catch{return false;}
}

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

export async function createSongbirdSession({ handoff, transport, onState=()=>{}, onInterrupt=()=>{}, signal,
  loadCardinal=loadSongbird, loadSdk=loadSongbirdSdk }) {
  if (active) throw new Error('SONGBIRD_BROWSER_BUSY');
  if (signal?.aborted || handoff?.protocol!=='songbird-sandbox-v1' || handoff.ephemeral_contract_verified!==true
    || !validJwt(handoff.jwt)
    || typeof handoff.order_id!=='string' || !/^[A-Za-z0-9_-]{1,160}$/.test(handoff.order_id)
    || !/^[a-f0-9-]{36}$/i.test(handoff.lease_id||'') || Date.parse(handoff.expires_at)<=Date.now()
    || !Number.isFinite(Date.parse(handoff.expires_at))) {
    if(handoff&&typeof handoff==='object')delete handoff.jwt;
    throw new Error('SONGBIRD_HANDOFF_INVALID');
  }
  active=true;
  let stopped=false;let manager;let cardinal;let previous;let facadeInstalled=false;let timer;let settleStop;let cleanupSdk;
  const sessionAbort=new AbortController();
  const stoppedPromise=new Promise(resolve=>{settleStop=resolve;});
  const handlers=new Set();
  let terminalState='financial_finalization_blocked';
  let terminalBlockCode=null;
  let setupClaimed=false;let validationClaimed=false;
  const emit=value=>onState(stateOnly(value));
  const stop=(notify=true)=>{
    if(stopped)return;stopped=true;clearTimeout(timer);
    sessionAbort.abort();
    try{cleanupSdk?.();for(const name of handlers)cardinal?.off(name);}catch{/* AM: Cleanup must still erase the token and release the browser lock. */}
    if(facadeInstalled){if(previous===undefined)delete window.Cardinal;else window.Cardinal=previous;}
    delete handoff.jwt;
    if(notify){try{Promise.resolve(onInterrupt({lease_id:handoff.lease_id})).catch(()=>{});}catch{/* AM: Durable server expiry also closes an interrupted lease. */}}
    settleStop({state:notify?'interrupted':terminalState});
    active=false;signal?.removeEventListener('abort',stop);
  };
  signal?.addEventListener('abort',stop,{once:true});
  timer=setTimeout(()=>{emit({state:'expired'});stop();},Math.max(0,Date.parse(handoff.expires_at)-Date.now()));
  try {
    const {sdk,Manager,Modal}=await loadSdk();
    if(stopped||signal?.aborted)throw new Error('SONGBIRD_INTERRUPTED');
    cardinal=await loadCardinal(sessionAbort.signal);
    if(stopped||signal?.aborted||!cardinal
      ||!['configure','on','off','setup','continue'].every(name=>typeof cardinal[name]==='function'))throw new Error('SONGBIRD_INTERRUPTED');
    previous=window.Cardinal;
    cleanupSdk=()=>{Manager.clearAllEvents();Modal?.hide();};
    // AM: Keep the SDK's UI/message logic; credentials and all financial methods are absent.
    const facade={
      configure:options=>cardinal.configure({...options,logging:{level:'off'}}),
      on:(name,handler)=>{handlers.add(name);cardinal.on(name,(...args)=>{
        if(stopped)return;
        if(name==='payments.validated'&&(args[0]?.ActionCode!=='SUCCESS'||!validJwt(args[1]))){
          if(validationClaimed)return;validationClaimed=true;
          const code=['ERROR','NOACTION','FAILURE','CANCEL','TIMEOUT'].includes(args[0]?.ActionCode)?args[0].ActionCode:'ERROR';
          // AM: A failed browser event is persisted locally and never enters the SDK's retry branch.
          Promise.resolve(transport('validated',{lease_id:handoff.lease_id,action_code:code}))
            .then(r=>{if(!stopped){terminalState=r.state;terminalBlockCode=r.block_code;emit(r);}},()=>{if(!stopped){terminalState='interrupted';emit({state:'interrupted'});}}).finally(()=>stop(false));
          return;
        }
        try {
          Promise.resolve(handler(...args)).catch(()=>{emit({state:'interrupted'});stop();});
        } finally {
          if(name==='ui.close'){emit({state:'interrupted'});stop();}
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
    manager.service={
      async authenticationLookup(value){
        if(stopped||setupClaimed)return halted;setupClaimed=true;
        const emv=Object.fromEntries(EMV_FIELDS.filter(key=>typeof value[key]==='string').map(key=>[key,value[key]]));
        const r=await transport('setup',{lease_id:handoff.lease_id,reference:value.reference,emv});
        if(stopped)return halted;terminalState=r.state;terminalBlockCode=r.block_code;emit(r);
        if(r.state!=='challenge_ready')return failure();
        if(!validChallenge(r.challenge)){terminalState='interrupted';emit({state:'interrupted'});stop();return halted;}
        const response=new sdk.Responses.SuccessResponse();response.setStatus(200);response.success=true;response.action='continue';
        response.data={identifier:r.challenge.authenticationId,continue_url:r.challenge.acsUrl,
          continue_payload:r.challenge.payload,transaction_id:r.challenge.transactionId};return response;
      },
      async authenticationContinue(value){
        if(stopped||validationClaimed)return halted;validationClaimed=true;
        const r=await transport('validated',{lease_id:handoff.lease_id,jwt:value.payload,action_code:'SUCCESS'});
        if(stopped)return halted;terminalState=r.state;terminalBlockCode=r.block_code;emit(r);return failure();
      },
      async retryTransaction(){if(stopped)return halted;
        if(terminalState==='authentication_complete')terminalState='financial_finalization_blocked';
        emit({state:terminalState,block_code:terminalBlockCode});return failure();},
    };
    // AM: The local loader has already loaded only the fixed Sandbox script; native init loads no second script.
    // startCardinalTransaction is the exact native event/UI flow called by SDK init after script/configuration.
    window.Cardinal.configure({payment:{framework:'inline'}});
    window.Cardinal.onSetupCompleteBusy=false;window.Cardinal.onValidatedBusy=false;
    const native=manager.startCardinalTransaction(handoff.jwt,manager);
    delete handoff.jwt;
    const run=Promise.race([native.then(()=>({state:terminalState}),()=>{emit({state:'interrupted'});stop();return{state:'interrupted'};}),stoppedPromise]).finally(()=>stop(false));
    return { stop, run };
  } catch {stop();throw new Error('SONGBIRD_SESSION_UNAVAILABLE');}
}
