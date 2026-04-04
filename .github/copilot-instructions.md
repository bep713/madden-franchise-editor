# Madden Franchise Editor — Copilot Instructions

## Project Overview

Electron desktop app for viewing and editing Madden NFL franchise files (proprietary database format). The actual parsing/writing of the database is handled by the **madden-franchise** library (separate package). This app provides the UI, IPC layer, and application logic for editing, exporting/importing, and saving files.

The proprietary format relies on **schema files** that define every table and field. The app includes tools to search for schemas in large data files, extract them, save and load them.

**Key repos in workspace:**

- `madden-franchise-editor/` — this Electron app
- `madden-franchise/` — core parsing/writing library
- `madden-franchise-mcp/` — MCP server for franchise data

## Quick Start

```powershell
# Install dependencies
npm install

# Watch SASS compilation (terminal 1)
gulp sass:watch

# Run app in dev mode (terminal 2) — hot-reloads renderer
npm run dev

# Build for Windows
npm run build:app

# Run E2E tests
npm run e2eTest
```

**Dev mode** runs two processes: `watch:renderer` (browserify watch) and `dev:electron` (electron .). Changes to renderer code auto-refresh. Restart only needed when `main.js` or `main/` files change.

## Architecture

### Three-Process Model

| Process  | Entry                         | Purpose                                          |
| -------- | ----------------------------- | ------------------------------------------------ |
| Main     | `main.js`                     | Window management, IPC handlers, file operations |
| Renderer | `renderer/index.html`         | Primary UI (welcome, table editor, navigation)   |
| Preload  | `preload/franchisePreload.js` | Secure bridge between renderer and main          |

Additional windows: `schema-manager.html`, `settings-manager.html`, `worker.html` (stubbed).

### Security Model

- `nodeIntegration: false`, `contextIsolation: true`
- All renderer→main communication via `contextBridge` + `ipcRenderer.invoke`
- Two exposed bridges:
  - **`window.franchiseAPI`** — franchise file operations (open, close, save, read/write tables, schema ops)
  - **`window.electronAPI`** — dialogs, fs, preferences, recent files, schedules, updates

### IPC Patterns

**Request/response** (preferred):

```js
// Main: main/handlers/xxxHandler.js
ipcMain.handle("domain:action", async (event, ...args) => { ... });

// Renderer
const result = await window.franchiseAPI.someMethod(...args);
```

**Fire-and-forget** (events/notifications):

```js
// Main → Renderer
mainWindow.webContents.send("franchise:ready", data);

// Renderer → Main
ipcRenderer.send("open-external-url", url);
```

**Naming convention:** `<domain>:<action>` (e.g., `schema-search:search`, `external-data:export`)

### Key Directories

| Path                                    | Purpose                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| `main/services/FranchiseFileManager.js` | Central service — manages all franchise file operations, maintains active file map |
| `main/handlers/`                        | IPC handler modules (10 files), each registers channels with `ipcMain`             |
| `main/libs/`                            | Binary parsers (`CASBlockParser.js`, `FileParser.js`) for EA CAS block format      |
| `renderer/js/`                          | Renderer JS — `index.js`, `schemaManager.js`, `settingsManager.js`, `worker.js`    |
| `renderer/`                             | HTML pages, CSS/SASS, images                                                       |
| `preload/`                              | Preload scripts exposing secure APIs                                               |
| `data/`                                 | Static data (team lookups, offsets, preferences schema)                            |
| `schedules/`                            | Historical schedule JSON files (1970-2019)                                         |
| `patches/`                              | patch-package patches for dependencies                                             |

### Build System

- **Renderer bundling:** `build-renderer.js` uses browserify to create 4 bundles
- **SASS:** `gulpfile.js` compiles SASS → CSS
- **Native modules:** `electron-rebuild` for `lz4-napi`
- **Patches:** `patch-package` runs on postinstall

## Conventions

### Handler Registration

All IPC handlers are registered at startup in `main.js`. Each handler module exports a `register*Handlers(ipcMain, ...)` function:

```js
// main/handlers/schemaHandler.js
function registerSchemaHandlers(ipcMain, franchiseFileManager) {
  ipcMain.handle("schema:action", async (event, ...args) => {
    // Use franchiseFileManager for file operations
  });
}
module.exports = { registerSchemaHandlers };
```

### File Management

`FranchiseFileManager` maintains a `Map<string, { file: FranchiseFile, path: string }>` of active files. Always use the file ID pattern, never pass file paths directly to library calls.

### Schema Operations

Schema-related functionality spans multiple handlers:

- `schemaHandler.js` — schema directory init, XML schema generation
- `schemaMismatchHandler.js` — version comparison (expected vs loaded)
- `schemaSearchHandler.js` — directory scanning for `.gz` files, CAS block parsing
- `schemaViewerHandler.js` — field extraction from all tables

### Error Handling

- Use `ipcMain.handle` with try/catch, return error objects to renderer
- File lifecycle events: `franchise:error`, `franchise:ready`, `franchise:saved`
- Schema mismatches trigger detection flow in `schemaMismatchHandler.js`

## Common Pitfalls

1. **Native module rebuilds:** After `npm install`, run `npx electron-rebuild` if `lz4-napi` fails
2. **SASS watch required:** App styles won't update without `gulp sass:watch` running
3. **Main process restart:** Changes to `main.js` or `main/` files require full app restart (not just renderer refresh)
4. **File locking:** Always make copies of franchise files before editing — the app autosaves on changes
5. **Schema version mismatches:** Loading a franchise with a different schema version than expected triggers the mismatch handler
6. **CAS block parsing:** Schema extraction from `.gz` files uses stream-based parsing — large files may take time

## Testing

E2E tests use Playwright:

```powershell
npm run e2eTest
```

Tests are in `tests/` directory. Config in `playwright.config.js`.

## Related Libraries

- **madden-franchise** — Core parsing/writing library (`FranchiseFile`, `schemaPicker`, `schemaGenerator`, `utilService`)
- **madden-franchise-mcp** — MCP server for franchise data access
- **CASBlockParser** — Stream-based binary parser for EA CAS format (UNCOMPRESSED, ZLIB, LZ4_BLOCK, ZSTD, OODLE)

## madden-franchise API

When working with franchise file operations in handlers, reference:

- **Skill:** `.github/skills/madden-franchise-api/SKILL.md` — workflow patterns, decision flows, common mistakes
- **Repo memory:** `/memories/repo/madden-franchise-api.md` — quick API reference (auto-loaded)

**Key principle:** Field names are directly accessible on `FranchiseFileRecord` via Proxy. Set values with:

```js
table.records[index].fields[fieldName] = value;
// or
table.records[index][fieldName] = value;
```
