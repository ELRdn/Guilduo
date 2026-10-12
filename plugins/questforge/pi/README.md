# Guilduo optional Pi phase reminder

Targets **Pi 1.0.4**, `@earendil-works/pi-coding-agent`, Node 22.19+.
The locally installed Pi reports **0.85.1**; it is outside this target and does not establish host acceptance. Its global installation/settings were not changed.
`phase-sync.ts` is an optional local extension. The basic MCP + Workflow Skill works without it.
It adds one phase-check reminder at the final continuation boundary; it never performs a Quest update.

## Install and connect

Use the generated Guilduo Pi package with `pi install <local-package-directory>`, or try this extension alone:

```text
pi -e <absolute-path-to-phase-sync.ts>
```

Configure Guilduo's OAuth remote MCP at `https://mcp.guilduo.com/mcp` in Pi's native user/project MCP settings.
Keep existing MCP settings. Authenticate using Pi's native OAuth flow; never copy credentials from another host.
Install the common `guilduo-workflows` Skill through the Guilduo Pi package; this standalone extension does not install it or configure MCP.

See the pinned native [MCP guide](https://github.com/earendil-works/pi/blob/v1.0.4/packages/coding-agent/docs/mcp.md)
and [package guide](https://github.com/earendil-works/pi/blob/v1.0.4/packages/coding-agent/docs/packages.md).

## Bind only after permission and identity verification

1. Obtain explicit standing permission for progress writes to the **exact Quest and registered Agent**.
2. Follow the common Skill: inspect `get_current_agent_context({ actingAgentId })` and `get_quest` with that Agent; verify identity, scopes and Quest access.
3. In the idle, trusted interactive Pi session, enter `/guilduo-sync` to display the exact session ID and canonical cwd in a literal JSON argument array.
4. Replace only the two verified ID placeholders and run the displayed `/guilduo-sync bind [...]` command. JSON quoting supports spaces and Windows paths; backslashes inside JSON strings must be escaped.
5. The next genuine interactive input arms at most one check. Binding itself never starts a run or grants permission.

```text
/guilduo-sync bind ["<exact-session-id>","<verified-quest-id>","<verified-agent-id>","D:\\canonical\\workspace"]
/guilduo-sync off
```

`off`, `unbind`, `readonly`, and `plan` disable reminders and clear the binding.
Use one before withdrawing permission, entering Plan Mode/read-only work, changing targets or disabling MCP access.
Re-enabling requires another verified `bind`; there is no automatic `on`.

The reminder asks the model to recheck permission and use fresh Agent/Quest reads, a narrow patch with `expectedUpdatedAt`,
no-op detection and read-after-write. Conflicts/uncertain responses require fresh reads. Completion, Human approval,
scoring and rewards stay separate. Host approval screens still apply.

## Lifecycle and storage

- Only `input` with `source: "interactive"` in trusted TUI mode grants a budget. RPC, print/JSON mode, extension input and `agent_start` never grant one.
- `agent_before_settle` consumes and persists the receipt **before** proposing one continuation. Aborted/error outcomes or an aborted signal consume the budget without a reminder.
- The extension appends only its binding and random turn receipts as `guilduo-phase-sync-v1` custom session metadata. It does not inspect message content, tokens, model output or boundary context, use network calls, or write MCP data.
- Reload/startup may restore a matching binding from this metadata, but never restore an input budget. Explicit resume/new/fork and any tree navigation clear the binding. Unknown/mismatched metadata, session ID or canonical cwd, untrusted projects and storage failure disable reminders. Rebind after verifying the new scope.
- Removal: use `off`, then remove the optional extension or uninstall its local package. Existing MCP configuration and OAuth credentials stay with Pi. Old custom metadata remains in the native session and is not a credential or grant of authority.

## Verified boundaries and remaining acceptance

The implementation uses a small structural subset of the pinned [native event API](https://github.com/earendil-works/pi/blob/v1.0.4/packages/coding-agent/src/core/extensions/types.ts),
so it needs no SDK runtime import or root dependency. Native boundary entries are preserved when appending the reminder.
Its factory's assignability to the native `ExtensionAPI` was type-checked against the isolated npm tarball
`@earendil-works/pi-coding-agent@1.0.4` (`dist/core/extensions/types.d.ts`, strict TypeScript with declaration checking skipped).
This verifies the API signatures used here; it is not execution inside the host.
`tests/plugin-pi.test.ts` mocks that API and covers one-check recursion, genuine input, reload/resume/fork/tree/cwd,
revocation, abort/error, untrusted/noninteractive execution and storage failure.

Pi 1.0.4 exposes **no universal Plan Mode/read-only flag** in this event context. Such modes require the explicit
`plan`/`readonly`/`off` command and the Skill's permission checks. Input authenticity relies on Pi's source labeling;
this extension cannot independently prove that another trusted component did not impersonate interactive input.
Other extensions can veto or replace boundary entries. A consumed receipt is not proof that a reminder was shown,
that a phase changed, or that progress was saved.

An isolated genuine Pi 1.0.4 runtime passed native installation, Skill/Extension discovery, local update,
resource-filter disable and removal on 2026-10-06. Local HTTP discovery and OAuth metadata discovery also passed;
no public OAuth login or model inference was invoked. Reproduce with `npx tsx tools/verify-guilduo-pi-host.mts`
after preparing its isolated runtime. Six mock tests include rejecting restored receipts for a different binding.
The current generated tgz is verified without modification. Seven bounded native-engine checks exercise
AgentSession settlement/continuation, saved trust, disk reopen, reload and fork with fixed local provider
responses. They make zero inference requests or Quest writes; selecting native TUI mode in the fixture
does not establish a person's TUI interaction or acceptance of a real trust prompt.
Actual public OAuth, phase sync, interactive interruption/restart and the Human Web roundtrip
remain separate acceptance gates. The extension may cause one additional model
request per eligible input. It grants no guarantee of proactive invocation or successful synchronization.

Run locally:

```text
npx tsx --test tests/plugin-pi.test.ts
```
