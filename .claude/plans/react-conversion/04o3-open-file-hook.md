# 04o3: Move the open flow into `useOpenFile`

Index: [04o-schema-notifications.md](04o-schema-notifications.md). A refactor with no visible change, so 04o6's Schemas page can open a file the same way Welcome does. Independent of 04o1 and 04o2.

## Changes
- New `src/renderer/src/hooks/useOpenFile.ts`. Move Welcome's `initializeFile` body into it unchanged: the common-file check (remembered choice or prompt), closing the previous file, `franchiseAPI.openFile`, the error message box, `getTableList` + `readDefaultEditor`, `recentFiles.addFile`, `setOpenFile`, the default-editor tab selection, and `file-loaded`.
- Signature: `useOpenFile({ promptForOverrides })` → `openFile(path: string, overrides?: OpenFileOverrides): Promise<OpenFileResult>`.
  - `OpenFileOverrides` is today's `CommonFileOverrides` plus an optional `schemaOverride?: { path: string }` (passed through to `franchiseAPI.openFile`; used by 04o6). When `schemaOverride` is set and the file is a common file without year/type overrides, the common-file check still runs.
  - `OpenFileResult`: `{ status: 'opened', recentFiles: RecentFileEntry[] } | { status: 'cancelled' } | { status: 'error', error: string, code?: string }`. Welcome uses `recentFiles` to update its list, as it does now.
- The common-file prompt's modal stays rendered by Welcome; the hook takes `promptForOverrides` as a parameter, because `useCommonFilePrompt` returns the modal element that must be in Welcome's tree.
- `readDefaultEditor` moves into the hook file.
- `Welcome.tsx`: `initializeFile` becomes a call to the hook plus `setRecentFiles` on `opened`. `changeCommonFileParameters` calls the hook too.

## Verification
- `useOpenFile.test.ts` (vitest, `franchiseAPI`/`electronAPI` mocked): common-file prompt and remembered choice, cancel keeps the current file, closes the previous file, error box on `{ error }`, each default editor, `file-loaded` sent, `schemaOverride` passed through.
- Existing `Welcome.test.tsx` and all React e2e specs pass unchanged (`common-file.spec.js`, `smoke.spec.js`, `tabs.spec.js` cover the flow).
- `npm run typecheck && npm run lint && npm run test:react`, then `npm run build:react && npx playwright test --project=react`.
