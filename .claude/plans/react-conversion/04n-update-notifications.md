# 04n — Update notifications

Roadmap: [04-parity.md](04-parity.md). Previous items: 04o (banner queue + notification store), 05a (`app:get-update-status`).

## Goal

v5 reaches parity with v4's update flow: check (startup + Help → Check for Update + update-channel change), "update available" with the version and channel, download with progress, install, errors with an "Update manually" fallback, and restoring the state after a UI switch. Fix the main-process problems both UIs share along the way.

## How v4 works today (for reference)

- `main.js:470-485`: on the first `did-finish-load`, if `general.checkForUpdates` is on, `runUpdateCheck()` runs after `STARTUP_UPDATE_CHECK_DELAY_MS` (3 s). Also called from the menu (`main.js:336`, `CheckForUpdate`) and after `general.updateChannel` changes (`main.js:514-529`).
- `main.js:1113-1198`: `runUpdateCheck`, `sendUpdateEvent`, `lastUpdateEvent` / `KEPT_UPDATE_EVENTS`, `addAutoUpdaterListeners`. Renderer channels: `checking-for-updates`, `update-ready` `{ version, currentVersion, channel, releaseName }`, `update-not-available`, `update-error` (raw `Error`), `update-progress` (progressObj), `update-downloaded`.
- `main/handlers/updateHandler.js`: `update:check`, `update:install` (sends `update-downloading`, `downloadUpdate()`, then `quitAndInstall()`), `update:open-release-page`.
- `main/services/autoUpdaterService.js`: lazy `electron-updater`, `autoDownload = false`, `autoInstallOnAppQuit = false`, channel applied on load.
- `renderer/js/services/updateService.js` + `renderer/index.html:18-63`: one bar per state. The first-run "Automatically check?" bar (`first-update-wrapper`, `navigationService.js:926`) only shows when the pref is `undefined`, which never happens (preferencesStore merges the `[true]` default), so it is unreachable.

## Problems found (both UIs, all in main)

1. **Unsaved edits are lost on install.** `update:install` runs `quitAndInstall()` right after the download. Nothing checks for unsaved changes.
2. **Stale restore status.** `update-downloading` and download errors are sent with `loggedMain.send`, not through `sendUpdateEvent`, so `lastUpdateEvent` stays `update-ready`. A UI switch made right after clicking Update shows "Update available" again.
3. **No in-flight guard.** A second `update:install` (double click, v4 bar + v5 drawer, a restored banner) starts a second `downloadUpdate()`.
4. **The `error` event sends a raw `Error`**, which loses its fields over IPC. The renderer can't tell whether a check or a download failed.
5. **`checkForUpdatesAndNotify()`** in production can also show a native Windows toast. That duplicates the in-app UI.
6. **Noisy startup** (v5 only, by decision): v4 shows "Checking…" and "No updates" on every launch.

## Decisions (from review)

