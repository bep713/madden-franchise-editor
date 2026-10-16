---
description: "Analyze a console error in the target file, find root cause, and create a detailed fix plan"
---

# Debug & Fix Plan

## Input

- **Console Error:** {{error}}
- **Target File:** {{file}}

## Instructions

1. **Read the Error Carefully**
   - Identify the error type, message, and stack trace
   - Note which process it occurred in (main, renderer, preload)
   - Identify the exact line and function where it failed

2. **Understand the Context**
   - Read the target file completely
   - Understand what the code is trying to do
   - Check related files (imports, handlers, services)
   - For Electron apps, verify IPC patterns are correct:
     - Main process uses `ipcMain.handle`
     - Preload uses `contextBridge` + `ipcRenderer.invoke`
     - Renderer calls via `window.franchiseAPI` or `window.electronAPI`

3. **Find Root Cause**
   - Trace the error back to its source
   - Check for common pitfalls:
     - Missing error handling in IPC handlers
     - Incorrect file ID usage (should use FranchiseFileManager map)
     - SASS not compiled (run `gulp sass:watch`)
     - Main process needs restart (not just renderer refresh)
     - Native module issues (`lz4-napi` needs `electron-rebuild`)
     - Schema version mismatches
   - Check if the error is a symptom of a deeper issue

4. **Create Fix Plan**
   - Describe the root cause clearly
   - List specific files that need changes
   - Provide the exact code changes needed
   - Include any commands to run (e.g., rebuild, restart)
   - Note any verification steps

## Output Format

```markdown
## Error Analysis

- **Error Type:** [e.g., TypeError, ReferenceError, IPC timeout]
- **Process:** [main | renderer | preload]
- **Location:** [file:line]
- **Trigger:** [what action caused this]

## Root Cause

[Clear explanation of why this error occurs]

## Fix Plan

### 1. [File to edit]

- **Change:** [what to change]
- **Reason:** [why this fixes the issue]

### 2. [Additional steps if needed]

- [e.g., restart app, rebuild native modules]

## Verification

- [ ] [Step to verify the fix works]
- [ ] [Step to ensure no regressions]
```

## Example Usage

```
Error: TypeError: Cannot read properties of undefined (reading 'getTable')
File: renderer/js/index.js:245
```

This would analyze the error, trace it through the IPC layer, and provide a concrete fix plan.
