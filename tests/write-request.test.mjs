import test from 'node:test';
import assert from 'node:assert/strict';
import { rejectWriteRequest } from '../lib/write-request.mjs';

const url = 'https://asobe-silk-screen-skill-check.samonkntd.workers.dev/api/manual';

test('JSON and image uploads require the same browser origin', () => {
  const origin = new URL(url).origin;
  assert.equal(rejectWriteRequest(new Request(url, { method: 'PUT', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' })), null);
  assert.equal(rejectWriteRequest(new Request(url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'multipart/form-data; boundary=abc' }, body: '--abc--' }), 'form'), null);
  assert.equal(rejectWriteRequest(new Request(url, { method: 'PUT', headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal(rejectWriteRequest(new Request(url, { method: 'PUT', headers: { Origin: origin, 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
});

test('DELETE accepts same-origin requests even when the runtime supplies body metadata', () => {
  const url = 'https://asobe.example/api/users?userId=1';
  const origin = 'https://asobe.example';
  assert.equal(rejectWriteRequest(new Request(url, { method: 'DELETE', headers: { Origin: origin } }), 'query'), null);
  assert.equal(rejectWriteRequest(new Request(url, { method: 'DELETE', headers: { Origin: origin, 'Content-Type': 'application/json' } }), 'query'), null);
  assert.equal(rejectWriteRequest(new Request(url, { method: 'DELETE', headers: { Origin: origin }, body: new ReadableStream({ start(controller) { controller.close(); } }), duplex: 'half' }), 'query'), null);
  assert.equal(rejectWriteRequest(new Request(url, { method: 'DELETE', headers: { Origin: 'https://attacker.example' } }), 'query').status, 403);
});