| # | Decision |
|---|---|
| D1 | v5 shows update state as **banners plus a Home drawer entry** (`kind: 'update-available'` in main's notification store), so a dismissed or timed-out banner isn't lost. |
| D2 | **Unsaved-changes prompt in main** before the download starts: *Save and install* / *Install without saving* / *Cancel*. Both UIs get it. |
| D3 | **Keep download-then-quit** (no "Restart later"). |
| D4 | **Automatic checks are quiet in v5 only**: no "Checking…" / "No updates" banners. v4 keeps showing them. Main tags each check `{ manual }`. Checks from the menu and from a channel change count as manual. |
| D5 | **Errors from automatic checks are silent in v5** (logged only). Manual-check errors and download/install errors show the red banner with *Update manually*. |
| D6 | **Don't port the first-run "Automatically check?" bar.** It is unreachable in v4, and the Settings wizard covers the question. v4 code is left as is. |
| D7 | **No extras** (no release-notes link, no skip-version, no progress in the drawer). Only Dismiss / Update, as in v4. |
| D8 | **Banner durations:** "Update available" uses the default 8 s (pauses on hover/focus; the drawer keeps it). "Checking…", "Downloading x%" and "Installing…" are sticky (`Infinity`). "No updates" lasts 3.5 s (v4). A manual-check error lasts 8 s. A download/install error is sticky. |
| D9 | (my call) Use `checkForUpdates()` in production too, which drops the native toast (problem 5). This affects v4. |

## Phases

Phases 1–3 are main/preload only and keep v4 working. Phase 4 is the React UI. Phase 5 adds the e2e specs and docs. **E2E runs only in phase 5.** Each earlier phase is verified with unit tests or vitest plus a quick manual check.

---

### Phase 1 — Update controller in main

**Status: committed (42e02de).**

Move the updater state out of `main.js` into a unit-testable module.

**New `main/services/updateController.js`**

```
createUpdateController({
  getAutoUpdater,          // autoUpdaterService.getAutoUpdater
  isUpdaterLoaded,         // autoUpdaterService.isLoaded
  send,                    // (channel, data?) => loggedMain.send
  getVersion,              // app.getVersion
  prepareInstall,          // async () => boolean  (phase 2; default: () => true)
  onUpdateAvailable,       // (info) => void        (phase 3; default no-op)
  onNoUpdate,              // () => void            (phase 3; default no-op)
}) -> {
  attach(autoUpdater),     // registered via autoUpdaterService.onCreate
  check({ manual }),       // replaces runUpdateCheck
  install(),               // replaces update:install's body
  getStatus(),             // replaces lastUpdateEvent for app:get-update-status
}
```

- State: `phase: 'idle' | 'checking' | 'preparing' | 'downloading' | 'downloaded'`, and `checkManual` (OR'd while a check runs, so a manual check during an automatic one still reports "no updates").
- Every renderer event goes through one `emit(channel, data)`, which also updates the kept status (fixes problem 2). The kept set adds `update-downloading`. `checking-for-updates` / `update-not-available` still clear it.
- Payload changes (additive, so v4 still reads them):
  - `checking-for-updates` → `{ manual }`
  - `update-not-available` → `{ manual }`
  - `update-ready` → unchanged fields plus `manual`
  - `update-error` → `{ message, manual, phase: 'check' | 'download' }`. It is always a plain object (fixes problem 4). The updater's `error` event maps `phase` from the controller state.
  - `update-downloading`, `update-progress` (progressObj), `update-downloaded` unchanged.
- Guards (problem 3):
  - `install()` while `preparing`/`downloading`/`downloaded` does nothing.
  - `check()` while downloading doesn't start a check. If manual, it re-emits the kept status so the UI shows the download again.
  - `install()` with no update offered (`phase` was never past a check with `update-available`) emits `update-error` `{ phase: 'download' }`.
- `check()` always calls `autoUpdater.checkForUpdates()` (D9) and catches both sync throws and rejections, as `runUpdateCheck` does now.
- `install()`: `phase = 'preparing'`. `if (!(await prepareInstall())) { phase = back to offered; return; }`. Then emit `update-downloading`, `downloadUpdate()`, emit `update-downloaded` (from the updater event), then `quitAndInstall()`. On failure, emit the error and return to the "offered" phase so the user can retry.

**Edits**
- `main.js`: delete `runUpdateCheck`, `lastUpdateEvent`, `KEPT_UPDATE_EVENTS`, `sendUpdateEvent`, `addAutoUpdaterListeners` (`1113-1198`). Create the controller near the other services. `autoUpdaterService.onCreate(controller.attach)`. Startup → `check({ manual: false })`. Menu `CheckForUpdate` and the `updateChannel` change → `check({ manual: true })`. `app:get-update-status` → `controller.getStatus()`.
- `main.js`: `STARTUP_UPDATE_CHECK_DELAY_MS` reads `MFE_UPDATE_CHECK_DELAY_MS` when `NODE_ENV === 'testing'` (for the phase 5 specs).
- `main/handlers/updateHandler.js`: the signature becomes `registerUpdateHandlers(loggedIpc, controller, { getReleasePageUrl, getUpdateChannel })`. `update:check` → `controller.check({ manual: true })`. `update:install` → `controller.install()`. `update:open-release-page` is unchanged.
- **Fake updater for tests:** new `main/services/fakeAutoUpdater.js`, an `EventEmitter` with `checkForUpdates`, `downloadUpdate`, `quitAndInstall`, and `allowPrerelease`/`allowDowngrade`/`autoDownload`/`autoInstallOnAppQuit` fields. Its behavior comes from `globalThis.__fakeUpdater = { next: null | { version } | { error }, downloadError?, checks: 0, downloads: 0, installs: 0 }`. `quitAndInstall` only counts and does not quit. `autoUpdaterService.getAutoUpdater()` returns it when `NODE_ENV === 'testing'`, so tests never hit the network.

**Edge cases**
- The updater isn't loaded before the first check. `getStatus()` returns `null`.
- An `error` event that arrives while the controller is `idle` (the updater emits errors after a rejected promise too) must not be sent twice for the same failure. Dedupe on the rejection path: the event handler sends, and `.catch` only logs unless no event was sent.
- `update-ready` channel detection (`/-nightly\./`) moves as is.

**Verification**
- New `tests/unit/updateController.test.js` (node:test, the fake updater or an inline EventEmitter):
  - manual/auto flags on every event, and OR'ing for overlapping checks
  - the status kept for each event, including `update-downloading`
  - a second `install()` is ignored, and a `check()` during a download re-emits the status
  - error payload shape and phase for check vs download
  - `prepareInstall` returning false stops before `downloadUpdate`
- `npm run test:unit`. Manual: `npm run dev` (v4). Help → Check for Update shows v4's checking bar, then the dev-mode error bar, as today.

---

### Phase 2 — Unsaved-changes prompt before install (D2)

**Status: done, uncommitted.**

**New `main/services/updateInstallGuard.js`**

```
createInstallGuard({ franchiseFileManager, getDialog, getWindow, hasPendingFileChange })
  -> async prepareInstall(): Promise<boolean>
```

- For each `franchiseFileManager.activeFiles` id, call `hasUnsavedChanges(id)`. It already waits for queued writes and saves.
- If none are dirty, return `true` without a prompt.
- Otherwise call `getDialog().showMessageBox(getWindow(), …)`. Look up `dialog.showMessageBox` at call time so `dialogStubs.stubMessageBox` works. Buttons: `Save and install` (default), `Install without saving`, `Cancel` (`cancelId`). If `hasPendingFileChange(id)` (a `file-changed` notification exists for that file), add a detail line: "The file was changed outside the editor; saving overwrites those changes."
- *Save*: `await franchiseFileManager.saveFile(id)` for each dirty file. If any save fails, show an error box and return `false`.
- *Install without saving* → `true`. *Cancel* → `false`.
- `main.js` passes `prepareInstall: guard.prepareInstall` to the controller. `hasPendingFileChange` reads `notificationStore`, as `setAutoSavePausedCheck` does.

**Edge cases**
- Auto-save is on and a save is queued. `hasUnsavedChanges` waits for it, so the result is accurate.
- The window is gone: `getWindow()` is `null`. Show the message box without a parent.
- v4: on Cancel, v4's "Update available" bar is still visible (its click handler doesn't hide it until `update-downloading` arrives). That's acceptable, and the user can click Update again.

**Verification**
- New `tests/unit/updateInstallGuard.test.js`: clean → true with no dialog; dirty + each of the three buttons; save failure → false; the file-changed detail line. Stub the manager and dialog.
- `npm run test:unit`.

---

### Phase 3 — Drawer notification and preload subscription (D1)

**Status: done, uncommitted.** The phase 4 "Drawer" bullets (describe case, `useNotificationBanners` skip, the drawer's `install-update` link, and their vitest) were pulled into this phase: adding the union member breaks those exhaustive switches, and main now sends the entry. `onUpdateAvailable` receives `{ version, currentVersion, channel }` (the controller computes the channel), not the raw updater info.

**Notification store**
- `src/shared/types/notifications.ts`: add `UpdateAvailableData { version: string; currentVersion: string; channel: 'stable' | 'nightly' }` and the union member `kind: 'update-available'` (no `fileId`).
- `main/services/notificationStore.js` `sameTarget`: kinds with neither a `fileId` nor a `data.path` are singletons, so the same kind is the same target. Today `samePath(undefined, undefined)` is `false`, so a second update check would add a duplicate.
- `main.js` controller deps: `onUpdateAvailable(info)` → `notificationStore.add({ kind: 'update-available', data })`. `onNoUpdate()` → `removeWhere(n => n.kind === 'update-available')`. The entry is **not** removed when the install starts, so a failed download can be retried from the drawer. A successful install quits the app anyway.
- Unread: the entry counts toward the Home bell badge like other kinds. Nothing special.

**Preload**
- `preload/franchisePreload.js` `electronAPI.update`: add `onStatus(callback) => unsubscribe`. It uses the existing `subscribe` helper on each of the 8 update channels and calls `callback({ channel, data })`. The channels are unchanged, so v4 is unaffected.
- `src/renderer/src/preload.d.ts`: declare `electronAPI.update: { check(): void; install(): void; openReleasePage(): Promise<void>; onStatus(cb): () => void }`. Type `getUpdateStatus` with a new `UpdateStatus` union from `src/shared/types/update.ts`. That union covers each channel and its payload as defined in phase 1.

**Verification**
- Extend `tests/unit/notificationStore.test.js`: adding `update-available` twice keeps one entry. File kinds still dedupe by fileId/path.
- Extend `updateController.test.js`: `onUpdateAvailable` / `onNoUpdate` are called.
- `npm run test:unit`, `npm run typecheck`.

---

### Phase 4 — React UI

**Status: committed.** `isRestored` lives next to `updateBannerFor` in `updateBanner.ts`. Closing a sticky download banner with X only lasts until the next progress event re-shows it.

**New `src/renderer/src/updates/useUpdateBanners.ts`**, mounted from `Layout.tsx` next to `NotificationBanners` (inside `BannerProvider`, as a sibling `<UpdateBanners />` component).
- Subscribes with `electronAPI.update.onStatus`. Every banner uses one `key: 'update'`, so each state replaces the last one in place (`BannerContext.show` with the same key). `kind: 'update'` for `data-kind`.
- A pure function `updateBannerFor(status): BannerOptions | null` in `src/renderer/src/updates/updateBanner.ts` maps a status to a banner. That keeps the branching testable.

| Status | Banner |
|---|---|
| `checking-for-updates`, manual | info, "Checking for updates…", sticky, no actions |
| `checking-for-updates`, auto | none |
| `update-ready` | info, "{Version \| Nightly build} X is available (you have Y). It will take less than 5 minutes to install." (v4 text), 8 s; actions Dismiss / **Update** → `update.install()` |
| `update-not-available`, manual | success, "There are no updates available, you are running the latest version." (fixes v4's "verison"), 3.5 s |
| `update-not-available`, auto | hide the `update` banner if one is shown, otherwise none |
| `update-downloading` | info, "Downloading… 0%", sticky, no actions |
| `update-progress` | same banner, `percent.toFixed(0)`% |
| `update-downloaded` | info, "Installing…", sticky |
| `update-error`, `phase: 'check'`, auto | none (`console.warn`) |
| `update-error`, manual check | error, "There was an unexpected error when trying to update.", 8 s; Dismiss / **Update manually** → `update.openReleasePage()` |
| `update-error`, `phase: 'download'` | same text and actions, sticky |

- Hide the close (X) button on the sticky progress banners? No. The Banner always has one, and closing it only hides the view while main keeps going. That's acceptable, so `Banner.tsx` is not changed.
- Unsupported payloads (an older main or a missing `manual`) count as manual, which errs toward showing the banner.
- **Restore on mount:** `getUpdateStatus()` once, then `updateBannerFor` for `update-downloading`, `-progress`, `-downloaded`, `-error`. Skip `update-ready`: the drawer entry carries it, and notifications that exist at mount get no banner (the 04o rule). Ignore the result if an `onStatus` event already arrived (the same `active` pattern as `useNotifications`).
- StrictMode double mount: the unsubscribe from `onStatus` handles it.

**Drawer** (done in phase 3)
- `src/renderer/src/notifications/describe.ts`: add `'install-update'` to `NotificationLinkId`, and a case `update-available` → title "Update Available", description "{Version|Nightly build} X is available (you have Y).", link `{ id: 'install-update', label: 'Install update' }`. `bannerMessage`/`bannerSeverity` are filled in, but see the next bullet.
- `useNotificationBanners.ts`: skip `kind === 'update-available'` in `onAdded`, because `useUpdateBanners` already shows its banner from `update-ready`. Without this skip there would be two banners. Its `actionsFor` switch gets an `update-available` case returning `[]` so the switch stays exhaustive.
- `NotificationDrawer.tsx` `linkAction`: `'install-update'` → `window.electronAPI.update.install()`. The drawer already marks the entry read.

**Verification (vitest)**
- `src/renderer/src/updates/updateBanner.test.ts`: every row of the table, including the auto/manual split, the nightly label and the missing-`manual` fallback.
- `src/renderer/src/updates/useUpdateBanners.test.tsx` (mocked `electronAPI.update`, a `BannerProvider` wrapper): progress replaces the banner in place; Update calls `install`; the restore on mount shows downloading; the restore skips `update-ready`; a late `getUpdateStatus` doesn't overwrite a newer event.
- Extend `describe.test.ts` and `NotificationDrawer.test.tsx` (install link). Extend `useNotificationBanners.test.tsx` (no banner for `update-available`).
- `npm run typecheck`, `npm run lint`, `npm run test:react`. Manual: `npm run dev:react`, then Help → Check for Update shows the checking banner and the error banner (dev has no `dev-app-update.yml`).

---

### Phase 5 — E2E and docs

**Test util**: new `tests/e2e/util/updaterStubs.js`:
- `setNextUpdate(electronApp, { version } | { error } | null)` and `setDownloadError(electronApp, message)`: write `globalThis.__fakeUpdater` through `electronApp.evaluate`.
- `updaterCounts(electronApp)` → `{ checks, downloads, installs }`.
- Page model: extend `tests/e2e/models/react/Banner.js` if needed, to find a banner by `data-kind="update"`. Extend `NotificationDrawer.js` with the install link (`data-link="install-update"`).

**New `tests/e2e/scripts/react/updates.spec.js`** (each test launches its own app with `ui: "react"`):
1. Manual check, update available: `setNextUpdate({ version: '99.0.0' })`, click menu `CheckForUpdate`. The banner shows the version text. Click Update, then poll `installs === 1`.
2. Manual check, no update: the "no updates" banner appears, then goes away.
3. Automatic check is quiet: seed `checkForUpdates: [true]`, `MFE_UPDATE_CHECK_DELAY_MS=0`, no update. Poll `checks >= 1`, then assert no `update` banner.
4. Drawer entry: an automatic check with an update. The Home bell has a badge, the drawer has "Update Available", and *Install update* gives `installs === 1`.
5. Unsaved edits prompt: auto-save off, open `sandbox.careerPath`, edit a cell, `stubMessageBox(0)` (Save and install). Trigger the update and install. `messageBoxCalls` has one call, `installs === 1`, and `readSavedTable` shows the edit on disk. One extra case with response 2 (Cancel): `downloads === 0`.
6. Download error: `setDownloadError`, install. The sticky red banner has *Update manually*.
7. UI switch during a download: delay the fake download (the fake `downloadUpdate` waits on a `globalThis` flag), switch to v4 and back. The downloading banner is restored and no update-ready banner comes back.

**v4 guard** (main changed under it): new `tests/e2e/scripts/updates.spec.js` with one test. Manual check with an update shows v4's `.update-wrapper` with the version, and clicking Update gives `installs === 1`. v4 has no existing update spec, so nothing is ported.

**Docs**
- `04-parity.md`: 04n row → plan link + status.
- `plan.md`: tick the update checklist item.
- `CLAUDE.md`: in "v5 React UI", replace "The update check runs on the first load only; a reloaded UI reads the last updater event with `electronAPI.getUpdateStatus()`" with a short note on `updateController` (manual/auto tag, the install guard, the fake updater under `NODE_ENV=testing`). Add `updaterStubs.js` to the Tests bullets.

**Verification**
- `npm run build:react`, `npm run build:renderer`, then `npx playwright test tests/e2e/scripts/react/updates.spec.js tests/e2e/scripts/updates.spec.js`, then the full `npm run e2eTest`.
- None of the new tests should need `@slow`. Tag any that takes ≥ 15 s.

## Files touched (summary)

| Phase | Files |
|---|---|
| 1 | `main/services/updateController.js` (new), `main/services/fakeAutoUpdater.js` (new), `main/services/autoUpdaterService.js`, `main/handlers/updateHandler.js`, `main.js`, `tests/unit/updateController.test.js` (new) |
| 2 | `main/services/updateInstallGuard.js` (new), `main.js`, `tests/unit/updateInstallGuard.test.js` (new) |
| 3 | `src/shared/types/notifications.ts`, `src/shared/types/update.ts` (new), `main/services/notificationStore.js`, `main.js`, `preload/franchisePreload.js`, `src/renderer/src/preload.d.ts`, unit tests |
| 4 | `src/renderer/src/updates/{updateBanner.ts,useUpdateBanners.ts}` + tests (new), `routes/Layout/Layout.tsx`, `notifications/describe.ts`, `notifications/useNotificationBanners.ts`, `routes/Welcome/components/NotificationDrawer/NotificationDrawer.tsx` + tests |
| 5 | `tests/e2e/util/updaterStubs.js` (new), `tests/e2e/scripts/react/updates.spec.js` (new), `tests/e2e/scripts/updates.spec.js` (new), react page models, `04-parity.md`, `plan.md`, `CLAUDE.md` |

## Out of scope
- "Restart later" / install on quit (D3), skip version, release-notes link (D7).
- Removing v4's unreachable first-run bar (D6).
- Upgrading electron-updater (see CLAUDE.md release notes).
