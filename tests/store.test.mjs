import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EventStore } from '../src/store.mjs';

function event(id, channel = 'default') {
  return {
    id, channel, method: 'POST', path: `/hooks/${channel}`, query: {}, headers: {}, body: { id }, rawBody: JSON.stringify({ id }),
    contentType: 'application/json', size: 10, sourceIp: '127.0.0.1', receivedAt: new Date().toISOString(), signature: [], preview: id,
  };
}

test('persists events and respects retention', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webhookdock-store-'));
  const file = path.join(dir, 'data.json');
  const store = new EventStore(file, 2);
  store.insertEvent(event('one'));
  store.insertEvent(event('two', 'payments'));
  store.insertEvent(event('three'));
  assert.equal(store.listEvents().total, 2);
  assert.equal(store.getEvent('one'), null);

  const reopened = new EventStore(file, 2);
  assert.equal(reopened.listEvents().total, 2);
  assert.deepEqual(reopened.channels(), [{ channel: 'default', count: 1 }, { channel: 'payments', count: 1 }]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('deletes events with their replay history', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webhookdock-store-'));
  const store = new EventStore(path.join(dir, 'data.json'), 100);
  store.insertEvent(event('evt'));
  store.insertReplay({ id: 'replay', eventId: 'evt', ok: true });
  assert.equal(store.deleteEvent('evt'), true);
  assert.equal(store.listReplays('evt').length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});
