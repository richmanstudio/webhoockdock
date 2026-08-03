import crypto from 'node:crypto';
import { sleep } from './utils.mjs';

const BLOCKED_HOSTS = new Set(['169.254.169.254', 'metadata.google.internal', '100.100.100.200', 'metadata.azure.internal']);
const OMITTED_HEADERS = new Set(['host', 'content-length', 'connection', 'transfer-encoding', 'authorization', 'cookie', 'set-cookie']);

function validateTarget(value) {
  let url;
  try { url = new URL(value); } catch { throw Object.assign(new Error('Target URL is invalid'), { statusCode: 400 }); }
  if (!['http:', 'https:'].includes(url.protocol)) throw Object.assign(new Error('Only HTTP and HTTPS targets are supported'), { statusCode: 400 });
  if (url.username || url.password) throw Object.assign(new Error('Credentials in target URLs are not allowed'), { statusCode: 400 });
  if (BLOCKED_HOSTS.has(url.hostname.toLowerCase())) throw Object.assign(new Error('Cloud metadata endpoints are blocked'), { statusCode: 400 });
  return url;
}

function headersFor(event, overrides = {}) {
  const headers = {};
  for (const [key, value] of Object.entries(event.headers)) {
    if (OMITTED_HEADERS.has(key.toLowerCase()) || value === '[REDACTED]') continue;
    headers[key] = value;
  }
  Object.assign(headers, overrides);
  headers['x-webhookdock-replay'] = event.id;
  return headers;
}

export async function replayEvent(event, request) {
  const target = validateTarget(request.targetUrl);
  const method = String(request.method || event.method).toUpperCase();
  const delayMs = Math.min(Math.max(Number(request.delayMs) || 0, 0), 30_000);
  if (delayMs) await sleep(delayMs);

  const started = performance.now();
  let status = null;
  let ok = false;
  let responsePreview = '';
  let error = null;

  try {
    const init = {
      method,
      headers: headersFor(event, request.headers),
      signal: AbortSignal.timeout(15_000),
      redirect: 'manual',
    };
    if (!['GET', 'HEAD'].includes(method)) init.body = event.rawBody;
    const response = await fetch(target, init);
    status = response.status;
    ok = response.ok;
    responsePreview = (await response.text()).slice(0, 4096);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'Replay failed';
  }

  return {
    id: crypto.randomUUID(),
    eventId: event.id,
    targetUrl: target.toString(),
    method,
    status,
    ok,
    durationMs: Math.round(performance.now() - started),
    responsePreview,
    error,
    createdAt: new Date().toISOString(),
  };
}
