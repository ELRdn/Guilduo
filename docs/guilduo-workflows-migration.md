# Guilduo Workflow Skill migration

Approved October 10, 2026. The canonical Skill is `guilduo-workflows`, maintained in [`skills/guilduo-workflows/`](../skills/guilduo-workflows/). The approved rename replaces only `questforge-workflows` Skill names, directories and invocations. OAuth, MCP, package, plugin, storage, API and existing technical identifiers remain unchanged.

## Update an existing installation

1. Update the host plugin, restart the host, then confirm that only the new bundled `guilduo-workflows` Skill is discovered.
2. If a legacy standalone `questforge-workflows` Skill is also installed, the owner must remove or replace that standalone copy. The plugin does not delete user-owned Skills or rewrite real host configuration.
3. Preserve unrelated plugins, MCP aliases, native credentials and grants. Installing a Skill is not permission to update Quests.

DSH beta.16 is already published; follow its [English guide](guilduo-dsh-howto.md) or [日本語ガイド](guilduo-dsh-howto.jp.md). Its current acceptance limits remain in the [DSH status](guilduo-dsh-status.md).

OpenCode and OpenClaw beta.16 build on the unpublished beta.15 candidates. Follow the host's [release status](guilduo-host-extensions-status.md), [OpenCode guide](../plugins/guilduo-opencode/README.md) or [OpenClaw guide](../plugins/guilduo-openclaw/README.md); do not infer publication from a candidate version in source.

## Historical evidence

The old beta.14/beta.15 archives, old Skill discovery results and their immutable hashes remain historical evidence. Their local receipts stay outside the public package. Renaming the Skill or passing synthetic OAuth does not close public OAuth, guarded writes, Human feedback or Agent resumption acceptance. New beta.16 results are recorded separately in the [OpenCode](guilduo-opencode-native-evidence.md) and [OpenClaw](guilduo-openclaw-native-evidence.md) evidence documents.
