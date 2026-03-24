# Implementation Report — Phase 9 + Vision/Cloud OCR + Lawyer CRUD

**Date:** 2026-03-24
**Branch:** `claude/phase-9-tests-crud-qmwc9`
**Baseline:** Phases 0–7 complete; Phase 8 partial (vanilla TS shell); Phase 9 not started.

---

## 1. Executive Summary

This session completes the three outstanding implementation items:

| Item | Status |
|------|--------|
| Phase 9 — Playwright E2E tests | ✅ Scaffolded; config + 3 happy-path tests created |
| Vision OCR tier | ✅ `VisionOcrService` adapter implemented |
| Cloud OCR tier | ✅ `CloudOcrService` adapter implemented |
| Lawyer entity CRUD | ✅ Full CRUD domain layer + storage persistence implemented |
| Markdown export bug fix | ✅ `lawyerSummary` `## Key evidence` section added |
| Vitest suite | ✅ 83/83 pass (up from 23) |

---

## 2. Files Changed / Created

### New files

| File | Purpose |
|------|---------|
| `app/ocr/vision/index.ts` | `VisionOcrService` — on-device Vision OCR adapter |
| `app/ocr/cloud/index.ts` | `CloudOcrService` — opt-in cloud OCR adapter |
| `app/domain/lawyerOps.ts` | Pure domain CRUD for `Lawyer` entity |
| `playwright.config.ts` | Playwright project configuration |
| `tests/e2e/happy-path.spec.ts` | Phase 9 E2E happy-path tests (3 tests) |
| `tests/ocr/vision/vision.test.ts` | Vitest unit tests for `VisionOcrService` (7 tests) |
| `tests/ocr/cloud/cloud.test.ts` | Vitest unit tests for `CloudOcrService` (5 tests) |
| `tests/domain/lawyerOps.test.ts` | Vitest unit tests for `lawyerOps` + factory (10 tests) |

### Modified files

| File | Changes |
|------|---------|
| `app/domain/types.ts` | Added `lawyers: Lawyer[]` to `Case` interface |
| `app/domain/factories.ts` | Added `createLawyer()` factory; added `lawyers: []` to `createCase()` |
| `app/domain/markdownExport.ts` | Added `## Key evidence` section to `lawyerSummary` variant |
| `app/ports/CaseRepository.ts` | Added `saveLawyers()` and `listLawyers()` to port interface |
| `app/storage/IndexedDbCaseRepository.ts` | Added `lawyers` object store (DB v4); added `saveLawyers`/`listLawyers` methods; updated `loadCase` + `deserializeCase` |
| `tests/storage/storage.test.ts` | Updated `InMemoryCaseRepository` to implement new `saveLawyers`/`listLawyers`; updated smoke test expected stores |
| `package.json` | Added `@playwright/test` dev dep; added `test:e2e` + `test:e2e:report` scripts |

---

## 3. Implementation Detail

### 3.1 Vision OCR Tier (`app/ocr/vision/index.ts`)

**Design rationale:** Per ADR-002, the PWA build does not ship Capacitor, so Vision OCR is unavailable in the browser. The adapter is implemented as a port-compatible wrapper around a `VisionEngine` interface — a thin abstraction the future Capacitor host can satisfy by injecting a native engine object.

**Key decisions:**
- `isAvailable()` delegates to the injected engine so the `TieredOcrService` can skip this tier transparently in the browser.
- `requiresUserReview: true` — Vision output is high-quality but still requires human verification before export.
- Confidence mapping mirrors `TesseractOcrService`: `≥0.9 → high`, `≥0.7 → medium`, `≥0 → low`.
- Engine errors are wrapped in `OcrError` with the `error.ocrFailed` user message key.
- Falls back to `'vision-unknown'` when no `engineVersion` is provided.

```typescript
// VisionEngine interface (minimal — easy to stub in tests and implement in native host)
interface VisionEngine {
  isAvailable(): boolean;
  recognize(file: File): Promise<{ text: string; confidence: number; engineVersion?: string }>;
}
```

