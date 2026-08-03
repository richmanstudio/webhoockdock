# WebhookDock HTTP API

The API is intentionally small and uses JSON responses. By default it is available at `http://127.0.0.1:4400`.

## Capture requests

```http
ANY /hooks/:channel
```

`channel` must contain only letters, numbers, underscores and hyphens. The complete request body, query string and redacted headers are stored locally.

Example:

```bash
curl -X POST http://127.0.0.1:4400/hooks/payments \
  -H 'content-type: application/json' \
  -d '{"event":"payment.succeeded","amount":12900}'
```

Response:

```json
{
  "accepted": true,
  "id": "4a297c42-5ab2-4be9-b12f-b01865b612d7",
  "channel": "payments"
}
```

## Events

### List events

```http
GET /api/events?channel=payments&method=POST&search=succeeded&limit=100&offset=0
```

### Read one event

```http
GET /api/events/:id
```

### Delete one event

```http
DELETE /api/events/:id
```

### Clear all events

```http
DELETE /api/events
```

## Replay

```http
POST /api/events/:id/replay
Content-Type: application/json
```

```json
{
  "targetUrl": "http://localhost:3000/webhooks/payment",
  "delayMs": 500,
  "headers": {
    "x-debug-mode": "true"
  }
}
```

The original method and body are used unless `method` is supplied. Authentication headers are never replayed automatically. Known cloud metadata endpoints are blocked.

### Replay history

```http
GET /api/events/:id/replays
```

## Test events

```http
POST /api/test-events
Content-Type: application/json
```

```json
{
  "channel": "payments",
  "provider": "stripe"
}
```

Supported providers: `github`, `stripe`, `telegram`, `generic`.

## Runtime information

```http
GET /health
GET /api/config
GET /api/stats
GET /api/channels
GET /api/stream
```

`/api/stream` is a Server-Sent Events endpoint used by the dashboard for real-time updates.
