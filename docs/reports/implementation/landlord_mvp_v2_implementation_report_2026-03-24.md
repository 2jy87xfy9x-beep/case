# Landlord MVP v2 — Implementation Report
**Date:** March 24, 2026  
**Repository:** `/workspace/case`

## Purpose
This report summarizes what has been implemented so far against:
- `docs/plans/landlord_mvp_tdd_v2.plan.md`
- `docs/specs/landlord_case_organizer_design_spec_v2.md`

It also calls out known gaps and concrete next steps.

---

## Work Completed

### 1) Project scaffolding and test harness
Implemented a TypeScript + Vitest baseline to support TDD iteration:
- `package.json` with test scripts
- `tsconfig.json`
- `vitest.config.ts`

This establishes a runnable unit-test framework once dependency installation is available in the execution environment.

### 2) Domain model additions (Phase 1-aligned)
Implemented foundational domain types and factories:
- `Message`, `MessageSender`, `MessageDirection`, `MessageImportSource`
- `Gap`
- `Lawyer`
- `Case.lastExportedAt`
- `Evidence` provenance fields including OCR tier metadata

Files:
- `app/domain/types.ts`
- `app/domain/factories.ts`

### 3) Timeline + export reminder behavior
Implemented pure domain logic for timeline composition and export reminders:
- Mixed `Evidence[] + Message[]` timeline merge and chronological sort with id tie-break
- Message grouping by `threadId`
- `needsExportReminder(case, now)` (7-day reminder logic)
- `markCaseExported(case, exportedAt)`

Files:
- `app/domain/timeline.ts`
- `app/domain/exportReminder.ts`

### 4) OCR boundary and tiering foundation (Phase 3-aligned)
Implemented OCR contract and base services:
- OCR port and result shape: `app/ports/OcrService.ts`
- Tier selector: `vision -> tesseract -> manual` (cloud only via explicit preference)
- `ManualOcrService` implementation
- `TesseractOcrService` implementation including timeout and confidence mapping
- Tiered orchestration wrapper

Files:
- `app/ocr/tiered/selectTier.ts`
- `app/ocr/tiered/index.ts`
- `app/ocr/manual/index.ts`
- `app/ocr/tesseract/index.ts`
- `app/ports/OcrService.ts`

### 5) Message import parsing + dedup flow (Phase 3.5-aligned)
Implemented first-pass parsers and import orchestration:
- iMazing CSV parser with row-level malformed-date skipping
- SMS Backup & Restore XML parser
- Import dedup strategy based on `dateTime + sender + body` hash

Files:
- `app/messages/parsers/imazingCsv.ts`
- `app/messages/parsers/smsXml.ts`
- `app/messages/importMessages.ts`
- Fixture: `tests/fixtures/messages/imazing-sample.csv`

### 6) Upload pipeline skeleton (Phase 4 foundation)
Implemented pipeline skeleton:
- `prepareImageForOcr(file)` placeholder
- `uploadToEvidence(...)` orchestration calling OCR service and storing provenance

Files:
- `app/application/prepareImageForOcr.ts`
- `app/application/uploadPipeline.ts`

### 7) Architecture decision record (ADR)
Recorded decision to keep ports/adapters for testability at OCR/storage boundaries:
- `docs/decisions/ADR-001-architecture.md`

### 8) Automated tests added
Added test suites for:
- domain factories/timeline/export reminder
- OCR tiering + services + timeout behavior
- message parsers/import dedup/timeline merge

Files:
- `tests/domain/domain.test.ts`
- `tests/ocr/ocr.test.ts`
- `tests/messages/messages.test.ts`

---

## Known Limitations / Not Yet Implemented

1. **Dependency installation blocked in execution environment**
   - `npm install` failed due registry access policy (`403 Forbidden`), so test execution was not completed here.

2. **Pipeline image preprocessing remains stubbed**
   - EXIF auto-rotation and contrast preprocessing are not implemented yet.

3. **No UI layer yet**
   - Current work is domain/application logic only; no React screens/components added.

4. **Tier-1 Vision and cloud OCR intentionally deferred**
   - Vision depends on Capacitor path.
   - Cloud OCR is deferred pending privacy/subprocessor policy work.

5. **Data persistence adapter not implemented yet**
   - IndexedDB schema/migrations/object stores are still pending.

6. **Gap detector is baseline heuristic only**
   - Additional structured rules and UX surfacing are pending.

---

## Planned Next Steps

1. Implement IndexedDB storage adapter + migration tests (v1 schema -> v2 schema).
2. Implement `prepareImageForOcr` with EXIF handling and pre-OCR cleanup tests.
3. Expand message parser resilience against real-world fixture variants.
4. Build React app shell and mobile-first screens per Phase 8 order.
5. Add backup/export flow, reminder prompts, and export timestamp persistence.
6. Add case builder gap detection UX surface and legal-safe copy review gate.

---

## Status Summary
The repository now has a **working implementation foundation** for MVP v2 domain logic, OCR abstraction, and message import processing, with corresponding tests written. Full MVP completion still requires persistence, UI integration, preprocessing pipeline completion, and running tests in an environment that allows package installation.
