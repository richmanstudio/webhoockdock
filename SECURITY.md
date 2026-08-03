# Security Policy

## Supported versions

Security fixes are applied to the latest release on `main`.

## Reporting a vulnerability

Do not open a public issue for a vulnerability that could expose webhook payloads, secrets, or local network resources. Contact the maintainer privately through the email listed on the GitHub profile.

## Security model

WebhookDock binds to `127.0.0.1` by default. It automatically redacts common authentication headers before persistence and blocks known cloud metadata endpoints during replay.

Webhook payload bodies may contain sensitive data. The local data file is not encrypted. Protect the host filesystem and do not expose WebhookDock to an untrusted network without an authenticated reverse proxy.
