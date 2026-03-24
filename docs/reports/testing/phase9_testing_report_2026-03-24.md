# Testing Report — Phase 9 + Vision/Cloud OCR + Lawyer CRUD

**Date:** 2026-03-24
**Branch:** `claude/phase-9-tests-crud-qmwc9`
**Session scope:** Phase 9 Playwright E2E setup, Vision OCR tier, Cloud OCR tier, Lawyer entity CRUD, markdown export fix.

---

## 1. Summary

| Category | Files | Tests | Result |
|----------|------:|------:|--------|
| Vitest — domain | 5 | 50 | ✅ All pass |
| Vitest — OCR (existing) | 1 | 4 | ✅ All pass |
| Vitest — OCR Vision (new) | 1 | 7 | ✅ All pass |
| Vitest — OCR Cloud (new) | 1 | 5 | ✅ All pass |
| Vitest — storage | 1 | 4 | ✅ All pass |
| Vitest — messages | 1 | 5 | ✅ All pass |
| Vitest — application | 2 | 4 | ✅ All pass |
| **Vitest total** | **13** | **83** | ✅ **83/83 pass** |
| Playwright E2E (Phase 9) | 1 | 3 | ⏳ Scaffolded; browser binary install required to execute |

---

## 2. Vitest Results (Full Run)

```
 RUN  v2.1.9 /home/user/case

 ✓ tests/domain/gapDetector.test.ts         (12 tests)
 ✓ tests/domain/claimsOps.test.ts           (19 tests)
 ✓ tests/storage/storage.test.ts            (4 tests)
 ✓ tests/domain/markdownExport.test.ts      (6 tests)
 ✓ tests/domain/lawyerOps.test.ts           (10 tests)
 ✓ tests/messages/messages.test.ts          (5 tests)
 ✓ tests/ocr/vision/vision.test.ts          (7 tests)
 ✓ tests/domain/domain.test.ts              (4 tests)
 ✓ tests/application/prepareImageForOcr.test.ts (3 tests)
 ✓ tests/ocr/cloud/cloud.test.ts            (5 tests)
 ✓ tests/ocr/ocr.test.ts                    (4 tests)
 ✓ tests/application/exportCase.test.ts     (1 test)
 ✓ tests/domain/evidenceOps.test.ts         (3 tests)

 Test Files  13 passed (13)
      Tests  83 passed (83)
   Duration  ~1.8s
```

---

## 3. New Test Suites

### 3.1 `tests/ocr/vision/vision.test.ts` — 7 tests

Covers `VisionOcrService` adapter:

| # | Test | Status |
|---|------|--------|
| 1 | Returns `tier=vision`, high confidence for score ≥0.9 | ✅ |
| 2 | Confidence 0.75 → medium | ✅ |
| 3 | Confidence 0.3 → low | ✅ |
| 4 | `isAvailable()` delegates to engine flag | ✅ |
| 5 | Throws `OcrError` when engine reports unavailable | ✅ |
| 6 | Wraps engine rejection in `OcrError` | ✅ |
| 7 | Falls back to `vision-unknown` engine version when not provided | ✅ |

### 3.2 `tests/ocr/cloud/cloud.test.ts` — 5 tests

Covers `CloudOcrService` adapter:

| # | Test | Status |
|---|------|--------|
| 1 | Returns `tier=cloud` with correct fields for high-confidence result | ✅ |
| 2 | Confidence 0.8 → medium | ✅ |
| 3 | Confidence 0.5 → low | ✅ |
| 4 | `isAvailable()` always returns true (structurally ready) | ✅ |
| 5 | Wraps engine rejection in `OcrError` | ✅ |

### 3.3 `tests/domain/lawyerOps.test.ts` — 10 tests

Covers `createLawyer` factory and all `lawyerOps` CRUD functions:

| # | Test | Status |
|---|------|--------|
| 1 | `createLawyer` factory defaults (empty firm, unknown type, contacted=false) | ✅ |
| 2 | `createLawyer` respects all provided fields | ✅ |
| 3 | `addLawyer` appends to `case.lawyers`; does not mutate original | ✅ |
| 4 | `updateLawyer` patches only specified fields | ✅ |
| 5 | `removeLawyer` removes the correct entry by id | ✅ |
| 6 | `markLawyerContacted` sets `contacted=true` | ✅ |
| 7 | `addQuestionToLawyer` appends question to lawyer | ✅ |
| 8 | `addQuestionToLawyer` is no-op for unknown lawyerId | ✅ |
| 9 | `getAllLawyerQuestions` aggregates questions across all lawyers | ✅ |
| 10 | `getAllLawyerQuestions` returns `[]` for empty case | ✅ |

