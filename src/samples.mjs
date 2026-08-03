import crypto from 'node:crypto';

export function createSampleEvent(provider) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  if (provider === 'github') return {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'GitHub-Hookshot/demo', 'x-github-event': 'push', 'x-github-delivery': id },
    body: { ref: 'refs/heads/main', before: '710df41', after: '8ab9942', repository: { full_name: 'duoniq/webhookdock', private: false }, pusher: { name: 'danila' }, head_commit: { id: '8ab9942', message: 'feat: ship webhook inspector', timestamp: now } },
  };
  if (provider === 'stripe') return {
    method: 'POST', headers: { 'content-type': 'application/json', 'stripe-version': '2025-06-30' },
    body: { id: `evt_${id.replaceAll('-', '').slice(0, 24)}`, object: 'event', type: 'payment_intent.succeeded', created: Math.floor(Date.now() / 1000), data: { object: { id: 'pi_demo', amount: 12900, currency: 'usd', status: 'succeeded' } } },
  };
  if (provider === 'telegram') return {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': '[DEMO]' },
    body: { update_id: Math.floor(Math.random() * 10_000_000), message: { message_id: 42, date: Math.floor(Date.now() / 1000), chat: { id: 10001, type: 'private', username: 'webhookdock_demo' }, text: '/start' } },
  };
  return {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-event-id': id },
    body: { event: 'customer.created', id, occurred_at: now, data: { customer_id: 'cus_demo', plan: 'studio', active: true } },
  };
}
