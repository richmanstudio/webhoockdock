import crypto from 'node:crypto';

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function hmac(secret, value) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function github(raw, headers, secret) {
  const received = headers['x-hub-signature-256'];
  if (!received) return { provider: 'github', state: 'not_present', detail: 'x-hub-signature-256 not present' };
  if (!secret) return { provider: 'github', state: 'not_configured', detail: 'Set WEBHOOKDOCK_GITHUB_SECRET' };
  const expected = `sha256=${hmac(secret, raw)}`;
  return safeEqual(received, expected)
    ? { provider: 'github', state: 'valid', detail: 'HMAC SHA-256 matched' }
    : { provider: 'github', state: 'invalid', detail: 'HMAC SHA-256 mismatch' };
}

function stripe(raw, headers, secret) {
  const received = headers['stripe-signature'];
  if (!received) return { provider: 'stripe', state: 'not_present', detail: 'Stripe-Signature not present' };
  if (!secret) return { provider: 'stripe', state: 'not_configured', detail: 'Set WEBHOOKDOCK_STRIPE_SECRET' };
  const parts = received.split(',').map((part) => part.trim().split('=', 2));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value).filter(Boolean);
  if (!timestamp || !signatures.length) return { provider: 'stripe', state: 'invalid', detail: 'Malformed Stripe-Signature header' };
  const expected = hmac(secret, `${timestamp}.${raw.toString('utf8')}`);
  const valid = signatures.some((value) => safeEqual(value, expected));
  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!valid) return { provider: 'stripe', state: 'invalid', detail: 'Signature mismatch' };
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return { provider: 'stripe', state: 'invalid', detail: 'Signature timestamp is older than 5 minutes' };
  return { provider: 'stripe', state: 'valid', detail: 'Signature and timestamp matched' };
}

function generic(raw, headers, secret) {
  const received = headers['x-webhook-signature'];
  if (!received) return { provider: 'generic', state: 'not_present', detail: 'x-webhook-signature not present' };
  if (!secret) return { provider: 'generic', state: 'not_configured', detail: 'Set WEBHOOKDOCK_GENERIC_SECRET' };
  const expected = hmac(secret, raw);
  const normalized = received.startsWith('sha256=') ? received.slice(7) : received;
  return safeEqual(normalized, expected)
    ? { provider: 'generic', state: 'valid', detail: 'Generic HMAC SHA-256 matched' }
    : { provider: 'generic', state: 'invalid', detail: 'Generic HMAC SHA-256 mismatch' };
}

export function verifySignatures(raw, headers, config) {
  return [github(raw, headers, config.githubSecret), stripe(raw, headers, config.stripeSecret), generic(raw, headers, config.genericSecret)];
}