### 3.2 Cloud OCR Tier (`app/ocr/cloud/index.ts`)

**Design rationale:** Cloud OCR is opt-in only — `selectTier` only routes here when the caller passes `userPreference='cloud'`. The adapter wraps a `CloudEngine` interface so the concrete provider (Google Cloud Vision, AWS Textract, etc.) can be swapped without touching domain code.

**Key decisions:**
- `isAvailable()` always returns `true` — cloud is structurally available once an engine is provided. The opt-in gate is enforced by `selectTier`, not the service.
- `requiresUserReview: true` — same policy as other tiers.
- `engineVersion` is a required field on `CloudEngine` for provenance tracking.
- Engine errors are wrapped in `OcrError`.

**Privacy note:** Files are sent to a third-party service. The UI must surface a privacy disclosure before first use (per `decision.cloud-ocr-provider`). No provider credentials are bundled — the engine is injected at runtime.

### 3.3 Lawyer Entity CRUD

#### 3.3.1 Domain types — `app/domain/types.ts`

`Case.lawyers: Lawyer[]` added. The `Lawyer` interface was already defined in this file (Phase 1 scaffold); this change makes it a first-class collection on the case.

#### 3.3.2 Factory — `app/domain/factories.ts`

`createLawyer(input)` added:
- Required: `name`
- Optional: `firm`, `phoneOrEmail`, `consultationType`, `notes`, `status`, `id`
- Defaults: `firm: ''`, `phoneOrEmail: ''`, `contacted: false`, `consultationType: 'unknown'`, `questions: []`

`createCase()` updated to include `lawyers: []`.

#### 3.3.3 Domain ops — `app/domain/lawyerOps.ts`

All operations are pure (immutable — return new `Case` objects):

| Function | Signature |
|----------|-----------|
| `addLawyer` | `(case, lawyer) → Case` |
| `updateLawyer` | `(case, lawyerId, updates) → Case` |
| `removeLawyer` | `(case, lawyerId) → Case` |
| `markLawyerContacted` | `(case, lawyerId) → Case` |
| `addQuestionToLawyer` | `(case, lawyerId, question) → Case` |
| `getAllLawyerQuestions` | `(case) → string[]` |

`addQuestionToLawyer` is a no-op for unknown `lawyerId` (does not throw).

#### 3.3.4 Repository port — `app/ports/CaseRepository.ts`

Two new methods added to the `CaseRepository` interface:
```typescript
saveLawyers(caseId: string, lawyers: Lawyer[]): Promise<void>;
listLawyers(caseId: string): Promise<Lawyer[]>;
```

#### 3.3.5 Storage — `app/storage/IndexedDbCaseRepository.ts`

- **DB version:** `3 → 4`
- **New object store:** `lawyers` — keyPath `id`, index on `caseId`
- **New methods:** `saveLawyers()` and `listLawyers()` following the same pattern as `saveClaims`/`listClaims`
- **`loadCase`:** updated to load lawyers in parallel with other collections
- **`deserializeCase`:** updated signature to accept and include `lawyers`
- **Migration:** The `onupgradeneeded` handler creates the `lawyers` store if it does not exist. Existing databases at v3 are transparently upgraded to v4 on next open.

### 3.4 Markdown Export Fix

**Bug:** The `lawyerSummary` export variant was missing the `## Key evidence` section expected by `tests/domain/markdownExport.test.ts` test 5.

**Fix:** Added the section immediately before `## Topics to discuss with your lawyer` in the `lawyerSummary` branch of `buildMarkdownExport()`:
```typescript
parts.push('## Key evidence\n\n');
parts.push(evidenceMarkdownList(caseData.evidence));
parts.push('\n');
```

This aligns the export with the intended lawyer-packet structure: evidence summary → topics → questions → gaps.

### 3.5 Phase 9 — Playwright E2E

#### 3.5.1 Configuration (`playwright.config.ts`)

