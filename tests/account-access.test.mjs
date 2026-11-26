import test from 'node:test';
import assert from 'node:assert/strict';
import { accountAccessStatus } from '../lib/account-access.mjs';

test('anonymous, stopped and provisional accounts cannot access protected data', () => {
  assert.equal(accountAccessStatus(null), 401);
  assert.equal(accountAccessStatus({ active: false, role: 'participant' }), 403);
  assert.equal(accountAccessStatus({ active: true, role: 'provisional' }), 403);
  assert.equal(accountAccessStatus({ active: true, role: 'participant' }), 200);
});
