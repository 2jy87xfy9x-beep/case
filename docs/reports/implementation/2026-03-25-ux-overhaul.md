# UX Overhaul — Implementation Report
**Date:** 2026-03-25
**Files modified:** `web/index.html`, `web/styles.css`, `web/main.ts`

---

## Task 1 — Bottom Bar Redesign

**Goal:** Icon-only persistent dock across all screens, contextual tools, multiselect, safe-delete mode, tooltips, reorderable.

**What changed:**
- Moved `<nav class="dock">` out of `#screen-home` to body level, `position: fixed; bottom: 0`. Dock is now always visible on every screen.
- Removed text labels from all dock buttons — icon-only with `data-tip` tooltips (existing JS tooltip singleton picks these up on hover).
- Dock structure: `dock__nav` (nav icons, draggable) | separator | `dock__tools` (contextual, JS-rendered) | spacer | upload button with popup menu.
- `showScreen()` no longer hides the dock. Instead calls `updateDockContext(screenId)` which renders per-screen tool icons:
  - **Home:** Multiselect (☐), Delete mode (⚠), Messages (✉)
  - **Brief:** Consult (▶), Export (↓), Share (⎘)
  - **Library:** Add link (🔗), Add document (+)
  - **Settings:** no extra tools
- **Multiselect mode** (`toggleMultiselect()`): adds `.case-row--selectable` to all rows; click to toggle `.selected`; "Delete selected" button appears in dock tools; exits cleanly.
- **Safe-delete mode** (`toggleDeleteMode()`): highlights cases with 0 evidence (`.case-row--safe-delete`); clicking a highlighted row prompts confirm-delete.
- **Drag reorder:** dock nav items are `draggable="true"`. `initDockDragReorder()` handles `dragstart`/`dragover`/`drop` to reorder the array and re-render; order persisted to `localStorage['caseOrg.dockOrder']`.
- `body` gets `padding-bottom: 52px` so content clears the fixed dock.
- Upload popup menu (above upload ↑ button) has: Files (multi-file picker), Folder (directory picker), Messages (toggle message import panel).

---

## Task 2 — Canvas as Full Ingest Zone + Compact Expandable Cases

**Goal:** No "specify first" prompt. Whole canvas is a drop zone. Cases expand inline instead of navigating to a separate screen.

**What changed:**
- Removed `intake-toggle`, `intake-panel`, `topbar__add-btn` from home screen HTML.
- Canvas (`#home-canvas`) now has drag-over/drop listeners on the document:
  - `dragover`: adds `.drag-over` class to canvas (dashed outline)
  - `drop`: calls `routeDroppedFiles(files)` which auto-detects type: `.csv`/`.xml` → `handleMessageImport()`, otherwise → `handleFiles(files, 'upload')`
- `routeFilesToCase(files, caseId)` for case-specific adds: same routing but targeted at an existing case.
- **Case rows redesigned** (`caseRowHTML()`): flat rows with just a bottom border (no box/background). Structure:
  - Compact header: expand icon (▸/▾) + title + meta + gaps badge
  - Hidden `.case-row__panel`: shows summary text, action buttons (Add Files, Open Full Brief →, Delete)
- Clicking the row header toggles panel open/closed inline — no navigation.
- "Open Full Brief →" calls `openCase(id)` as before.
- "Add Files" is a hidden file input label per row; selection routes through `routeFilesToCase()`.
- Message import panel remains on canvas, hidden by default, toggled by dock Messages button.
- Topbar simplified: "CASES" label + "saved locally" only.

---

## Task 3 — Stub Tooltips in Library

**Goal:** The `· stub` text on seeded library items is confusing. Replace with a `?` icon that explains what stubs are.

**What changed:**
- `renderLibrary()`: seeded items now render `<button class="stub-info" data-tip="Stub — pre-populated from your jurisdiction. No content added yet. Click to fill in or attach the full document.">?</button>` next to the type badge.
- CSS: `.stub-info` is a small bordered `?` button, no background, cursor pointer.
- Every library item also gets a `×` delete button (`.lib-item__delete`) wired to remove from localStorage and re-render.

---

## Task 4 — Library Links + Source-to-Library Promotion + Offline Snapshot

**Goal:** Library items can be live URLs that open in new tab. Offline fallback uses cached snapshots. Evidence files can be promoted to the library.

**What changed:**