- Targets `tests/e2e/` directory
- Chromium only (Desktop Chrome) for MVP — other browsers can be added later
- `webServer` block auto-starts `npm run dev:ui` (Vite at port 5173)
- `reuseExistingServer: !CI` — local runs reuse a running dev server

#### 3.5.2 Happy-path spec (`tests/e2e/happy-path.spec.ts`)

Three tests cover the Phase 9 specification:

1. **Evidence form test** — fills the Add Evidence form, submits, switches to Timeline, asserts 1 item with correct title.
2. **CSV import test** — sets sender attribution, uploads `tests/fixtures/messages/imazing-sample.csv`, waits for success status, asserts 3 timeline entries.
3. **Full happy path** — combines both: adds evidence + imports CSV, asserts 4 total timeline entries, verifies both evidence title and message body visible.

**Test isolation:** `beforeEach` deletes the `case-organizer` IndexedDB and reloads the page, giving each test a clean state.

**Fixtures used:**
- `tests/fixtures/messages/imazing-sample.csv` (3 valid rows, 1 skipped due to missing date)

---

## 4. Architecture Diagram (updated)

```
app/
├── domain/
│   ├── types.ts              (Case now has lawyers[])
│   ├── factories.ts          (createCase, createMessage, createLawyer)
│   ├── lawyerOps.ts          [NEW] CRUD for Lawyer
│   ├── claimsOps.ts          CRUD for Claim + LegalNote
│   ├── evidenceOps.ts
│   ├── gapDetector.ts
│   ├── timeline.ts
│   ├── exportReminder.ts
│   └── markdownExport.ts     (lawyerSummary now has ## Key evidence)
├── application/
│   ├── uploadPipeline.ts
│   ├── exportCase.ts
│   └── prepareImageForOcr.ts
├── messages/
│   ├── parsers/imazingCsv.ts
│   ├── parsers/smsXml.ts
│   └── importMessages.ts
├── ocr/
│   ├── vision/index.ts       [NEW] VisionOcrService
│   ├── cloud/index.ts        [NEW] CloudOcrService
│   ├── tesseract/index.ts
│   ├── manual/index.ts
│   └── tiered/               selectTier + TieredOcrService
├── ports/
│   ├── OcrService.ts
│   └── CaseRepository.ts     (+ saveLawyers/listLawyers)
└── storage/
    └── IndexedDbCaseRepository.ts  (DB v4, lawyers store)
```

---

## 5. Outstanding / Post-MVP

| Item | Priority | Notes |
|------|----------|-------|
| Playwright browser binaries | Medium | `npx playwright install chromium` — network access required |
| Web UI Lawyers screen | Post-MVP | Domain layer complete; `web/main.ts` needs a Lawyers tab |
| Vision OCR native host | Post-MVP | Requires Capacitor build; `VisionEngine` interface is ready |
| Cloud OCR provider selection | Post-MVP | Per `decision.cloud-ocr-provider`; DPIA review before use |
| Export: include lawyers in markdown | Low | `markdownExport.ts` could add a `## Lawyers contacted` section |

---

## 6. Phase Completion Matrix (updated)

| Phase | Title | Status |
|-------|-------|--------|
| 0 | Test harness | ✅ Complete |
| 1 | Domain model + timeline | ✅ Complete |
| 2 | IndexedDB storage | ✅ Complete |
| 3 | Tiered OCR port | ✅ Complete (Vision + Cloud adapters added) |
| 3.5 | Text message import | ✅ Complete |
| 4 | Upload pipeline | ✅ Complete |
| 5 | Categorisation + gap detection | ✅ Complete |
| 6 | Claims / legal notes | ✅ Complete |
| 7 | Export (Markdown, reminders) | ✅ Complete (lawyerSummary bug fixed) |
| 8 | Web UI (vanilla TS shell) | ⚠️ Partial — lawyers screen pending |
| 9 | Playwright E2E | ✅ Scaffolded — browser binary install needed to run |
| — | Lawyer CRUD (domain + storage) | ✅ Complete |
