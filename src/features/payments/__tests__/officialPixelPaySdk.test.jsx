// @vitest-environment jsdom
import {test,expect,vi} from 'vitest';
import {createRequire} from 'node:module';
import net from 'node:net';
import nacl from 'tweetnacl';
import {buildOfficialSale} from './fixtures/officialPixelPaySale.js';
const require=createRequire(import.meta.url);
const sdk=require('@pixelpay/sdk-core');
const axios=require('axios');

test.each([true,false])('literal browser doSale: SDK owns Songbird and attempts final POST even when continue success=%s',async valid=>{
  const originalAdapter=axios.defaults.adapter;const originalConnect=net.Socket.prototype.connect;
  let sockets=0;net.Socket.prototype.connect=function(){sockets++;throw new Error('EXTERNAL_BLOCKED');};
  const methods=[sdk.Services.Transaction.prototype.doSale,sdk.Requests.SaleTransaction.prototype.withAuthenticationRequest];
  const trace=[];let sales=0,finalDispatches=0;const authHeaders=[];const requests=[];
  const handlers=new Map();
  window.Cardinal={configure:vi.fn(),off:name=>handlers.delete(name),on:(name,fn)=>handlers.set(name,fn),
    setup:()=>{trace.push('songbird.setup');queueMicrotask(()=>handlers.get('payments.setupComplete')({sessionId:'synthetic-ddc'}));},
    continue:()=>{trace.push('challenge');queueMicrotask(()=>handlers.get('payments.validated')({ActionCode:'SUCCESS'},'synthetic.jwt.signature'));}};
  const observer=new MutationObserver(records=>{for(const record of records)for(const el of record.addedNodes){
    if(el.tagName==='SCRIPT'){
      expect(el.src).toBe('https://songbirdstag.cardinalcommerce.com/edge/v1/songbird.js');
      trace.push('songbird.script.mocked');queueMicrotask(()=>el.dispatchEvent(new Event('load')));
    }
  }});observer.observe(document.documentElement,{childList:true,subtree:true});
  axios.defaults.adapter=async config=>{
    const route=config.url;trace.push(route);authHeaders.push(Boolean(config.headers['x-auth-key']&&config.headers['x-auth-hash']));
    const body=config.data?JSON.parse(config.data):{};
    if(route.endsWith('public_key'))return reply(config,200,{public_key:btoa(String.fromCharCode(...nacl.box.keyPair().publicKey))});
    if(route.endsWith('transaction/sale')){
      sales++;requests.push({order:body.order_id,amount:body.order_amount,currency:body.order_currency,auth:body.authentication_identifier});
      if(sales===1)return reply(config,202,{transaction_type:'songbird',payload:'synthetic.initial.jwt'});
      // AM: Observe native finalization at the HTTP boundary; never dispatch it, even to a local fixture server.
      throw new Error('OFFLINE_FINAL_POST_BLOCKED');
    }
    if(route.endsWith('lookup'))return reply(config,200,{identifier:'synthetic-auth',continue_url:'https://acs.offline.invalid',continue_payload:'synthetic',transaction_id:'synthetic-tx'},true,'continue');
    if(route.endsWith('continue'))return reply(config,200,{},valid);
    throw new Error('UNEXPECTED_TRANSPORT');
  };
  const network=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw new Error('EXTERNAL_BLOCKED');});
  const xhr=vi.spyOn(XMLHttpRequest.prototype,'open').mockImplementation(()=>{throw new Error('EXTERNAL_BLOCKED');});
  try{
    const literal=buildOfficialSale(sdk,{authentication:true});literal.settings.setupEnvironment('sandbox');
    const response=await literal.service.doSale(literal.sale);
    expect(sales).toBe(2);expect(finalDispatches).toBe(0);expect(authHeaders.every(Boolean)).toBe(true);
    expect(requests[1]).toMatchObject({order:requests[0].order,amount:requests[0].amount,currency:requests[0].currency,auth:'synthetic-auth'});
    expect(trace).toContain('songbird.setup');expect(trace).toContain('challenge');
    expect(trace.indexOf('api/v2/cardinal/authentication/continue')).toBeGreaterThan(trace.indexOf('challenge'));
    expect(sdk.Entities.TransactionResult.validateResponse(response)).toBe(false);
    expect(()=>literal.service.verifyPaymentHash('synthetic',literal.order.id,'synthetic')).toThrow(/browser/);
    expect(methods).toEqual([sdk.Services.Transaction.prototype.doSale,sdk.Requests.SaleTransaction.prototype.withAuthenticationRequest]);
    expect(network).not.toHaveBeenCalled();expect(xhr).not.toHaveBeenCalled();
    expect(sockets).toBe(0);
  }finally{net.Socket.prototype.connect=originalConnect;observer.disconnect();axios.defaults.adapter=originalAdapter;network.mockRestore();xhr.mockRestore();delete window.Cardinal;document.querySelectorAll('script').forEach(el=>el.remove());}
});
function reply(config,status,data,success=true,action=null){return{config,status,data:{success,data,action},headers:{}};}

test('literal browser example without credentials cannot start its HTTP operation',async()=>{
  const adapter=axios.defaults.adapter;const send=vi.fn();axios.defaults.adapter=send;
  try{const x=buildOfficialSale(sdk,{authentication:true,credentials:false});await x.service.doSale(x.sale);expect(send.mock.calls.length).toBe(0);}
  finally{axios.defaults.adapter=adapter;}
});

test('official setupSandbox supplies public test credentials itself, without merchant configuration',()=>{
  const x=buildOfficialSale(sdk,{sandbox:true,authentication:true});
  expect(x.settings.endpoint).toBe('https://pixelpay.dev');
  expect(Boolean(x.settings.auth_key&&x.settings.auth_hash)).toBe(true);
  expect(x.settings.auth_hash==='synthetic-reusable-hash').toBe(false);
  expect(x.sale.authentication_request).toBe(true);
});
