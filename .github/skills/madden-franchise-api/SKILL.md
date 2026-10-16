---
name: madden-franchise-api
description: Workflow patterns and best practices for using the madden-franchise library in IPC handlers. Covers field access, table operations, save patterns, and common mistakes to avoid.
---

# Using madden-franchise API in Handlers

## When to Load This Skill

When modifying or creating IPC handlers in `main/handlers/` that interact with franchise files, tables, or records.

## Core Principles

1. **Always use `FranchiseFileManager`** — never instantiate `FranchiseFile` directly in handlers
2. **Use file IDs, not paths** — all operations go through `activeFiles` map
3. **Records must be loaded first** — call `table.readRecords()` before accessing fields
4. **Prefer `getTableByUniqueId()`** — `getTableById()` IDs can change between schema versions

## Decision Flow: Reading Table Data

```
Need table data?
├─ Table already loaded? → Access records directly
├─ Need all fields? → await table.readRecords()
├─ Need specific fields? → await table.readRecords(['Field1', 'Field2'])
└─ Just need table metadata? → Use table.header (no readRecords needed)
```

## Decision Flow: Writing Values

```
Need to write a value?
├─ Is the table loaded? → NO → await table.readRecords() first
├─ Is the record empty? → YES → Cannot write, handle accordingly
├─ Is the field a reference? → YES → Use reference format: { tableId, recordIndex }
└─ Normal field? → table.records[index].fields[fieldName] = value
```

## Common Mistakes to Avoid

### ❌ Wrong: Using getTableById()

```js
const table = file.getTableById(tableId); // IDs can change!
```

### ✅ Right: Use getTableByUniqueId()

```js
const table = file.getTableByUniqueId(uniqueId); // Stable across versions
```

### ❌ Wrong: Accessing fields without loading records

```js
const value = table.records[0].FirstName; // undefined if not loaded!
```

### ✅ Right: Load records first

```js
await table.readRecords();
const value = table.records[0].FirstName;
```

### ❌ Wrong: Direct FranchiseFile instantiation in handlers

```js
const file = new FranchiseFile(path); // Bypasses file management!
```

### ✅ Right: Use FranchiseFileManager

```js
const entry = franchiseFileManager.activeFiles.get(fileId);
const file = entry.file;
```

## Field Access Patterns

### Reading Values

```js
// Direct proxy access (cleanest)
const name = record.FirstName;

// Via fields map (when fieldName is dynamic)
const value = record.fields[fieldName].value;

// Via method
const value = record.getValueByKey(fieldName);
```

### Writing Values

```js
// Direct proxy assignment
record.FirstName = "John";

// when fieldName is dynamic
record[fieldName] = value;

// via fields map
record.fields[fieldName].value = value;
```

## Handler Template

```js
// main/handlers/yourHandler.js
function registerYourHandlers(ipcMain, franchiseFileManager) {
  ipcMain.handle("your-domain:action", async (event, fileId, ...args) => {
    try {
      const entry = franchiseFileManager.activeFiles.get(fileId);
      if (!entry) return { error: "File not found" };

      const { file } = entry;
      // ... your logic here

      return { success: true, data: result };
    } catch (err) {
      return { error: err.message };
    }
  });
}

module.exports = { registerYourHandlers };
```

## Save Patterns

### Auto-save on change

```js
// In settings when opening file
{
  saveOnChange: true;
}
```

### Manual save with events

```js
file.emit("saving");
await file.save();
file.emit("saved");
```

### Save to new path

```js
entry.file.filePath = newPath;
entry.path = newPath;
await file.save();
```

## Schema Reload Pattern

When reloading with a different schema:

1. Create new `FranchiseFile` with `schemaOverride`
2. Wait for `ready` event
3. Replace `entry.file` reference
4. Re-setup change event handlers
5. Return updated metadata

## Reference Fields

Reference fields point to other records. To work with them:

```js
// Get reference data
const ref = record.getReferenceDataByKey("TeamId");
// Returns: { tableId, recordIndex, ... }

// Get the actual referenced record
const referencedRecord = file.getReferencedRecord(ref);

// Get all records that reference this one
const refs = file.getReferencesToRecord(tableId, recordIndex);
```

## Empty Records

Empty records are valid `FranchiseFileRecord` objects with `isEmpty = true`:

```js
// Check if record is empty
if (record.isEmpty) {
  // Handle empty record
}

// Get empty record mapping
const emptyRecords = table.emptyRecords;
```

## Testing Changes

After modifying handlers:

1. Run E2E tests: `npm run e2eTest`
2. Test in dev mode: `npm run dev`
3. Verify no console errors in renderer
4. Check file saves correctly
