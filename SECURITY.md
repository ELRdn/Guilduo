# Security Policy

## Supported Version

Security fixes currently target the latest `0.3.x` beta line.

## Report A Vulnerability

Use a private GitHub Security Advisory for the public repository. Do not open a public issue for an unpatched vulnerability. Include impact, reproduction steps, affected endpoint or file, and any suggested mitigation.

Do not include real OAuth tokens, Firebase ID tokens, integration secrets, webhook secrets, D1 IDs, or private user data in a report.

## Security Boundaries

- Firebase rules isolate private state by authenticated UID.
- Worker endpoints verify Firebase or delegated OAuth bearer tokens.
- Social data uses minimal public profiles in D1.
- Integration tokens are encrypted with AES-GCM and an operator-owned secret.
- Party invite tokens are stored only as SHA-256 hashes and expire after seven days.
- MCP scopes separate read, write, social, battle, integration, webhook, and plugin capabilities.
- Plugin UI runs in sandboxed iframes and must not execute with the main app's authority.
- Battle execution uses `expectedTurn` and an idempotent `commandId`.

Rotate affected credentials immediately after any suspected disclosure.
