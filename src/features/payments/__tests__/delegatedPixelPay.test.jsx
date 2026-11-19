// @vitest-environment jsdom
import React from 'react';
import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import DelegatedPixelPayPrototype from '../experimental/DelegatedPixelPayPrototype.jsx';
import { runDelegatedPixelPay, loadDelegatedSdk } from '../experimental/delegatedPixelPay.js';
const require = createRequire(import.meta.url);
const axios = require('axios');

function browserFixture() {
  const handlers = new Map(), events = [];
  const originalAdapter = axios.defaults.adapter;
  let providerCalls = 0;
  axios.defaults.adapter = async () => { providerCalls++; throw new Error('BROWSER_PROVIDER_FORBIDDEN'); };
  window.Cardinal = {
    configure: () => {}, off: name => handlers.delete(name), on: (name, fn) => handlers.set(name, fn),
    setup: () => { events.push('setup'); queueMicrotask(() => handlers.get('payments.setupComplete')?.({ sessionId: 'opaque-session' })); },
    continue: () => { events.push('challenge'); queueMicrotask(() => handlers.get('payments.validated')?.({ ActionCode: 'SUCCESS' }, 'opaque-validated')); },
  };
  const observer = new MutationObserver(records => {
    for (const record of records) for (const element of record.addedNodes) {
      if (element.tagName === 'SCRIPT') queueMicrotask(() => element.dispatchEvent(new Event('load')));
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  return { events, finish() {
    expect(providerCalls).toBe(0);
    observer.disconnect(); axios.defaults.adapter = originalAdapter;
    delete window.Cardinal; document.querySelectorAll('script').forEach(element => element.remove()); cleanup();
  } };
}

test('native manager delegates three methods without client credentials or client doSale; backend decides result', async () => {
  const fixture = browserFixture(), calls = [];
  try {
    const transport = async (operation, data) => {
      calls.push({ operation, data });
      if (operation === 'start') return { state: 'challenge', order: { id: 'A', amount: 1, currency: 'HNL' },
        sdk: { endpoint: 'https://offline.invalid', environment: 'sandbox' },
        continuation: { transaction_type: 'songbird', payload: 'opaque-setup', collection_url: null } };
      if (operation === 'lookup') return { status: 202, success: true, action: 'continue',
        data: { identifier: 'auth-A', continue_url: 'https://acs.offline.invalid', continue_payload: 'opaque', transaction_id: 'tx-A' } };
      if (operation === 'status') return { evidence: { providerApproved: false, bookingConfirmed: false } };
      return { status: 200, success: true, data: { response_approved: true } };
    };
    let inspected = false;
    const loadSdk = async () => {
      const { sdk, Manager } = await loadDelegatedSdk();
      // AM: Observe application construction through a test subclass; SDK files/prototypes stay unchanged.
      class InspectManager extends Manager {
        constructor(settings, request) {
          super(settings, request);
          expect(settings.auth_key).toBeUndefined(); expect(settings.auth_hash).toBeUndefined();
          expect(request.getSDKKeyPair()).toBeUndefined(); expect(request.authentication_request).toBe(true);
          inspected = true;
        }
      }
      return { sdk, Manager: InspectManager };
    };
    const result = await runDelegatedPixelPay({ transport, loadSdk });
    expect(inspected).toBe(true);
    expect(result.evidence.providerApproved).toBe(false);
    expect(calls.map(call => call.operation)).toEqual(['start', 'lookup', 'continue', 'retry', 'status']);
    expect(calls.find(call => call.operation === 'retry').data).toEqual({});
    expect(Object.keys(calls.find(call => call.operation === 'continue').data)).toEqual(['payload']);
    expect(fixture.events).toEqual(['setup', 'challenge']);
  } finally { fixture.finish(); }
});

test.runIf(Boolean(process.env.PIXELPAY_PROTOTYPE_BACKEND))('React -> loopback HTTP -> isolated Node SDK Sale -> native manager -> Node evidence', async () => {
  const child = spawn(process.execPath, [path.join(process.env.PIXELPAY_PROTOTYPE_BACKEND, 'scripts/pixelpay-delegated-desktop.mjs')],
    { cwd: process.env.PIXELPAY_PROTOTYPE_BACKEND, stdio: ['pipe', 'pipe', 'pipe'] });
  const server = await new Promise((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => reject(new Error('DESKTOP_SERVER_TIMEOUT')), 15000);
    child.once('error', reject);
    child.once('exit', code => { if (code) reject(new Error('DESKTOP_SERVER_FAILED')); });
    child.stdout.on('data', chunk => { text += chunk; if (text.includes('\n')) { clearTimeout(timer); resolve(JSON.parse(text.split('\n')[0])); } });
  });
  const address = new URL(server.address);
  const nativeConnect = net.Socket.prototype.connect;
  let external = 0;
  net.Socket.prototype.connect = function (...args) {
    const options = Array.isArray(args[0]) ? args[0][0] : args[0];
    if (options?.host !== '127.0.0.1' || Number(options?.port) !== Number(address.port)) {
      external++; throw new Error('EXTERNAL_BLOCKED');
    }
    return nativeConnect.apply(this, args);
  };
  const fixture = browserFixture(), calls = [];
  const send = (operation, data = {}, token = server.tokens.A) => new Promise((resolve, reject) => {
    const request = http.request(`${server.address}/attempts/A/${operation}`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    }, response => {
      let text = ''; response.on('data', chunk => { text += chunk; });
      response.on('end', () => response.statusCode === 200 ? resolve(JSON.parse(text)) : reject(new Error(`HTTP_${response.statusCode}`)));
    });
    request.on('error', reject); request.end(JSON.stringify(data));
  });
  try {
    await expect(send('start', {}, server.tokens.B)).rejects.toThrow('403');
    const transport = async (operation, data) => { calls.push({ operation, data }); return send(operation, data); };
    render(<DelegatedPixelPayPrototype transport={transport} />);
    fireEvent.click(screen.getByText('Iniciar prueba'));
    fireEvent.click(screen.getByText('Iniciar prueba'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Reserva sin confirmar'), { timeout: 12000 });
    expect(calls.map(call => call.operation)).toEqual(['start', 'lookup', 'continue', 'retry', 'status']);
    expect(fixture.events).toEqual(['setup', 'challenge']);
    const status = await send('status');
    expect(status.evidence).toMatchObject({ providerApproved: true, bookingConfirmed: false, orderId: 'A', attemptId: 'attempt-A' });
    expect(JSON.stringify(calls)).not.toMatch(/auth_hash|sdk_key_pair|card_number|secret/);
    await expect(send('retry', { order_id: 'B' })).rejects.toThrow('409');
    expect(external).toBe(0);
  } finally {
    fixture.finish(); net.Socket.prototype.connect = nativeConnect;
    child.stdin.end();
    await new Promise(resolve => { child.once('exit', resolve); setTimeout(() => { child.kill(); resolve(); }, 3000).unref(); });
  }
}, 25000);

test('transport failure keeps uncertain state, aborts advancement and cannot start another page session', async () => {
  const fixture = browserFixture();
  try {
    const transport = vi.fn(async operation => {
      if (operation === 'start') return { state: 'challenge', order: { id: 'A', amount: 1, currency: 'HNL' },
        sdk: { endpoint: 'https://offline.invalid', environment: 'sandbox' },
        continuation: { transaction_type: 'songbird', payload: 'opaque-setup', collection_url: null } };
      throw new Error('synthetic transport failure');
    });
    await expect(runDelegatedPixelPay({ transport })).rejects.toThrow();
    await expect(runDelegatedPixelPay({ transport })).rejects.toThrow('BUSY');
    expect(transport.mock.calls.map(([operation]) => operation)).toEqual(['start', 'lookup']);
  } finally { fixture.finish(); }
});