---

## 4. Pre-existing Suite Changes

### 4.1 `tests/storage/storage.test.ts`

- **Added** `saveLawyers` / `listLawyers` to `InMemoryCaseRepository` to satisfy the updated `CaseRepository` port contract.
- **Updated** IndexedDB smoke test to include `'lawyers'` in the expected object store list (schema now at v4).
- All 4 existing tests continue to pass.

### 4.2 `tests/domain/markdownExport.test.ts` — Bug fix

- **Root cause:** Test expected `## Key evidence` heading in `lawyerSummary` variant, but the export function did not emit that section.
- **Fix:** Added `## Key evidence` + evidence list to the `lawyerSummary` branch in `app/domain/markdownExport.ts`.
- All 6 markdown export tests now pass.

---

## 5. Phase 9 — Playwright E2E Tests

### 5.1 Configuration

**File:** `playwright.config.ts` (project root)

- Test directory: `tests/e2e/`
- Browser: Chromium (Desktop Chrome profile)
- Base URL: `http://localhost:5173` (Vite dev server)
- `webServer` block: auto-starts `npm run dev:ui` before test run
- Retries: 1 on CI, 0 locally
- Trace: collected on first retry

### 5.2 Happy-path spec: `tests/e2e/happy-path.spec.ts`

Three tests covering the complete Phase 9 happy path:

| # | Test | Assertions |
|---|------|-----------|
| 1 | **Add evidence via form** | Evidence item appears in Timeline (count=1, title visible) |
| 2 | **Import iMazing CSV** | 3 valid messages imported; appear in Timeline (count=3) |
| 3 | **Full happy path** | Evidence + CSV combined: 4 timeline items; both evidence title and message body visible |

Each test uses `beforeEach` to clear the `case-organizer` IndexedDB database and reload, ensuring isolation.

### 5.3 Execution status

| Step | Status | Notes |
|------|--------|-------|
| Playwright package installed (`@playwright/test ^1.58.2`) | ✅ | Added to `devDependencies` |
| `playwright.config.ts` created | ✅ | |
| `tests/e2e/happy-path.spec.ts` created | ✅ | 3 tests |
| `npm run test:e2e` script added | ✅ | |
| Browser binary download | ⏳ | Requires `npx playwright install chromium` (network access needed) |
| E2E test run | ⏳ | Pending browser binary |

To execute E2E tests once browser binaries are available:
```bash
npx playwright install chromium
npm run test:e2e
```

---

## 6. Test Coverage by Module

| Module | Unit tests | Integration | E2E |
|--------|-----------|-------------|-----|
| `app/ocr/vision/` | ✅ (7) | — | — |
| `app/ocr/cloud/` | ✅ (5) | — | — |
| `app/ocr/tesseract/` | ✅ (2) | — | — |
| `app/ocr/tiered/selectTier` | ✅ (1) | — | — |
| `app/domain/lawyerOps` | ✅ (10) | — | — |
| `app/domain/claimsOps` | ✅ (19) | — | — |
| `app/domain/markdownExport` | ✅ (6) | — | — |
| `app/domain/gapDetector` | ✅ (12) | — | — |
| `app/domain/factories + timeline` | ✅ (4) | — | — |
| `app/domain/evidenceOps` | ✅ (3) | — | — |
| `app/storage/IndexedDbCaseRepository` | — | ✅ (1) | — |
| `app/ports/CaseRepository` (in-memory fake) | — | ✅ (3) | — |
| `app/messages/parsers` | ✅ (5) | — | — |
| `app/application/prepareImageForOcr` | ✅ (3) | — | — |
| `app/application/exportCase` | ✅ (1) | — | — |
| Web UI (full flow) | — | — | ⏳ (3) |

---

## 7. Known Limitations

1. **Playwright browser binaries:** Must be installed separately (`npx playwright install`). This requires outbound network access which was unavailable in the development environment.
2. **Vision OCR:** `VisionOcrService.isAvailable()` returns `false` in the PWA (no native host). Tests cover the service contract via stubs; actual platform testing requires a Capacitor build.
3. **Cloud OCR:** `CloudOcrService` requires a real provider engine injected at runtime. No live provider credentials exist; tests use stubs.
4. **Web UI Lawyer CRUD:** The `lawyers` domain layer and storage are complete, but the vanilla TS web UI (`web/main.ts`) does not yet render a Lawyers screen. This is post-MVP UI work.
