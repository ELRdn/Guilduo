# Native productivity workspace — local candidate, 2026-10-12

Home keeps the `command` identity. Desktop uses Home / Quests / Calendar / Notes / Party / Connections / More / Settings. Mobile uses Home / Quests / Calendar / Notes / More. Network, Battle and Skills remain available through More. Quests shares filters and selection across Board, List and Gantt; List is the initial view and the chosen view is remembered.

Notes are explicit-save plain text, independent of the 180-character Quest memo. Native time entries and the single running owner timer are independent of Quest completion/Handoff. Settings chooses native-first, Toggl-first or separate sources without changing legacy `actualMinutes`. Historical manual minutes are included without inventing dates; day/week reports use dated native records. The timezone preference controls reports/calendar; manual datetime controls explicitly label the device timezone.

Calendar starts in Month and also offers Week and Day. Empty-axis mouse drag, touch hold for 400 ms then drag, or arrows / Shift+arrows / Enter selects a quarter-hour range. Swiping before the hold continues ordinary scrolling. A preview opens a choice of recorded work or Quest scheduling, followed by explicit save. Future ranges offer scheduling only. Existing events are not moved/resized. Scheduling fills the common version-guarded Quest editor; unchanged planning/Handoff/assignee fields are preserved. Nonexistent DST wall times reject; repeated wall times currently choose the earlier offset.

## Storage and contracts

Migration `0016_productivity.sql` adds a private owner workspace and one rollout timestamp. Existing Appwrite states predating migration retain Toggl-first; new states start native-first. D1 is required. Notes and entries have independent versions inside the private workspace; one D1 revision CAS makes timer switching and operation receipts atomic. Ordinary writes are bounded at 900,000 bytes with another 100,000 reserved for timer stop; no existing records are silently truncated. Closed manual/restored entries span at most 366 days. Notes permit 50,000 Unicode code points; dates require real ISO instants with timezone.

Owner Web REST lives under `/v1/productivity`: paginated notes/entries, exact timer/start/stop, preferences, source totals, export/import, receipt reconciliation and confirmed deletion. OAuth/MCP access is refused; the existing 56 MCP tools remain unchanged. All responses are private/no-store. Existing Quest snapshots and their imports remain independent.

Export includes Notes, TimeEntries and preferences. Restore requires current revision and no currently running timer, preserves at most one exported running timer and advances existing record versions. Deletion removes private content/preferences and retains only content-free operation tombstones against late writes. Account-deletion operators must also remove the owner row from `productivity_workspaces`; the singleton rollout row contains no owner data.

## Local acceptance and publication

Evidence is in ignored `.qa-artifacts/productivity-*` files. Unit/REST checks use real SQLite with the D1 interface and isolated credentials; browser checks use the real Worker through an isolated HTTP fixture. This establishes local behavior, not live Appwrite/OAuth, physical Pixel 9 or screen-reader acceptance.

Final local checks: full tests 715/715, productivity tests 8/8, complete typecheck, design check, build, API generator idempotence and diff check passed. `.qa-artifacts/productivity-acceptance.json` records source hashes and pending production gates; it is local evidence, not a signed release candidate. `.qa-artifacts/productivity-calendar-locales.json` records Day layout and five visible mobile destinations across all nine locales.

Browser checks include mouse selection and saved 60-minute record, keyboard selection into the future Quest editor, zero-estimate schedule preservation, timer switching/navigation/stop, long Notes and archive/restore, entry archive/restore, exported file contents and confirmed delete/file restore. The existing response-loss fixture also verified reconciliation without duplicate creation and retained later edits. All nine locales were checked at mobile width. Touch hold/scroll/cancel/disposal is exercised by the actual selection code in the existing VM test pattern; the connected in-app browser rejects native touch dispatch, so physical touch acceptance remains pending.

The bounded owner JSON workspace includes operation receipts in its capacity budget. Archiving preserves records and does not reclaim space. At capacity, export before confirmed work-data deletion; broad long-term/high-volume use needs a separately reviewed normalized storage expansion. Capacity rejection never truncates existing data, and timer stop has reserved headroom.

Before publication, review the existing dirty changes, create the reviewed target SHA/tree through separately scoped Git integration, pass the normal candidate/CI gates, and produce the signed deploy-scope evidence required by `RELEASE_SETUP.md` and `docs/launch-operations.md`. Add the exact hash of migration 0016 to the reviewed baseline→target migration manifest. Apply approved additive D1 migrations before the Worker, verify active Worker/source and private routes, then activate Site with the existing cache and retained-asset procedure. Keep the previous Worker/Site versions for rollback; do not drop the new tables during rollback.

No commit, push, remote migration, production deployment or live account change is performed by this local implementation. The current HEAD does not identify this dirty candidate; old launch evidence must not be reused as approval for these changes.
