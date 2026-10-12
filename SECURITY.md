# Security Policy

## Supported Version

Security fixes currently target the latest `0.6.x` beta line.

## Report A Vulnerability

Use a private GitHub Security Advisory for the public repository. Do not open a public issue for an unpatched vulnerability. Include impact, reproduction steps, affected endpoint or file, and any suggested mitigation.

Do not include real OAuth tokens, Appwrite JWTs or API keys, legacy Firebase tokens, integration secrets, webhook secrets, D1 IDs, or private user data in a report.

## Security Boundaries

- Appwrite Auth identifies the account; the Worker verifies its short-lived JWT or a delegated OAuth bearer token for each request.
- Private state is isolated by Appwrite account ID in TablesDB and updated with revision checks and transactions. Browser clients never receive a server API key or direct table-write permission.
- Firebase rules protect retained legacy migration data; Firebase is not the current authentication or synchronization backend.
- Social data uses minimal public profiles in D1.
- Integration tokens are encrypted with AES-GCM and an operator-owned secret.
- Toggl Focus Personal API keys are accepted only by the authenticated web connection flow; REST and MCP responses never return them, and MCP clients cannot submit them.
- Focus timer stop or replacement requires the exact current entry ID to reduce cross-device timer mistakes.
- Party invite tokens are stored only as SHA-256 hashes and expire after seven days.
- MCP scopes separate read, write, social, battle, integration, webhook, and plugin capabilities.
- Plugin UI runs in sandboxed iframes and must not execute with the main app's authority.
- Battle execution uses `expectedTurn` and an idempotent `commandId`.

Rotate affected credentials immediately after any suspected disclosure.

## Launch, payment and recovery controls

Production publication requires named operator approval, a trusted Ed25519 signed source/evidence manifest and one shared Site/Worker/release lock. Evidence includes target commit/tree, hashes, timestamps and acceptance kinds; local tests cannot replace real OAuth/device/MCP/payment or elapsed observation. Keep the private signing key out of CI and restrict Environment trust-key/variable changes. Signed records do not prove human testimony truthful.

Billing/Jev default disabled, Stripe mode defaults test. Stripe API/signature, TypeSafe and billing-admin secrets never enter browser config/logs. Raw Stripe signature verification, deduplication, re-query, Test/Live separation and an idempotent ledger are required before sale. GitHub and Stripe webhooks use independent secrets. No Stripe age/guardian/identity requirement may be bypassed.

Deletion requires verified account control, an approved scoped inventory and retention decisions. Registered-email contact alone is not proof. [Launch operations](docs/launch-operations.md) supplies backup/isolated restore and rollback procedures; dry runs do not establish production recovery. Reapply deletion tombstones on restore, preserve unrelated data and mandatory financial records, and stop on uncertain target/environment identity.
