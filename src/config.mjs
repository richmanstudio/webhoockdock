import path from 'node:path';

function intEnv(name, fallback, min, max) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function secret(name) {
  const value = process.env[name]?.trim();
  return value || null;
}

export function loadConfig() {
  return {
    host: process.env.WEBHOOKDOCK_HOST?.trim() || '127.0.0.1',
    port: intEnv('WEBHOOKDOCK_PORT', 4400, 1, 65535),
    dataPath: path.resolve(process.cwd(), process.env.WEBHOOKDOCK_DATA_PATH?.trim() || '.data/webhookdock.json'),
    maxBodyBytes: intEnv('WEBHOOKDOCK_MAX_BODY_BYTES', 2_097_152, 1_024, 20_971_520),
    retentionLimit: intEnv('WEBHOOKDOCK_RETENTION_LIMIT', 5_000, 100, 100_000),
    githubSecret: secret('WEBHOOKDOCK_GITHUB_SECRET'),
    stripeSecret: secret('WEBHOOKDOCK_STRIPE_SECRET'),
    genericSecret: secret('WEBHOOKDOCK_GENERIC_SECRET'),
  };
}
