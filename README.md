<p align="center">
  <img src="docs/assets/webhookdock-banner.svg" width="100%" alt="WebhookDock — local-first webhook inspector and replay studio">
</p>

<p align="center">
  <strong>Capture. Inspect. Replay. Keep every payload on your machine.</strong>
</p>

<p align="center">
  <a href="https://github.com/richmanstudio/webhoockdock/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/richmanstudio/webhoockdock/ci.yml?style=flat-square&label=CI&color=B6FF00&labelColor=080808" alt="CI"></a>
  <img src="https://img.shields.io/badge/runtime-Node.js%2020%2B-B6FF00?style=flat-square&labelColor=080808" alt="Node.js 20+">
  <img src="https://img.shields.io/badge/runtime_dependencies-0-B6FF00?style=flat-square&labelColor=080808" alt="Zero runtime dependencies">
  <img src="https://img.shields.io/badge/license-MIT-B6FF00?style=flat-square&labelColor=080808" alt="MIT license">
</p>

WebhookDock is a **zero-dependency, local-first webhook inspector** for receiving HTTP events, reviewing exact payloads, validating signatures and replaying requests to another endpoint.

It runs as one Node.js process. There is no account, hosted database, telemetry service or required tunnel.

```bash
node src/server.mjs
```

<p align="center">
  <img src="docs/assets/dashboard-preview.svg" width="100%" alt="WebhookDock dashboard">
</p>

## Why WebhookDock

Most webhook debugging tools either send production-like payloads to a third-party cloud service or require a heavy local stack. WebhookDock keeps the core loop deliberately small:

```text
external service → /hooks/:channel → local store → inspector → replay
```

- **Private by default** — binds to `127.0.0.1` and stores data locally.
- **Zero runtime dependencies** — built with Node.js standard library APIs.
- **Immediate feedback** — new events appear through Server-Sent Events.
- **Safe persistence** — common authentication headers are redacted before storage.
- **Useful replay** — resend the original method, body and safe headers with optional delay.
- **Provider-aware** — verify GitHub, Stripe and generic HMAC signatures.
- **Portable** — run directly, in Docker, or through Docker Compose.

## Quick start

Requirements: **Node.js 20.9 or newer**.

```bash
git clone https://github.com/richmanstudio/webhoockdock.git
cd webhookdock
node src/server.mjs
```

Open:

```text
http://127.0.0.1:4400
```

Send the first event:

```bash
curl -X POST http://127.0.0.1:4400/hooks/payments \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer this-will-be-redacted' \
  -d '{
    "event": "payment.succeeded",
    "payment_id": "pay_8472",
    "amount": 12900,
    "currency": "USD"
  }'
```

The request appears in the dashboard immediately.

## Docker

```bash
docker compose up --build
```

Data is persisted in the `webhookdock-data` volume.

Direct Docker usage:

```bash
docker build -t webhookdock .
docker run --rm \
  -p 4400:4400 \
  -v webhookdock-data:/app/.data \
  webhookdock
```

## Core workflow

### 1. Use named channels

```text
/hooks/payments
/hooks/github
/hooks/telegram
/hooks/local-development
```

Every standard HTTP method is accepted. Channels can be filtered independently in the interface.

### 2. Inspect the complete event

WebhookDock stores:

- method and full request path;
- query parameters;
- content type and byte size;
- parsed JSON, form, text or binary payload;
- raw request body;
- redacted request headers;
- source IP and receive time;
- signature verification result.

### 3. Replay the request

Select an event, choose **Replay**, enter a target URL and optionally add latency.

```json
{
  "targetUrl": "http://localhost:3000/api/webhooks/payment",
  "delayMs": 750
}
```

WebhookDock records target status, response preview, duration and errors. Credentials stored as `[REDACTED]` are not forwarded.

### 4. Generate realistic test events

The dashboard can generate examples for:

