const state = {
  config: null,
  stats: null,
  channels: [],
  events: [],
  selected: null,
  selectedId: null,
  replays: [],
  channel: '',
  method: '',
  search: '',
  tab: 'body',
};

const $ = (selector) => document.querySelector(selector);
const elements = {
  channelNav: $('#channelNav'), eventList: $('#eventList'), inspector: $('#inspector'), channelTitle: $('#channelTitle'),
  captureUrl: $('#captureUrl'), liveIndicator: $('#liveIndicator'), storageSize: $('#storageSize'), retentionLimit: $('#retentionLimit'),
  modal: $('#modalLayer'), toast: $('#toast'), sidebar: $('#sidebar'), backdrop: $('#sidebarBackdrop'),
};

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
const api = async (url, options = {}) => {
  const response = await fetch(url, options);
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || `${response.status} ${response.statusText}`);
  return payload;
};
const jsonOptions = (method, body) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const timeAgo = (value) => { const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000)); if (seconds < 10) return 'now'; if (seconds < 60) return `${seconds}s`; if (seconds < 3600) return `${Math.floor(seconds / 60)}m`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`; return `${Math.floor(seconds / 86400)}d`; };
const formatBytes = (bytes) => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
const visibleSignature = (checks = []) => checks.find((item) => item.state !== 'not_present') || null;
const pretty = (value) => typeof value === 'string' ? value : JSON.stringify(value, null, 2);

function notify(message) {
  elements.toast.textContent = `✓  ${message}`;
  elements.toast.classList.remove('hidden');
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => elements.toast.classList.add('hidden'), 2200);
}

async function copy(value, message = 'Copied') {
  await navigator.clipboard.writeText(value);
  notify(message);
}

function captureUrl() {
  return `${state.config?.baseUrl || location.origin}/hooks/${state.channel || 'default'}`;
}

async function refreshMeta() {
  const [stats, channels] = await Promise.all([api('/api/stats'), api('/api/channels')]);
  state.stats = stats;
  state.channels = channels.items;
  renderChannels();
  elements.storageSize.textContent = formatBytes(stats.databaseBytes);
}

async function loadEvents() {
  const params = new URLSearchParams({ limit: '200' });
  if (state.channel) params.set('channel', state.channel);
  if (state.method) params.set('method', state.method);
  if (state.search.trim()) params.set('search', state.search.trim());
  const result = await api(`/api/events?${params}`);
  state.events = result.items;
  renderEvents();
  if (!state.selectedId && state.events[0]) selectEvent(state.events[0].id);
}

async function selectEvent(id) {
  state.selectedId = id;
  state.selected = await api(`/api/events/${id}`);
  state.replays = (await api(`/api/events/${id}/replays`)).items;
  renderEvents();
  renderInspector();
}

function renderChannels() {
  elements.channelTitle.textContent = state.channel || 'All events';
  elements.captureUrl.textContent = captureUrl();
  elements.retentionLimit.textContent = state.config?.retentionLimit || 0;
  const allCount = state.stats?.totalEvents || 0;
  elements.channelNav.innerHTML = `
    <button class="nav-item ${state.channel === '' ? 'active' : ''}" data-channel=""><span class="nav-dot"></span><span>All events</span><b>${allCount}</b></button>
    <div class="nav-label">CHANNELS</div>
    ${state.channels.map((item) => `<button class="nav-item ${state.channel === item.channel ? 'active' : ''}" data-channel="${escapeHtml(item.channel)}"><span class="nav-dot"></span><span>${escapeHtml(item.channel)}</span><b>${item.count}</b></button>`).join('') || '<div class="nav-empty">Channels appear after the first request.</div>'}
  `;
  elements.channelNav.querySelectorAll('[data-channel]').forEach((button) => button.addEventListener('click', () => {
    state.channel = button.dataset.channel;
    state.selectedId = null; state.selected = null;
    closeSidebar(); renderChannels(); renderInspector(); loadEvents().catch(showError);
  }));
}

function eventMatches(event) {
  const byChannel = !state.channel || event.channel === state.channel;
  const byMethod = !state.method || event.method === state.method;
  const bySearch = !state.search || `${event.channel} ${event.path} ${event.preview}`.toLowerCase().includes(state.search.toLowerCase());
  return byChannel && byMethod && bySearch;
}

function renderEvents() {
  if (!state.events.length) {
    elements.eventList.innerHTML = `<div class="empty-state"><div class="empty-icon">↯</div><h2>Waiting for a signal</h2><p>Send any HTTP request to the capture URL. No tunnel, account or cloud storage required.</p><button class="secondary-button" id="emptyTest">GENERATE TEST EVENT</button></div>`;
    $('#emptyTest')?.addEventListener('click', openTestModal);
    return;
  }
  elements.eventList.innerHTML = state.events.map((event) => {
    const check = visibleSignature(event.signature);
    return `<button class="event-row ${state.selectedId === event.id ? 'selected' : ''}" data-id="${event.id}">
      <div class="event-row-top"><span class="method method-${event.method.toLowerCase()}">${event.method}</span><span class="event-channel">/${escapeHtml(event.channel)}</span><time>${timeAgo(event.receivedAt)}</time></div>
      <div class="event-preview">${escapeHtml(event.preview)}</div>
      <div class="event-meta"><span>${formatBytes(event.size)}</span><span>${escapeHtml(event.contentType?.split(';')[0] || 'unknown')}</span>${check ? `<span class="signature signature-${check.state}">${check.provider}</span>` : ''}</div>
      <span class="row-chevron">›</span>
    </button>`;
  }).join('');
  elements.eventList.querySelectorAll('[data-id]').forEach((button) => button.addEventListener('click', () => selectEvent(button.dataset.id).catch(showError)));
}

function renderInspector() {
  const event = state.selected;
  if (!event) {
    elements.inspector.innerHTML = `<div class="inspector-empty"><div class="large-braces">{ }</div><h2>Select an event</h2><p>Headers, payload, signatures and replay history will appear here.</p></div>`;
    return;
  }
  const check = visibleSignature(event.signature);
  elements.inspector.innerHTML = `
    <div class="inspector-head"><div><span class="eyebrow">EVENT INSPECTOR</span><h2>${event.id.slice(0, 8)}</h2></div><div class="inspector-actions"><button class="secondary-button compact" id="replayButton">↻ REPLAY</button><button class="icon-button danger-hover" id="deleteEvent">×</button></div></div>
    <div class="event-summary-grid">
      ${summaryCard('RECEIVED', new Date(event.receivedAt).toLocaleString())}
      ${summaryCard('SOURCE', event.sourceIp || 'unknown')}
      ${summaryCard('REQUEST', `${event.method} · ${formatBytes(event.size)}`)}
      ${summaryCard('SIGNATURE', check ? `${check.provider} · ${check.state}` : 'not present', check?.state)}
    </div>
    <div class="tabs">${['body','headers','raw','replays'].map((tab) => `<button class="${state.tab === tab ? 'active' : ''}" data-tab="${tab}">${tab.toUpperCase()}${tab === 'replays' && state.replays.length ? ` ${state.replays.length}` : ''}</button>`).join('')}</div>
    <div class="inspector-content" id="inspectorContent"></div>
    <div class="inspector-footer"><button id="copyCurl">□ COPY AS CURL</button><span>${escapeHtml(event.contentType || 'No content type')}</span></div>
  `;
  renderInspectorContent();
  elements.inspector.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => { state.tab = button.dataset.tab; renderInspector(); }));
  $('#replayButton').addEventListener('click', openReplayModal);
  $('#deleteEvent').addEventListener('click', deleteSelected);
  $('#copyCurl').addEventListener('click', () => copy(buildCurl(event, captureUrl()), 'cURL copied'));
}

function summaryCard(label, value, tone = '') {
  return `<div class="summary-card"><span>${label}</span><strong class="${tone ? `tone-${tone}` : ''}">${escapeHtml(value)}</strong></div>`;
}

function renderInspectorContent() {
  const container = $('#inspectorContent');
  if (!container || !state.selected) return;
  if (state.tab === 'body' || state.tab === 'raw') {
    const value = state.tab === 'body' ? pretty(state.selected.body) : (state.selected.rawBody || '<empty body>');
    container.innerHTML = `<div class="code-panel"><button id="copyCode">□ COPY</button><pre></pre></div>`;
    container.querySelector('pre').textContent = value;
    $('#copyCode').addEventListener('click', () => copy(value));
  } else if (state.tab === 'headers') {
    container.innerHTML = `<div class="kv-list">${Object.entries(state.selected.headers).map(([key, value]) => `<div><code>${escapeHtml(key)}</code><span>${escapeHtml(value)}</span></div>`).join('')}</div>`;
  } else {
    container.innerHTML = state.replays.length ? `<div class="replay-list">${state.replays.map((item) => `<div class="replay-item"><div class="replay-state ${item.ok ? 'ok' : 'fail'}">${item.ok ? '✓' : '×'}</div><div><strong>${escapeHtml(`${item.method} ${item.targetUrl}`)}</strong><span>${escapeHtml(item.error || item.responsePreview || 'Empty response')}</span></div><div><b>${item.status ?? 'ERR'}</b><time>${item.durationMs} ms</time></div></div>`).join('')}</div>` : '<div class="tab-empty"><div>↻</div><p>No replay attempts yet.</p></div>';
  }
}

function buildCurl(event, target) {
  const headers = Object.entries(event.headers).filter(([key, value]) => !['host','content-length'].includes(key) && value !== '[REDACTED]').map(([key, value]) => `  -H '${key}: ${value.replaceAll("'", "'\\''")}' \\\n`).join('');
  const body = event.rawBody ? `  --data-raw '${event.rawBody.replaceAll("'", "'\\''")}'` : '';
  return `curl -X ${event.method} '${target}' \\\n${headers}${body}`.trim();
}

function modalFrame(title, description, content) {
  elements.modal.innerHTML = `<div class="modal-card"><button class="modal-close" id="modalClose">×</button><span class="eyebrow">WEBHOOKDOCK / ACTION</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p>${content}</div>`;
  elements.modal.classList.remove('hidden');
  $('#modalClose').addEventListener('click', closeModal);
  elements.modal.addEventListener('click', (event) => { if (event.target === elements.modal) closeModal(); }, { once: true });
}
function closeModal() { elements.modal.classList.add('hidden'); elements.modal.innerHTML = ''; }

function openTestModal() {
  modalFrame('Generate test event', 'Create a realistic provider payload without leaving your machine.', `
    <label class="field"><span>CHANNEL</span><input id="testChannel" value="${escapeHtml(state.channel || 'default')}"></label>
    <div class="provider-grid">${[['github','GitHub','push event'],['stripe','Stripe','payment success'],['telegram','Telegram','bot update'],['generic','Generic','customer created']].map(([id,label,detail], index) => `<button class="${index === 0 ? 'active' : ''}" data-provider="${id}"><strong>${label}</strong><span>${detail}</span></button>`).join('')}</div>
    <button class="primary-button wide" id="createTest">CREATE EVENT</button>`);
  let provider = 'github';
  elements.modal.querySelectorAll('[data-provider]').forEach((button) => button.addEventListener('click', () => {
    provider = button.dataset.provider;
    elements.modal.querySelectorAll('[data-provider]').forEach((item) => item.classList.toggle('active', item === button));
  }));
  $('#createTest').addEventListener('click', async () => {
    const channel = $('#testChannel').value.replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
    $('#createTest').disabled = true;
    try { const event = await api('/api/test-events', jsonOptions('POST', { provider, channel })); closeModal(); notify(`${provider} event captured`); await selectEvent(event.id); await refreshMeta(); await loadEvents(); }
    catch (error) { showError(error); $('#createTest').disabled = false; }
  });
}

function openReplayModal() {
  if (!state.selected) return;
  const defaultUrl = `${state.config?.baseUrl || location.origin}/hooks/replayed`;
  modalFrame('Replay request', 'Send the original method, body and safe headers to another endpoint.', `
    <label class="field"><span>TARGET URL</span><input id="replayUrl" value="${escapeHtml(defaultUrl)}"></label>
    <label class="field"><span>DELAY · <b id="delayValue">0</b> MS</span><input id="replayDelay" type="range" min="0" max="5000" step="250" value="0"></label>
    <button class="primary-button wide" id="runReplay">REPLAY NOW</button>`);
  $('#replayDelay').addEventListener('input', (event) => $('#delayValue').textContent = event.target.value);
  $('#runReplay').addEventListener('click', async () => {
    const button = $('#runReplay'); button.disabled = true;
    try {
      const result = await api(`/api/events/${state.selected.id}/replay`, jsonOptions('POST', { targetUrl: $('#replayUrl').value, delayMs: Number($('#replayDelay').value) }));
      state.replays.unshift(result.replay); state.tab = 'replays'; closeModal(); renderInspector(); notify(result.replay.ok ? `Replay succeeded · ${result.replay.status}` : 'Replay completed with an error');
    } catch (error) { showError(error); button.disabled = false; }
  });
}

function openClearModal() {
  modalFrame('Clear event history', 'This permanently removes all locally stored requests and replay records.', `<div class="warning-box">This action cannot be undone.</div><button class="danger-button wide" id="confirmClear">DELETE ALL EVENTS</button>`);
  $('#confirmClear').addEventListener('click', async () => {
    try { const result = await api('/api/events', { method: 'DELETE' }); state.events = []; state.selected = null; state.selectedId = null; closeModal(); renderEvents(); renderInspector(); await refreshMeta(); notify(`${result.deleted} events deleted`); } catch (error) { showError(error); }
  });
}

async function deleteSelected() {
  if (!state.selected) return;
  await api(`/api/events/${state.selected.id}`, { method: 'DELETE' });
  state.events = state.events.filter((item) => item.id !== state.selected.id); state.selected = null; state.selectedId = null;
  renderEvents(); renderInspector(); await refreshMeta(); notify('Event deleted');
}

function openSidebar() { elements.sidebar.classList.add('is-open'); elements.backdrop.classList.add('visible'); }
function closeSidebar() { elements.sidebar.classList.remove('is-open'); elements.backdrop.classList.remove('visible'); }
function showError(error) { console.error(error); notify(error instanceof Error ? error.message : 'Something went wrong'); }

async function init() {
  try {
    state.config = await api('/api/config');
    await Promise.all([refreshMeta(), loadEvents()]);
    renderChannels(); renderInspector();
  } catch (error) { showError(error); }

  if (!new URLSearchParams(location.search).has('screenshot')) {
    const stream = new EventSource('/api/stream');
    stream.addEventListener('open', () => { elements.liveIndicator.classList.add('is-live'); elements.liveIndicator.querySelector('span').textContent = 'LIVE'; });
    stream.addEventListener('error', () => { elements.liveIndicator.classList.remove('is-live'); elements.liveIndicator.querySelector('span').textContent = 'RECONNECTING'; });
    stream.addEventListener('webhook', async (message) => {
      const event = JSON.parse(message.data);
      if (eventMatches(event)) state.events = [event, ...state.events.filter((item) => item.id !== event.id)].slice(0, 200);
      state.selectedId = event.id; state.selected = event; state.replays = [];
      renderEvents(); renderInspector(); await refreshMeta();
    });
  } else {
    elements.liveIndicator.classList.add('is-live');
    elements.liveIndicator.querySelector('span').textContent = 'LIVE';
  }
}

$('#captureUrlButton').addEventListener('click', () => copy(captureUrl(), 'Capture URL copied'));
$('#testEventButton').addEventListener('click', openTestModal);
$('#refreshButton').addEventListener('click', () => loadEvents().catch(showError));
$('#clearButton').addEventListener('click', openClearModal);
$('#methodSelect').addEventListener('change', (event) => { state.method = event.target.value; loadEvents().catch(showError); });
let searchTimer;
$('#searchInput').addEventListener('input', (event) => { state.search = event.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(() => loadEvents().catch(showError), 180); });
$('#menuButton').addEventListener('click', openSidebar);
$('#closeSidebar').addEventListener('click', closeSidebar);
elements.backdrop.addEventListener('click', closeSidebar);

init();
