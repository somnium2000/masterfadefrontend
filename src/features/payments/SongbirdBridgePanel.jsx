import {useCallback,useEffect,useRef,useState} from 'react';
import {Button} from '../../components/ui/button.jsx';
import {Loader2} from 'lucide-react';
import {requestSongbirdBridge} from '../public/booking/publicBookingApi.js';

const safeView=value=>({state:value?.state||'unavailable',can_start:value?.can_start===true,
  expires_at:value?.expires_at,
  can_resume:false,financial_finalization_enabled:false,
  block_code:value?.block_code==='PIXELPAY_SONGBIRD_AUTH_RESULT_UNACCREDITED'?value.block_code:null});
export default function SongbirdBridgePanel({enabled=false,groupId,intentId,email,identity,allowStart=true,eligibilityChecking=false}) {
  const [view,setView]=useState({state:'loading',can_start:false});
  const [busyScope,setBusyScope]=useState(null);
  const generation=useRef(0);const inFlight=useRef(false);const session=useRef(null);
  const abortRef=useRef(null);
  const scope=`${identity||''}|${groupId||''}|${intentId||''}|${email||''}`;
  const key=useRef(scope);key.current=scope;
  const canRead=enabled===true&&Boolean(groupId&&intentId&&email&&identity);
  const call=useCallback((action,fields={},options={})=>requestSongbirdBridge({id_grupo_cita:groupId,id_intent:intentId,
    titular_email:email,action,...fields},options),[groupId,intentId,email]);
  useEffect(()=>{
    const current=++generation.current;const controller=new AbortController();
    abortRef.current?.abort('PANEL_CLEANUP');session.current?.stop(true,'PANEL_CLEANUP');session.current=null;inFlight.current=false;
    if(canRead)call('status',{}, {signal:controller.signal}).then(r=>{
      if(!controller.signal.aborted&&current===generation.current)setView({...safeView(r),scope});
    }).catch(()=>{if(!controller.signal.aborted&&current===generation.current)setView({state:'unavailable',can_start:false,scope});});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- AM: This ref is a request epoch, not a DOM ref.
    return ()=>{controller.abort();abortRef.current?.abort('PANEL_CLEANUP');generation.current++;session.current?.stop(true,'PANEL_CLEANUP');session.current=null;};
  },[call,canRead,scope]);
  useEffect(()=>{
    if(view.scope!==scope||view.state!=='handoff_ready')return;
    const expires=Date.parse(view.expires_at);
    if(!Number.isFinite(expires))return;
    // AM: Local expiry can only close the CTA; it never grants or renews a backend lease.
    const timer=setTimeout(()=>setView(previous=>previous.scope===scope&&previous.state==='handoff_ready'
      ?{...previous,state:'expired',can_start:false}:previous),Math.max(0,expires-Date.now()));
    return ()=>clearTimeout(timer);
  },[view.scope,view.state,view.expires_at,scope]);
  const refresh=async()=>{
    if(!canRead||inFlight.current)return;
    const current=generation.current;inFlight.current=true;setBusyScope(scope);
    const controller=new AbortController();abortRef.current=controller;
    try{
      const result=await call('status',{}, {signal:controller.signal});
      if(current===generation.current)setView({...safeView(result),scope});
    }catch{if(current===generation.current)setView({state:'unavailable',can_start:false,scope});}
    finally{controller.abort();if(current===generation.current){inFlight.current=false;setBusyScope(null);}}
  };
  const start=async()=>{
    if(!canRead||!allowStart||eligibilityChecking||inFlight.current||view.scope!==scope||view.state!=='handoff_ready'||view.can_start!==true)return;
    if(Date.parse(view.expires_at)<=Date.now()){setView({...view,state:'expired',can_start:false});return;}
    const current=generation.current;const currentScope=scope;inFlight.current=true;setBusyScope(scope);
    const controller=new AbortController();
    abortRef.current=controller;
    try{
      const response=await call('claim',{}, {signal:controller.signal});
      if(current!==generation.current||key.current!==currentScope){if(response.handoff)delete response.handoff.jwt;return;}
      setView({...safeView(response),scope});
      if(!response.handoff)return;
      const {createSongbirdSession,loadSongbirdSdk}=await import('./songbirdSession.js');
      const activeSession=await createSongbirdSession({handoff:response.handoff,signal:controller.signal,
        // AM: SDK 2.5.8's browser entry publishes these namespaces on window instead of module exports.
        loadSdk:async()=>{
          const native=await loadSongbirdSdk();
          return {...native,sdk:{Models:native.sdk?.Models||window.Models,
            Requests:native.sdk?.Requests||window.Requests,Responses:native.sdk?.Responses||window.Responses}};
        },
        transport:(action,fields)=>call(action,fields,{signal:controller.signal}),
        // AM: Interruption is a local state change and must survive aborting the browser request epoch.
        onInterrupt:fields=>call('interrupt',fields).catch(()=>{}),
        onState:r=>{if(current===generation.current&&key.current===currentScope)setView({...safeView(r),scope});}});
      if(current!==generation.current||key.current!==currentScope){activeSession.stop(true,'CONTEXT_CHANGED');return;}
      session.current=activeSession;await activeSession.run;
    }catch{if(current===generation.current)setView({state:'interrupted',can_start:false,scope});}
    finally{controller.abort();if(current===generation.current){setBusyScope(null);inFlight.current=false;}}
  };
  if(!canRead)return null;
  return <section aria-label="Autenticación 3DS de Sandbox" className="mt-4 rounded-xl border border-[var(--mf-accent)]/50 bg-[var(--mf-soft)] p-4 sm:p-5" aria-busy={busyScope===scope}>
    <h4 className="font-semibold text-[var(--mf-text)]">Autenticación 3DS de Sandbox</h4>
    <p className="mt-2 font-semibold text-[var(--mf-accent)]">{view.state==='handoff_ready'&&!allowStart?'Reserva temporal vencida':{handoff_ready:'Lista para iniciar',browser_leased:'Autenticación iniciada',
      setup_in_flight:'Preparando desafío bancario',challenge_ready:'Desafío bancario disponible',expired:'Sesión 3DS vencida'}[view.state]}</p>
    <p role="status">{view.block_code==='PIXELPAY_SONGBIRD_AUTH_RESULT_UNACCREDITED'?'La respuesta de autenticación requiere verificación de PixelPay. La finalización financiera sigue bloqueada.'
      :view.state==='contract_blocked'?'El puente conservó el intento. La continuación requiere un contrato de PixelPay.'
      :view.state==='authentication_complete'||view.state==='financial_finalization_blocked'?'La autenticación no confirma el pago. La finalización financiera permanece bloqueada.'
      :view.state==='handoff_ready'?allowStart?'La autenticación está preparada. Inicia ahora la verificación de tu banco antes de que venza la sesión.':'La reserva temporal venció. No se puede iniciar la autenticación de este intento.'
      :view.state==='browser_leased'?'La autenticación ya se inició en un navegador. Espera la preparación del desafío; no vuelvas a iniciarla.'
      :view.state==='setup_in_flight'?'Estamos preparando el desafío con tu banco. Espera sin volver a iniciar la autenticación.'
      :view.state==='challenge_ready'?'Completa el desafío de tu banco. Todavía no se ha confirmado el pago.'
      :view.state==='authentication_failed'?'La autenticación no fue aprobada. No repitas el pago.'
      :view.state==='authentication_unverified'?'La autenticación requiere verificación del proveedor. No repitas el pago.'
      :view.state==='expired'?'La sesión de autenticación 3DS venció. Este intento no se puede reabrir. No repitas el pago.'
      :'El resultado sigue pendiente. No inicies otro pago.'}</p>
    {view.scope===scope&&view.state==='handoff_ready'&&view.can_start===true?<Button type="button" size="lg" className="mt-4 w-full whitespace-normal sm:w-auto" onClick={start} disabled={busyScope===scope||!allowStart||eligibilityChecking}>
      {busyScope===scope?<Loader2 size={18} className="animate-spin" aria-hidden="true"/>:null}
      {busyScope===scope?'Iniciando autenticación 3DS…':'Iniciar autenticación 3DS'}
    </Button>:null}
    <p className="mt-3 text-sm text-[var(--mf-text-2)]">La autenticación 3DS no realiza un segundo cobro ni confirma el pago.</p>
    {['awaiting_response','unavailable','browser_leased','interrupted','expired'].includes(view.state)
      ?<Button type="button" variant="outline" className="mt-3 w-full sm:w-auto" onClick={refresh} disabled={busyScope===scope}>Actualizar estado 3DS</Button>:null}
  </section>;
}
