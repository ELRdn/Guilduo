# Phase-End Progress Sync

Use this procedure while continuing an authorized existing Guilduo Quest. Record actual phase results through existing MCP tools; this procedure adds no server API or automatic host trigger.

## Standing Permission And Identity

- Standing permission means the user authorized ongoing progress writes for this exact Quest and known registered Agent. Retain the established Quest ID, Agent ID, and scope from trusted task context. A request to continue implementation alone, plugin installation, OAuth access, or Skill activation does not establish permission to write progress into Guilduo.
- Explicit user instructions take priority. Read-only, pause, stop-sync, and narrowed scope requests limit or revoke the relevant permission. Do not ask again for an unchanged authorized phase update; ask only when a necessary identity or decision is missing or the action exceeds that scope.
- Read `get_current_agent_context` and `get_quest` before syncing. Check the selected Agent is active, matches the authorized identity, has the required effective execution scopes, and can act on this Quest. Do not reassign the Quest or expand permissions to make a write work.
- On a shared connection, supply the same known authorized `actingAgentId` on **every call**, including context reads, Quest reads, previews, writes, verification, and retries. Verify it with `get_current_agent_context({ actingAgentId })` and the returned `allowedAgentIds`. Never use `link_agent` to switch a shared connection or infer identity from a client name. If identity is not established, discovery may inspect context without selection; establish the allowed Agent before any execution.

## When To Sync

Sync after a meaningful implementation phase, verification result, newly established blocker, or change in next action, before reporting that phase or handing off. A conversation turn, file edit, session start, or session stop alone does not prove progress. Coalesce changes for the same phase; an identical result needs no new write.

Separate implemented work, freshly verified checks, remaining acceptance criteria, and blockers. Never describe planned or unrun checks as passed, fabricate work or evidence links, or treat a local test as release approval. If MCP is unavailable or scopes are insufficient, retain the verified summary in the current task, report that sync is pending, and continue independent authorized work. Do not claim persistence.

## Narrow Progress Patch

1. Read the exact Quest with `get_quest`; retain its current `updatedAt`, notes, Handoff, links, and flags. Inspect the live tool schema before choosing fields.
2. Build only the progress fields that actually changed:

   | Field | Limit | Content |
   | --- | --- | --- |
   | `nextAction` | 180 characters | The next concrete action, including any prerequisite or human decision needed |
   | `handoff.note` | 500 characters total | Concise phase result, checks actually run and their outcomes, real blocker or none, and next step |

3. Preserve prior notes and links. Leave the Quest's original `notes` untouched. For `handoff.note`, append a short phase entry to existing content, or update only an unambiguously identified latest phase-sync entry previously written by this workflow; preserve all other original content and prior phase notes. Preserve `artifactUrl`, external links, review metadata, and flags; omit unchanged fields from the patch. Do not send a full Quest snapshot. If preserved note plus new entry exceeds 500 characters, shorten only the new entry. If it still cannot fit, omit `handoff.note`, update a changed `nextAction` if possible, and report the unsaved detail; never truncate unrelated original notes to make room.
4. Compare the intended result with the fresh Quest. If current content already records the same phase, verified result, blocker, and next action, do nothing. Do not append duplicates or introduce timestamps merely to force a change. Send only changed fields, not empty placeholders.
5. Call `update_quest` with `questId`, the latest `expectedUpdatedAt`, and the narrow patch (`nextAction` and/or `handoff: { note }`), plus `actingAgentId` for a shared connection. **Do not pass `dryRun`: this tool does not support it.** It merges the supplied Handoff fields; omit unrelated fields to retain their current values. Ordinary progress must not alter assignment, planning, completion, lifecycle, Handoff state, scoring, rewards, or human responses.
6. Read `get_quest` again to verify persistence before claiming the phase is synced. If only part was recorded, say which part; a successful preview is not a saved update.

## Uncertain Writes And Conflicts

- After a timeout, disconnect, or other ambiguous/failed write, fresh-read the Quest before retrying. If the desired content is already present, the write is a no-op; do not repeat it. If the read fails, leave sync pending rather than writing blindly.
- On `409`, never drop `expectedUpdatedAt`, reuse the stale timestamp, or overwrite newer work. Re-read, preserve the newer notes and links, and recompute the smallest authorized patch with the new timestamp. Retry only if it still expresses the same permitted intent without replacing another person's next action or progress. If intent conflicts or conflicts persist, report the pending update and the needed decision.
- Apply the same fresh-read rule to Handoff transitions. An uncertain response never proves a state change or completion.

## Handoff And Completion Are Separate

- Progress sync alone does not authorize a Handoff transition. When the user has authorized the transition, use `transition_quest_handoff` for `working`, `blocked`, or `review_required` as appropriate; do not change state through the progress patch. Preserve prior notes and links using the same note budget. Leave an unchanged `artifactUrl` out; supply a new HTTPS evidence link only when it exists and is within scope.
- Read the current state, preview with `dryRun: true`, inspect the preview, then execute with `dryRun: false` and `expectedState` from the fresh Quest. Use the same `actingAgentId` throughout on a shared connection. If the state or relevant content changes after preview, re-read and preview again. `expectedState` guards the state, not concurrent note edits: keep transition metadata minimal and verify the saved result.
- Only report `blocked` for an established obstacle; only request review when work is actually ready for the required review. Preserve review requirements and human-owned decisions. A phase ending does not make the Handoff `accepted`.
- Quest completion is a separate, explicitly authorized operation after the Quest's own completion criteria are verified. Do not call `score_quest`, set completion flags or `accepted`, or grant/spend rewards merely because implementation or a phase finished. Child completion, review requests, and passing tests do not complete the original Quest or its parent automatically. Follow the existing Human review flow when approval is required.

## Host Lifecycle Assistance

The canonical workflow is shared across hosts. Skills provide best-effort initiative; host selection metadata does not guarantee invocation. Optional hooks or a Pi Extension prompt this check without reading credentials, transcripts or directly changing MCP data. Read the host package's setup and [local-hooks.md](local-hooks.md) before using filesystem bindings; Pi has separate commands and session receipts.

Plan Mode, read-only work, missing binding, and revoked permission never authorize writes. A reminder permits at most one check per original external user input. Resume/fork/cwd changes must recheck the exact session, Quest and Agent; never borrow another session's binding. Host tool confirmation remains independent of standing permission. Do not falsify annotations to suppress confirmation.