- GitHub `push`;
- Stripe `payment_intent.succeeded`;
- Telegram bot updates;
- generic business events.

This makes the interface testable before connecting an external provider.

## Signature verification

Provide one or more secrets through environment variables:

```bash
WEBHOOKDOCK_GITHUB_SECRET=github-secret \
WEBHOOKDOCK_STRIPE_SECRET=whsec_example \
WEBHOOKDOCK_GENERIC_SECRET=generic-secret \
node src/server.mjs
```

Supported headers:

| Provider | Header | Algorithm |
| --- | --- | --- |
| GitHub | `x-hub-signature-256` | HMAC SHA-256 |
| Stripe | `stripe-signature` | timestamped HMAC SHA-256 |
| Generic | `x-webhook-signature` | HMAC SHA-256 |

Stripe timestamps older than five minutes are rejected.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `WEBHOOKDOCK_HOST` | `127.0.0.1` | Network interface to bind |
| `WEBHOOKDOCK_PORT` | `4400` | HTTP port |
| `WEBHOOKDOCK_DATA_PATH` | `.data/webhookdock.json` | Local data file |
| `WEBHOOKDOCK_MAX_BODY_BYTES` | `2097152` | Maximum captured body size |
| `WEBHOOKDOCK_RETENTION_LIMIT` | `5000` | Maximum stored events |
| `WEBHOOKDOCK_GITHUB_SECRET` | empty | GitHub signature secret |
| `WEBHOOKDOCK_STRIPE_SECRET` | empty | Stripe signing secret |
| `WEBHOOKDOCK_GENERIC_SECRET` | empty | Generic HMAC secret |

## Architecture

<p align="center">
  <img src="docs/assets/architecture.svg" width="100%" alt="WebhookDock architecture">
</p>

The server uses only built-in Node.js modules:

```text
src/
├── server.mjs       HTTP server, routes, static UI and SSE
├── store.mjs        atomic local JSON persistence
├── replay.mjs       safe request replay
├── signatures.mjs   HMAC verification
├── samples.mjs      provider test payloads
├── config.mjs       validated runtime configuration
└── utils.mjs        parsing, redaction and body limits

public/
├── index.html
├── app.js
└── styles.css
```

The local store writes through a temporary file and atomic rename, reducing the risk of a partial write after interruption.

## Security model

WebhookDock is a development tool, not an authenticated public webhook gateway.

- It listens on loopback by default.
- `authorization`, cookies, API keys and common auth headers are redacted.
- Replay omits credentials and transport-specific headers.
- Replay accepts only HTTP and HTTPS URLs.
- Known cloud metadata endpoints are blocked.
- Request body size is limited.
- No analytics or external network requests are made by the application.

Payload bodies can still contain sensitive information. Do not expose the service publicly without an authenticated reverse proxy. See [`SECURITY.md`](SECURITY.md).

## API

The complete endpoint reference is in [`docs/API.md`](docs/API.md).

Main endpoints:

```text
ANY    /hooks/:channel
GET    /api/events
GET    /api/events/:id
DELETE /api/events/:id
POST   /api/events/:id/replay
GET    /api/events/:id/replays
POST   /api/test-events
GET    /api/stream
```

## Testing

No dependency installation is required:

```bash
npm run check
```

The suite verifies:

- GitHub and generic HMAC handling;
- secret-safe verification output;
- persistence and retention;
- event deletion and replay cleanup;
- an end-to-end capture, inspection and replay flow against a real local server.

## Project status

Version `0.1.0` is a complete local MVP. It is ready for personal development workflows and open-source feedback. Planned work is tracked in [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Contributing

Contributions are welcome. Read [`CONTRIBUTING.md`](CONTRIBUTING.md) and run `npm run check` before opening a pull request.

## License

MIT. See [`LICENSE`](LICENSE).

---

<p align="center">
  <sub>Designed and engineered by <strong>DUONIQ</strong> · Two founders. One clear result.</sub>
</p>
