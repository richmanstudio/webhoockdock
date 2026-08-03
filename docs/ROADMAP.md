# Roadmap

WebhookDock 0.1 focuses on a private, local and dependency-free webhook debugging loop.

## Planned

- Export selected events as reusable test fixtures.
- Import fixtures back into the event timeline.
- Configurable response status and latency per channel.
- Request transformations before replay.
- Delivery retry schedules and batch replay.
- Optional encrypted local storage.
- Provider presets for Shopify, Slack, Discord and YooKassa.
- A tunnel adapter interface without coupling the core to one tunnel vendor.

## Non-goals

- Mandatory cloud accounts.
- Hosted payload storage.
- Analytics tracking inside the application.
- A large plugin framework before the core workflow is stable.
