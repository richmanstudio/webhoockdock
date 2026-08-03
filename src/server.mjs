import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.mjs';
import { replayEvent } from './replay.mjs';
import { createSampleEvent } from './samples.mjs';
import { verifySignatures } from './signatures.mjs';
import { EventStore } from './store.mjs';
import { normalizeHeaders, parseBody, readBody, readJson, redactHeaders } from './utils.mjs';

const config = loadConfig();
const store = new EventStore(config.dataPath, config.retentionLimit);
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const sseClients = new Set();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

function securityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function cors(request, response) {
  const origin = request.headers.origin;
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  }
}

function json(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  response.end(body);
}

function noContent(response) {
  response.writeHead(204);
  response.end();
}

function queryObject(url) {
  const result = {};
  for (const [key, value] of url.searchParams) {
    if (Object.hasOwn(result, key)) {
      const current = result[key];
      result[key] = Array.isArray(current) ? [...current, value] : [current, value];
    } else result[key] = value;
  }
  return result;
}

function broadcast(event) {
  const message = `event: webhook\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) client.write(message);
}

function capture({ channel, method, requestPath, query, headers, raw, sourceIp }) {
  const contentType = headers['content-type'] || null;
  const parsed = parseBody(raw, contentType || undefined);
  const event = {
    id: crypto.randomUUID(),
    channel,
    method: method.toUpperCase(),
    path: requestPath,
    query,
    headers: redactHeaders(headers),
    body: parsed.body,
    rawBody: parsed.rawBody,
    contentType,
    size: raw.byteLength,
    sourceIp,
    receivedAt: new Date().toISOString(),
    signature: verifySignatures(raw, headers, config),
    preview: parsed.preview,
  };
  store.insertEvent(event);
  broadcast(event);
  return event;
}

function validChannel(channel) {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(channel);
}

async function serveStatic(request, response, pathname) {
  let requested = pathname === '/' ? '/index.html' : pathname;
  try { requested = decodeURIComponent(requested); } catch { return false; }
  const resolved = path.resolve(publicDir, `.${requested}`);
  if (!resolved.startsWith(`${publicDir}${path.sep}`) && resolved !== path.join(publicDir, 'index.html')) return false;
  let file = resolved;
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(publicDir, 'index.html');
  const ext = path.extname(file).toLowerCase();
  const data = fs.readFileSync(file);
  response.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': data.length,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
  });
  if (request.method === 'HEAD') response.end(); else response.end(data);
  return true;
}

async function handle(request, response) {
  securityHeaders(response);
  cors(request, response);
  if (request.method === 'OPTIONS') return noContent(response);

  const origin = `http://${request.headers.host || `${config.host}:${config.port}`}`;
  const url = new URL(request.url || '/', origin);
  const pathname = url.pathname;

  if (pathname === '/health' && request.method === 'GET') {
    return json(response, 200, { status: 'ok', service: 'webhookdock', version: '0.1.0' });
  }

  const hookMatch = pathname.match(/^\/hooks\/([^/]+)$/);
  if (hookMatch) {
    const channel = hookMatch[1];
    if (!validChannel(channel)) return json(response, 400, { error: 'Channel must match [a-zA-Z0-9_-] and be 1–64 characters' });
    const raw = await readBody(request, config.maxBodyBytes);
    const event = capture({
      channel,
      method: request.method,
      requestPath: `${pathname}${url.search}`,
      query: queryObject(url),
      headers: normalizeHeaders(request.headers),
      raw,
      sourceIp: request.socket.remoteAddress || null,
    });
    return json(response, 202, { accepted: true, id: event.id, channel: event.channel });
  }

  if (pathname === '/api/config' && request.method === 'GET') {
    return json(response, 200, {
      baseUrl: `${url.protocol}//${request.headers.host || `${config.host}:${config.port}`}`,
      retentionLimit: config.retentionLimit,
      maxBodyBytes: config.maxBodyBytes,
      signatureProviders: {
        github: Boolean(config.githubSecret),
        stripe: Boolean(config.stripeSecret),
        generic: Boolean(config.genericSecret),
      },
    });
  }

  if (pathname === '/api/stream' && request.method === 'GET') {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.write('event: ready\ndata: {}\n\n');
    sseClients.add(response);
    request.on('close', () => sseClients.delete(response));
    return;
  }

  if (pathname === '/api/events' && request.method === 'GET') {
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 300);
    const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
    return json(response, 200, store.listEvents({
      channel: url.searchParams.get('channel') || '',
      method: url.searchParams.get('method') || '',
      search: url.searchParams.get('search') || '',
      limit,
      offset,
    }));
  }

  if (pathname === '/api/events' && request.method === 'DELETE') {
    return json(response, 200, { deleted: store.clearEvents() });
  }

  const eventMatch = pathname.match(/^\/api\/events\/([a-f0-9-]+)$/i);
  if (eventMatch && request.method === 'GET') {
    const event = store.getEvent(eventMatch[1]);
    return event ? json(response, 200, event) : json(response, 404, { error: 'Event not found' });
  }
  if (eventMatch && request.method === 'DELETE') {
    return store.deleteEvent(eventMatch[1]) ? noContent(response) : json(response, 404, { error: 'Event not found' });
  }

  const replayMatch = pathname.match(/^\/api\/events\/([a-f0-9-]+)\/replay$/i);
  if (replayMatch && request.method === 'POST') {
    const event = store.getEvent(replayMatch[1]);
    if (!event) return json(response, 404, { error: 'Event not found' });
    const payload = await readJson(request);
    if (typeof payload.targetUrl !== 'string' || !payload.targetUrl) return json(response, 400, { error: 'targetUrl is required' });
    if (payload.headers !== undefined && (typeof payload.headers !== 'object' || Array.isArray(payload.headers))) return json(response, 400, { error: 'headers must be an object' });
    const replay = await replayEvent(event, payload);
    store.insertReplay(replay);
    return json(response, replay.error ? 502 : 200, { replay });
  }

  const replaysMatch = pathname.match(/^\/api\/events\/([a-f0-9-]+)\/replays$/i);
  if (replaysMatch && request.method === 'GET') {
    if (!store.getEvent(replaysMatch[1])) return json(response, 404, { error: 'Event not found' });
    return json(response, 200, { items: store.listReplays(replaysMatch[1]) });
  }

  if (pathname === '/api/test-events' && request.method === 'POST') {
    const payload = await readJson(request);
    const channel = typeof payload.channel === 'string' ? payload.channel : 'default';
    const provider = typeof payload.provider === 'string' ? payload.provider : 'generic';
    if (!validChannel(channel)) return json(response, 400, { error: 'Invalid channel' });
    if (!['github', 'stripe', 'telegram', 'generic'].includes(provider)) return json(response, 400, { error: 'Invalid provider' });
    const sample = createSampleEvent(provider);
    const raw = Buffer.from(JSON.stringify(sample.body));
    const event = capture({
      channel,
      method: sample.method,
      requestPath: `/hooks/${channel}`,
      query: {},
      headers: normalizeHeaders(sample.headers),
      raw,
      sourceIp: '127.0.0.1',
    });
    return json(response, 201, event);
  }

  if (pathname === '/api/channels' && request.method === 'GET') return json(response, 200, { items: store.channels() });
  if (pathname === '/api/stats' && request.method === 'GET') return json(response, 200, store.stats());

  if (pathname.startsWith('/api/')) return json(response, 404, { error: 'API route not found' });
  return serveStatic(request, response, pathname);
}

const server = http.createServer((request, response) => {
  Promise.resolve(handle(request, response)).catch((error) => {
    console.error(error);
    if (!response.headersSent) json(response, error?.statusCode || 500, { error: error instanceof Error ? error.message : 'Internal server error' });
    else response.end();
  });
});

const heartbeat = setInterval(() => {
  for (const client of sseClients) client.write(': heartbeat\n\n');
}, 20_000);
heartbeat.unref();

server.listen(config.port, config.host, () => {
  const displayHost = config.host === '0.0.0.0' ? 'localhost' : config.host;
  console.log(`\nWebhookDock is running at http://${displayHost}:${config.port}`);
  console.log(`Capture URL: http://${displayHost}:${config.port}/hooks/default`);
  console.log('Zero dependencies. Local data only.\n');
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down...`);
  clearInterval(heartbeat);
  for (const client of sseClients) client.end();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export { server, store, config, capture };
