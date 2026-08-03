import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { verifySignatures } from '../src/signatures.mjs';

const baseConfig = { githubSecret: null, stripeSecret: null, genericSecret: null };

test('validates GitHub HMAC SHA-256 signatures', () => {
  const raw = Buffer.from('{"action":"opened"}');
  const secret = 'github-test-secret';
  const signature = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
  const checks = verifySignatures(raw, { 'x-hub-signature-256': signature }, { ...baseConfig, githubSecret: secret });
  assert.equal(checks[0].state, 'valid');
});

test('rejects invalid generic signatures', () => {
  const checks = verifySignatures(Buffer.from('payload'), { 'x-webhook-signature': 'sha256=deadbeef' }, { ...baseConfig, genericSecret: 'secret' });
  assert.equal(checks[2].state, 'invalid');
});

test('reports configured provider state without leaking secrets', () => {
  const checks = verifySignatures(Buffer.from('payload'), { 'stripe-signature': 't=1,v1=bad' }, { ...baseConfig, stripeSecret: 'stripe-secret' });
  assert.equal(checks[1].state, 'invalid');
  assert.equal(JSON.stringify(checks).includes('stripe-secret'), false);
});
