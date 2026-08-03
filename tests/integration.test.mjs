import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
    server.on('error', reject);
  });
}

async function waitFor(url, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Server did not become ready: ${url}`);
}

test('captures, lists and replays a webhook end to end', { timeout: 15000 }, async () => {
  const port = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webhookdock-e2e-'));
  const child = spawn(process.execPath, ['src/server.mjs'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, WEBHOOKDOCK_PORT: String(port), WEBHOOKDOCK_DATA_PATH: path.join(dir, 'data.json') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitFor(`http://127.0.0.1:${port}/health`);
    const captured = await fetch(`http://127.0.0.1:${port}/hooks/payments?source=test`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer secret' }, body: JSON.stringify({ event: 'paid', amount: 12900 }),
    });
    assert.equal(captured.status, 202);
    const accepted = await captured.json();

    const eventResponse = await fetch(`http://127.0.0.1:${port}/api/events/${accepted.id}`);
    const event = await eventResponse.json();
    assert.equal(event.channel, 'payments');
    assert.equal(event.body.amount, 12900);
    assert.equal(event.headers.authorization, '[REDACTED]');

    const replayResponse = await fetch(`http://127.0.0.1:${port}/api/events/${accepted.id}/replay`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ targetUrl: `http://127.0.0.1:${port}/hooks/replayed` }),
    });
    assert.equal(replayResponse.status, 200);
    const replay = await replayResponse.json();
    assert.equal(replay.replay.ok, true);
    assert.equal(replay.replay.status, 202);

    const list = await (await fetch(`http://127.0.0.1:${port}/api/events`)).json();
    assert.equal(list.total, 2);
    assert.equal(list.items[0].channel, 'replayed');
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
