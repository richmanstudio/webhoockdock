import fs from 'node:fs';
import path from 'node:path';

const EMPTY = { version: 1, events: [], replays: [] };

export class EventStore {
  constructor(filePath, retentionLimit) {
    this.filePath = filePath;
    this.retentionLimit = retentionLimit;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.data = this.#load();
  }

  #load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      return {
        version: 1,
        events: Array.isArray(parsed.events) ? parsed.events : [],
        replays: Array.isArray(parsed.replays) ? parsed.replays : [],
      };
    } catch (error) {
      if (error?.code === 'ENOENT') return structuredClone(EMPTY);
      const backup = `${this.filePath}.corrupt-${Date.now()}`;
      try { fs.renameSync(this.filePath, backup); } catch {}
      console.warn(`WebhookDock could not read the data file. A backup was created at ${backup}.`);
      return structuredClone(EMPTY);
    }
  }

  #save() {
    const temp = `${this.filePath}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(this.data, null, 2));
    fs.renameSync(temp, this.filePath);
  }

  insertEvent(event) {
    this.data.events.unshift(event);
    if (this.data.events.length > this.retentionLimit) {
      const removed = new Set(this.data.events.slice(this.retentionLimit).map((item) => item.id));
      this.data.events = this.data.events.slice(0, this.retentionLimit);
      this.data.replays = this.data.replays.filter((item) => !removed.has(item.eventId));
    }
    this.#save();
    return event;
  }

  listEvents({ channel = '', method = '', search = '', limit = 100, offset = 0 } = {}) {
    const needle = search.trim().toLowerCase();
    const filtered = this.data.events.filter((event) => {
      if (channel && event.channel !== channel) return false;
      if (method && event.method !== method.toUpperCase()) return false;
      if (needle && !`${event.channel} ${event.path} ${event.preview}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    return { items: filtered.slice(offset, offset + limit).map(summary), total: filtered.length };
  }

  getEvent(id) {
    return this.data.events.find((event) => event.id === id) || null;
  }

  deleteEvent(id) {
    const before = this.data.events.length;
    this.data.events = this.data.events.filter((event) => event.id !== id);
    this.data.replays = this.data.replays.filter((replay) => replay.eventId !== id);
    const changed = before !== this.data.events.length;
    if (changed) this.#save();
    return changed;
  }

  clearEvents() {
    const count = this.data.events.length;
    this.data.events = [];
    this.data.replays = [];
    this.#save();
    return count;
  }

  insertReplay(replay) {
    this.data.replays.unshift(replay);
    this.#save();
    return replay;
  }

  listReplays(eventId) {
    return this.data.replays.filter((item) => item.eventId === eventId);
  }

  channels() {
    const counts = new Map();
    for (const event of this.data.events) counts.set(event.channel, (counts.get(event.channel) || 0) + 1);
    return [...counts.entries()].map(([channel, count]) => ({ channel, count }));
  }

  stats() {
    const cutoff = Date.now() - 3_600_000;
    const successful = this.data.replays.filter((item) => item.ok).length;
    let databaseBytes = 0;
    try { databaseBytes = fs.statSync(this.filePath).size; } catch {}
    return {
      totalEvents: this.data.events.length,
      eventsLastHour: this.data.events.filter((event) => new Date(event.receivedAt).getTime() >= cutoff).length,
      channels: new Set(this.data.events.map((event) => event.channel)).size,
      replaySuccessRate: this.data.replays.length ? Math.round((successful / this.data.replays.length) * 100) : null,
      databaseBytes,
    };
  }
}

function summary(event) {
  const { query, headers, body, rawBody, ...rest } = event;
  return rest;
}
