import test from 'node:test';
import assert from 'node:assert/strict';
import { passkeyErrorMessage } from '../lib/passkey-errors.mjs';

test('browser timeout or refusal is explained in Japanese without implying one cause', () => {
  const error = new Error('The operation either timed out or was not allowed. See: https://www.w3.org/TR/webauthn-2/#sctn-privacy-considerations-client.');
  error.name = 'NotAllowedError';
  const result = passkeyErrorMessage(error);
  assert.match(result, /時間切れ/);
  assert.match(result, /許可されなかった可能性/);
  assert.doesNotMatch(result, /https:|timed out|not allowed/i);
});

test('wrapped browser errors, unsupported devices, and registration conflicts have distinct guidance', () => {
  assert.match(passkeyErrorMessage({ name: 'WebAuthnError', code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', cause: { name: 'NotAllowedError' } }, 'register'), /登録が完了しませんでした/);
  assert.match(passkeyErrorMessage({ name: 'NotSupportedError' }), /通常のブラウザー/);
  assert.match(passkeyErrorMessage({ code: 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED' }, 'register'), /すでに登録/);
  assert.match(passkeyErrorMessage({ code: 'ERROR_INVALID_RP_ID' }), /管理者に連絡/);
});

test('Japanese API errors are preserved and unexpected English does not leak', () => {
  assert.equal(passkeyErrorMessage(new Error('認証の有効時間が切れました')), '認証の有効時間が切れました');
  assert.doesNotMatch(passkeyErrorMessage(new Error('Authentication was not completed')), /Authentication/);
});