### LibraryItem interface extended:
```typescript
interface LibraryItem {
  id: string; name: string; type: string; assignedCaseId?: string;
  url?: string;        // external URL
  content?: string;    // text content
  snapshot?: string;   // cached text (first 3000 chars) fetched from url
  snapshotAt?: string; // ISO date of last snapshot
}
```

### Add Link modal (`showAddLinkModal()`):
- Name field + URL field + optional notes textarea
- On save: creates `LibraryItem` with `type: 'Link'`
- Attempts `fetchLinkSnapshot(url)` in background (CORS-limited; saves what it can)
- Triggered by 🔗 icon in dock tools when on Library screen

### Link items in library:
- Render with 🔗 icon instead of 📄
- Clicking: checks `navigator.onLine` and `SIMULATE_OFFLINE_KEY`
  - Online + not simulating: `window.open(url, '_blank')`, then re-fetches snapshot silently
  - Offline or simulating: `showSnapshotModal()` — shows cached text with timestamp banner ("⚠ Offline — showing cached snapshot from [date]" or "Simulating offline" if simulate mode is on)

### Source-to-library promotion:
- `renderSourceFiles()` adds `→ lib` button (`.ev-promote-btn`) per evidence item
- Click: creates `LibraryItem` from evidence (name=title, type=inferType(sourceFile), content=body), saves, toasts "Added to library"

### Simulate offline toggle:
- Settings Feature toggle `feat-simulate-offline` maps to `SIMULATE_OFFLINE_KEY` in localStorage
- When enabled, all library link clicks use snapshot path regardless of connectivity

---

## Task 5 — Settings Feature Toggles

**Goal:** Let users toggle smart features on/off.

**What changed:**
- New "Features" settings section with 5 toggle switches (CSS toggle switch pattern):
  - `feat-auto-organize` — Auto-organize on upload (default: on)
  - `feat-gap-detection` — Gap detection (default: on)
  - `feat-ocr` — OCR processing (default: on)
  - `feat-smart-topics` — Smart topic suggestions (default: on)
  - `feat-simulate-offline` — Simulate offline for library links (default: off)
- Each persisted to `localStorage['caseOrg.feat.<id>']`
- `loadSettings()` reads all toggle states
- Bootstrap wires `input` event on each toggle
- `feat-simulate-offline` also writes to `SIMULATE_OFFLINE_KEY` for use by library link logic

---

## Task 6 — Sync Folders (File System Access API)

**Goal:** Connect local folders (e.g. `C:\iCloudDrive\Documents\legal`) and auto-import new files when app opens.

**What changed:**
- Replaced "Coming soon" sync section with a real implementation
- `SyncFolder` interface: `{ id, name, path, processedFiles[] }`
- `SYNC_FOLDERS_KEY = 'caseOrg.syncFolders'` — persists folder metadata in localStorage
- `_syncHandles: Map<string, FileSystemDirectoryHandle>` — in-memory handles (FSA handles are re-granted each session since `postMessage` serialization isn't available cross-session without IndexedDB)
- `connectSyncFolder()`: calls `window.showDirectoryPicker({ mode: 'read' })`, stores handle, saves metadata, calls `processSyncFolder()`
- `processSyncFolder(folderId, handle)`: iterates directory entries via async iterator, skips already-processed filenames, collects new files, routes through `handleFiles()`, updates `processedFiles` list
- `renderSyncFolders()`: shows connected folders with name, processed file count, "Re-scan ↺" button (re-grants access), "×" remove button
- "Re-scan" button prompts user to re-grant the folder (FSA design limitation — handles don't persist across page loads without IndexedDB serialization)
- Suggested default path shown: `C:\iCloudDrive\Documents\legal`
- `loadSettings()` now calls `renderSyncFolders()` when settings screen opens

**Known limitation:** FSA directory handles cannot be persisted in localStorage (not serializable). Users must re-grant folder access each session via "Re-scan". Future enhancement: serialize handles to IndexedDB using `StorageManager.persist()`.

---

## Files Modified

| File | Lines changed (approx) |
|------|------------------------|
| `web/index.html` | ~120 lines restructured |
| `web/styles.css` | ~250 lines added |
| `web/main.ts` | ~350 lines added/modified |

## TypeScript
Zero errors in `web/` files. Pre-existing errors in `app/` and `tests/` are unrelated to this work.
