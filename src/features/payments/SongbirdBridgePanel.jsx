import {useCallback,useEffect,useRef,useState} from 'react';
import {requestSongbirdBridge} from '../public/booking/publicBookingApi.js';

const safeView=value=>({state:value?.state||'unavailable',can_start:value?.can_start===true,
  can_resume:false,financial_finalization_enabled:false});
export default function SongbirdBridgePanel({enabled=false,groupId,intentId,email,identity,allowStart=true}) {
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
    abortRef.current?.abort();session.current?.stop();session.current=null;inFlight.current=false;
    if(canRead)call('status',{}, {signal:controller.signal}).then(r=>{
      if(!controller.signal.aborted&&current===generation.current)setView({...safeView(r),scope});
    }).catch(()=>{if(!controller.signal.aborted&&current===generation.current)setView({state:'unavailable',can_start:false,scope});});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- AM: This ref is a request epoch, not a DOM ref.
    return ()=>{controller.abort();abortRef.current?.abort();generation.current++;session.current?.stop();session.current=null;};
  },[call,canRead,scope]);
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
    if(!canRead||!allowStart||inFlight.current||view.scope!==scope||view.can_start!==true)return;
    const current=generation.current;const currentScope=scope;inFlight.current=true;setBusyScope(scope);
    const controller=new AbortController();
    abortRef.current=controller;
    try{
      const response=await call('claim',{}, {signal:controller.signal});
      if(current!==generation.current||key.current!==currentScope){if(response.handoff)delete response.handoff.jwt;return;}
      setView({...safeView(response),scope});
      if(!response.handoff)return;
      const {createSongbirdSession}=await import('./songbirdSession.js');
      const activeSession=await createSongbirdSession({handoff:response.handoff,signal:controller.signal,
        transport:(action,fields)=>call(action,fields,{signal:controller.signal}),
        onState:r=>{if(current===generation.current&&key.current===currentScope)setView({...safeView(r),scope});}});
      if(current!==generation.current||key.current!==currentScope){activeSession.stop();return;}
      session.current=activeSession;await activeSession.run;
    }catch{if(current===generation.current)setView({state:'interrupted',can_start:false,scope});}
    finally{controller.abort();if(current===generation.current){setBusyScope(null);inFlight.current=false;}}
  };
  if(!canRead)return null;
  return <section aria-label="Autenticación 3DS de Sandbox" className="mt-4 rounded-xl border p-4">
    <h4>Autenticación 3DS de Sandbox</h4>
    <p role="status">{view.state==='contract_blocked'?'El puente conservó el intento. La continuación requiere un contrato de PixelPay.'
      :view.state==='authentication_complete'||view.state==='financial_finalization_blocked'?'La autenticación no confirma el pago. La finalización financiera permanece bloqueada.'
      :view.state==='handoff_ready'?'La autenticación está preparada para este intento.'
      :view.state==='expired'?'La sesión de autenticación venció. No repitas el pago.'
      :'El resultado sigue pendiente. No inicies otro pago.'}</p>
    {view.scope===scope&&view.can_start===true?<button type="button" onClick={start} disabled={busyScope===scope||!allowStart}>Iniciar autenticación 3DS</button>:null}
    {['awaiting_response','unavailable','browser_leased','interrupted','expired'].includes(view.state)
      ?<button type="button" onClick={refresh} disabled={busyScope===scope}>Actualizar estado 3DS</button>:null}
  </section>;
}
