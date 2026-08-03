# Contributing to WebhookDock

WebhookDock is intentionally dependency-free. Contributions should preserve the one-command startup experience and keep all user data local by default.

## Local development

```bash
git clone https://github.com/richmanstudio/webhoockdock.git webhookdock
cd webhookdock
npm run dev
```

Open `http://127.0.0.1:4400`, then send a request:

```bash
curl -X POST http://127.0.0.1:4400/hooks/demo \
  -H 'content-type: application/json' \
  -d '{"hello":"world"}'
```

## Before opening a pull request

```bash
npm run check
```

The check must pass on Node.js 20 and 22. Add tests for changes to storage, signature verification, request capture, replay, or API behavior.

## Design rules

- No runtime npm dependencies without a strong technical reason.
- Local-first and private by default.
- Never log or persist authentication headers in clear text.
- Keep the interface usable at desktop and mobile widths.
- Prefer small, inspectable modules over framework-specific abstractions.
