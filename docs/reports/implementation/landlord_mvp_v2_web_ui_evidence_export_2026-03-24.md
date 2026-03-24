# Landlord MVP v2 — Web UI: evidence category + Markdown export

**Date:** March 24, 2026  
**Scope:** Wire Phase 7–8 application ports to a minimal browser UI (Vite + TypeScript, no React).

## Summary

The repo previously shipped domain and application layers (`setEvidenceCategory`, `exportCaseMarkdown`, `IndexedDbCaseRepository`) without a runnable surface. This change adds a small **`web/`** app that:

1. **Evidence detail** — Selecting an item shows a category `<select>`. On change, the client calls `setEvidenceCategory` on the in-memory `Case`, replaces `currentCase` with the returned case, and persists evidence with `CaseRepository.saveEvidence`.
2. **Export** — Buttons load the fully assembled case via `loadCase` (case shell + evidence + messages), invoke `exportCaseMarkdown` with `fullCase` or `lawyerSummary`, then trigger a download of the Markdown string as a `.md` file. After a successful export, state is refreshed from `loadCase` so `lastExportedAt` matches IndexedDB.
3. **Reminder** — A simple banner uses `needsExportReminder` (same rules as tests) when the case has not been exported within the reminder window.

On first visit, the UI seeds a fixed local case id (`mvp-local-case`) with two sample evidence rows if nothing exists.

## Files added

| Path | Role |
|------|------|
| [`web/index.html`](../../web/index.html) | Layout: evidence list, detail panel, export buttons |
| [`web/main.ts`](../../web/main.ts) | Wiring to `setEvidenceCategory`, `saveEvidence`, `loadCase`, `exportCaseMarkdown`, `needsExportReminder` |
| [`web/styles.css`](../../web/styles.css) | Lightweight layout and typography |
| [`web/vite.config.ts`](../../web/vite.config.ts) | Vite root = `web/`, build output `dist/web/` |

## Tooling

| Change | Detail |
|--------|--------|
| [`package.json`](../../package.json) | `vite` devDependency; scripts `dev:ui`, `build:ui` |
| Build output | `dist/web/` — root [`.gitignore`](../../.gitignore) ignores `dist/` |

## Verification

- `npm test` — all 41 tests passed.
- `npm run build:ui` — Vite production build succeeded.

## Follow-up

- Phase 8 React / RTL tests and mobile QA gate remain as in the plan.
- Timeline and message-import screens are not represented in this shell; only evidence list + export.
- Consider sharing one `tsconfig` for `web/` + DOM types without disturbing Node-only `tsc` for `app/` (optional hygiene).
