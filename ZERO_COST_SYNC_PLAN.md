# QuestForge Zero-Cost Sync Plan

This project is designed to start at 0 yen.

## What is already prepared

- PWA shell:
  - `manifest.webmanifest`
  - `service-worker.js`
  - app icons under `assets/icons/`
- Storage abstraction:
  - current driver: `local`
  - future driver slot: `firebase`
- Static-hosting ready:
  - GitHub Pages, Cloudflare Pages, or Firebase Hosting can serve the current app.

## Recommended free stack

1. Host the static app for free:
   - GitHub Pages: easiest if the code is already on GitHub.
   - Cloudflare Pages: good free static hosting with `pages.dev`.
   - Firebase Hosting Spark: good if using Firebase for sync too.

2. Sync data for free:
   - Firebase Spark plan.
   - Firestore for `tasks`, `task_events`, and `profile_state`.
   - Firebase Auth anonymous sign-in first, Google sign-in later.

## User-owned setup required for Phase 3

Codex cannot create your personal Firebase project without your account.

You will need to:

1. Open Firebase Console.
2. Create a project.
3. Add a Web app.
4. Copy the Firebase config object.
5. Enable Authentication:
   - Start with Anonymous provider.
   - Add Google provider later if needed.
6. Create Firestore Database.
7. Start in test mode only for local testing, then replace with proper rules.

## Proposed Firestore collections

```text
users/{uid}
  profile_state/current
  tasks/{taskId}
  task_events/{eventId}
  sync_meta/current
```

## Sync rule

- Local edits create task events.
- The latest task snapshot is saved in `tasks`.
- `task_events` keeps a recoverable history for future conflict handling.
- First conflict policy: last-write-wins by `updatedAt`.
- Later conflict policy: event merge with device IDs.

## Next implementation step

After Firebase config is available:

1. Add `firebase-config.js` locally.
2. Enable the `firebase` storage driver.
3. Add sign-in state UI.
4. Migrate existing local tasks into Firestore once.
5. Subscribe to task changes for PC-phone sync.
