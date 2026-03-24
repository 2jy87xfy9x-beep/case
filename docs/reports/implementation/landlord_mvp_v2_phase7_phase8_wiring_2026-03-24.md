# Landlord MVP v2 — Phase 7 export & Phase 8 evidence wiring

**Date:** March 24, 2026  
**Scope:** Application/domain wiring (no new React screens in this repo).

## Summary

Phase 7 Markdown export now includes a **Gaps** section driven by `detectGaps`, only when that function returns at least one gap. Full-case and lawyer-summary variants share disclaimers and OCR caveats; the summary variant omits the full evidence list and the communication log, but still appends Gaps when present.

Phase 8 **evidence category** wiring is implemented as an immutable domain helper, `setEvidenceCategory`, intended for the evidence-detail screen to call after the user picks a category, then persist via `saveEvidence`. IndexedDB serialization already spreads `Evidence` fields, so `category` round-trips through the repository port.

## Files added or changed

| Area | Path | Role |
|------|------|------|
| Domain | `app/domain/evidenceOps.ts` | `setEvidenceCategory(case, evidenceId, category?)` |
| Domain | `app/domain/markdownExport.ts` | `buildMarkdownExport`, disclaimers, sections, conditional Gaps, `lawyerSummary` vs `fullCase` |
| Application | `app/application/exportCase.ts` | `exportCaseMarkdown` — builds Markdown and updates `lastExportedAt` through `CaseRepository` |
| Tests | `tests/domain/evidenceOps.test.ts` | Category setter behavior |
| Tests | `tests/domain/markdownExport.test.ts` | Disclaimers, OCR caveat, Gaps presence/absence, variant differences, safe handling of pasted markdown |
| Tests | `tests/application/exportCase.test.ts` | Export persists `lastExportedAt` |
| Tests | `tests/storage/storage.test.ts` | Evidence `category` round-trip on port fake |
| Plan | `docs/plans/landlord_mvp_tdd_v2.plan.md` | Completion checklist updated for export + category wiring |

## Export behavior notes

- Required strings from the plan/spec: organizational disclaimer, text-only disclaimer, export timestamp, optional app version.
- OCR caveat block is included when any evidence used `tesseract` or `vision`.
- Extracted text is emitted inside fenced code blocks; `](data:` sequences in user text are neutralized so they do not form active markdown image URLs.
- Property, claims, and structured lawyer questions remain placeholders until those entities exist on `Case`.

## Verification

All Vitest suites pass locally (`npm test`).

## Follow-up (not in this change)

- React evidence-detail UI: bind a category control to `setEvidenceCategory` and `saveEvidence`.
- Export UI: call `exportCaseMarkdown`, trigger download, optionally merge shell + evidence from `loadCase` if the in-memory case is split across stores.
