# Landlord MVP v2 — Implementation Session Report
**Date:** March 24, 2026
**Scope:** test run, storage adapter, image preprocessing, gap detector

## Decisions recorded
- `decision.architecture-complexity`: marked **resolved** in the plan and ADR already present.
- `decision.lawyer-entity-mvp`: marked **resolved** in the plan; minimal Lawyer entity is present in domain types with `name`, `contacted`, `notes`, `questions[]`.
- `decision.capacitor-vs-pwa`: confirmed still recorded as resolved (`PWA only`).

## Step 1 — Existing tests
- Ran `npm test`.
- Environment result: failed before test execution (`vitest: not found`).
- Attempted remediation: `npm install` failed with registry policy (`403 Forbidden`).

## Step 2 — IndexedDB storage adapter (Phase 2)
Implemented:
- `CaseRepository` port in `app/ports/CaseRepository.ts`.
- IndexedDB adapter in `app/storage/IndexedDbCaseRepository.ts`.
- Schema stores: `cases`, `evidence`, `messages`.
- Migration behavior v1→v2:
  - adds missing `messages` store.
  - backfills missing `lastExportedAt` on existing `cases` records with `null`.

Tests added:
- `tests/storage/storage.test.ts`
  - in-memory fake repository tests the port contract.
  - fake-indexeddb smoke test validates v1→v2 migration path and expected stores.

## Step 3 — `prepareImageForOcr` implementation
Implemented:
- Replaced stub with EXIF rotation logic using `exifr.rotation()`.
- Rotates images via `createImageBitmap` + `OffscreenCanvas` when EXIF angle exists.
- Returns unchanged file when EXIF data is absent or no rotation required.

Tests added:
- `tests/application/prepareImageForOcr.test.ts`
  - no-EXIF fixture unchanged.
  - rotated fixture returns new file.
  - upload pipeline ordering test confirms preprocessing runs before OCR extraction.

Fixtures added:
- `tests/fixtures/images/with-exif-rotation.jpg`
- `tests/fixtures/images/without-exif-rotation.jpg`

Dependency updates:
- Added `exifr`.
- Added `fake-indexeddb` as dev dependency for IndexedDB smoke test.

## Step 4 — Gap detector seed rules (Phase 5)
Implemented:
- New pure function `detectGaps(caseData: Case): Gap[]` in `app/domain/gapDetector.ts`.
- Rules:
  - `gap.missingLease`
  - `gap.missingPaymentRecord`
  - `gap.missingRentIncreaseNotice`
  - `gap.noConfirmedDates`
- Positive-evidence-only baseline: empty case returns no gaps.

Tests added:
- `tests/domain/gapDetector.test.ts`
  - trigger and non-trigger cases for each rule.
  - empty-case baseline assertion.

## Additional alignment updates
- Expanded `Case` type with `evidence[]` and `messages[]` for gap detection input.
- Kept compatibility re-export in `app/domain/gapDetection.ts`.

## Outstanding issue
- Tests could not be executed in this environment because package installation is blocked by `npm` registry policy (`403 Forbidden`), so `vitest` binary is unavailable.
