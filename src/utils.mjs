const SENSITIVE_HEADERS = new Set([
  'authorization', 'cookie', 'set-cookie', 'proxy-authorization',
  'x-api-key', 'x-auth-token', 'x-access-token', 'x-telegram-bot-api-secret-token',
]);

export function normalizeHeaders(headers) {
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return out;
}

export function redactHeaders(headers) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [
    key,
    SENSITIVE_HEADERS.has(key.toLowerCase()) ? '[REDACTED]' : value,
  ]));
}

export function parseBody(raw, contentType) {
  const rawBody = raw.toString('utf8');
  const type = contentType?.split(';', 1)[0]?.trim().toLowerCase();

  if (type === 'application/json' || type?.endsWith('+json')) {
    try {
      const body = JSON.parse(rawBody);
      return { body, rawBody, preview: preview(body) };
    } catch {
      return { body: rawBody, rawBody, preview: rawBody.slice(0, 160) || 'Invalid JSON payload' };
    }
  }
  if (type === 'application/x-www-form-urlencoded') {
    const body = Object.fromEntries(new URLSearchParams(rawBody));
    return { body, rawBody, preview: preview(body) };
  }
  if (type?.startsWith('text/')) return { body: rawBody, rawBody, preview: rawBody.slice(0, 160) || 'Empty text payload' };
  if (raw.length === 0) return { body: null, rawBody: '', preview: 'Empty payload' };

  return {
    body: { encoding: 'base64', data: raw.toString('base64') },
    rawBody: raw.toString('base64'),
    preview: `Binary payload · ${raw.length} bytes`,
  };
}

export function preview(value) {
  if (value === null || value === undefined) return 'Empty payload';
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').slice(0, 160);
  try { return JSON.stringify(value).slice(0, 160); } catch { return 'Unserializable payload'; }
}

export async function readBody(request, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error(`Payload exceeds ${maxBytes} bytes`);
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readJson(request, maxBytes = 262_144) {
  const buffer = await readBody(request, maxBytes);
  if (!buffer.length) return {};
  try { return JSON.parse(buffer.toString('utf8')); }
  catch {
    const error = new Error('Request body must be valid JSON');
    error.statusCode = 400;
    throw error;
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
