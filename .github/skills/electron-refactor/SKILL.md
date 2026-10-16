---
name: electron-main-renderer-refactor
description: Refactor Electron app logic from renderer to main process with proper IPC separation
---

# Electron Main/Renderer Refactoring

## When to Use

- Migrating old Electron apps where logic lived entirely in renderer
- Moving file system, native module, or heavy computation to main process
- Establishing clean separation of concerns between processes

## Architecture Pattern

```
Renderer Service (thin wrapper)
    ↓ calls via IPC
Preload Script (contextBridge)
    ↓ invokes/handles
Main Process Handler (actual logic)
```

## Refactoring Steps

### 1. Identify Candidates for Main Process

**Move to Main:**

- File system operations (fs, path)
- Native modules (xlsx, sqlite, etc.)
- Heavy computation
- Access to Electron APIs (dialog, shell, app)
- Database operations
- Network requests with credentials

**Keep in Renderer:**

- UI state management
- DOM manipulation
- Data transformation of already-loaded objects
- Format metadata (e.g., available export formats)
- Validation logic for user input

### 2. Create Main Process Handler

```javascript
// main/handlers/yourFeatureHandler.js
function registerYourFeatureHandlers(ipcMain, dependencies) {
  ipcMain.handle("feature:action", async (event, ...args) => {
    try {
      // Actual logic here
      const result = await doSomething(...args);
      return result;
    } catch (error) {
      throw new Error(`Failed to do something: ${error.message}`);
    }
  });
}

module.exports = { registerYourFeatureHandlers };
```

### 3. Register Handler in main.js

```javascript
const {
  registerYourFeatureHandlers,
} = require("./main/handlers/yourFeatureHandler");

// After app ready
registerYourFeatureHandlers(ipcMain, franchiseFileManager);
```

### 4. Expose API in Preload

```javascript
// preload/franchisePreload.js
contextBridge.exposeInMainWorld("electronAPI", {
  yourFeature: {
    action: (...args) => ipcRenderer.invoke("feature:action", ...args),
  },
});
```

### 5. Create Renderer Service Wrapper

```javascript
// renderer/js/services/yourFeatureService.js
const yourFeatureService = {};

yourFeatureService.doAction = async function (options) {
  if (!options) {
    throw new Error("Invalid arguments");
  }
  return window.electronAPI.yourFeature.action(options);
};

module.exports = yourFeatureService;
```

## IPC Naming Convention

- Use `feature:action` format (e.g., `external-data:import`, `franchise:save-file`)
- Prefix with feature name for organization
- Use kebab-case for multi-word features

## Error Handling Pattern

- Main process catches errors and throws with context
- Renderer services propagate errors to callers
- Use try/catch in main handlers with descriptive messages

## Data Transfer Best Practices

- Send only necessary data over IPC (not entire objects)
- Use base64 for binary data
- Keep renderer-side transformations for already-loaded data
- Main process handles serialization/deserialization of file formats

## Example: Export Table Data

**Renderer (data extraction):**

```javascript
const headers = table.offsetTable.map((offset) => offset.name);
const rows = table.records.map((record) =>
  record.fieldsArray.map((field) => field._value),
);
```

**Main (file creation):**

```javascript
const wb = xlsx.utils.book_new();
const data = [headers, ...rows];
const ws = xlsx.utils.json_to_sheet(data, { skipHeader: true });
xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
```

## Verification Checklist

- [ ] No `require('fs')` or native modules in renderer
- [ ] No direct Electron API usage in renderer (except contextBridge)
- [ ] All file operations go through IPC
- [ ] Preload exposes only needed methods
- [ ] Error messages are descriptive
- [ ] Service wrapper validates arguments before IPC call
- [ ] Main handler has try/catch with error context
