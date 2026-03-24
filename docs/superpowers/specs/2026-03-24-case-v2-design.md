# Case Organizer — V2 Design

**Date:** 2026-03-24
**Status:** Approved
**References:**
- Spec: `docs/specs/case_v2_design_spec.md`
- Plan (v1 base): `docs/plans/landlord_mvp_tdd_v2.plan.md`
- Mockup: `docs/demos/case_organizer_mvp2_mockup.html`

---

## 1. Goal

Build the v2 Case Organizer on top of the existing v1 implementation. All v1 backend, tests, and features are preserved. The v2 build adds: auto-processing pipeline, multi-case support, and a new UI (Home canvas, Case Brief, Consultation Mode, Library, Settings). Auto-processing is the top priority.

---

## 2. Scope

### In scope
- Auto-processing pipeline (`app/application/autoProcess.ts`)
- Multi-case storage (listing all cases from IndexedDB)
- New UI: Home / Canvas, Case Brief, Consultation Mode, Library, Settings
- v1 completion items: screenshot OCR wiring, ADR-002 file
- All existing v1 features remain accessible

### Out of scope
- Sync folder OAuth (placeholder UI only — "coming soon")
- Cloud OCR (already deferred in v1 plan)
- Capacitor native build
- Court filing or legal document drafting

---

## 3. Architecture

### What stays unchanged
All of `app/` is untouched:
- Domain types (`app/domain/types.ts`)
- Storage adapter (`app/storage/IndexedDbCaseRepository.ts`)
- OCR tiers (`app/ocr/`)
- Message parsers (`app/messages/`)
- Gap detector (`app/domain/gapDetector.ts`)
- Markdown export (`app/domain/markdownExport.ts`)
- Claims ops (`app/domain/claimsOps.ts`)
- All 83 unit tests continue to pass

### What gets replaced
`web/index.html`, `web/main.ts`, `web/styles.css` — replaced with the v2 UI. The v1 files are archived to `web/v1/` before replacement.

### New application layer
One new module: `app/application/autoProcess.ts`

```
File[] → classify(file) → extractMeta(file) → assignToCase() → detectGaps() → Case
```

- **classify**: keyword + extension rules → assigns `EvidenceCategory`
- **extractMeta**: regex extraction of dates and dollar amounts from filename + text
- **assignToCase**: groups files by shared address / party names / date proximity; creates new case or merges into existing
- **detectGaps**: calls existing `detectGaps()` pure function
- No AI. All rules are deterministic and traceable.

Classification rules:

| Category | Extensions | Keywords |
|----------|-----------|----------|
| `lease` | PDF, DOCX | lease agreement, rental agreement, tenant, landlord, monthly rent |
| `rent-notice` | PDF | rent increase, notice of rent, effective date |
| `payment` | PDF, CSV | rent paid, balance, ledger, payment |
| `fee-notice` | PDF | late fee, notice to pay, unlawful detainer, eviction |
| `other` | any | (fallback) |

Unrecognized files get `category: 'other'`, `requiresUserReview: true`.

### Multi-case support
`IndexedDbCaseRepository` already supports multiple cases by `case_id`. The new UI removes the hardcoded `'mvp-local-case'` assumption. A new `listCases()` method is added to the repository port and implementation.

---

## 4. New UI Screens

### 4.1 Home / Canvas (`screen-home`)

**Top bar:** "Cases" title + sync status (static dot — sync folder is OAuth-gated).

**Case list:** One row per case.
- Name (auto-generated from address + parties; editable)
- Item count + detected categories
- Status badge: `ready` / `gaps` / `processing`
- Tap to open Case Brief

**Library entry:** Below active cases, one row with `library` badge.

**Intake toggle:** Dashed border button at bottom. Expands 2×3 grid:
- Sync Folder (disabled, "coming soon")
- Drop Folder → feeds `autoProcess.ts`
- Upload Files → feeds `autoProcess.ts`
- Import Messages → existing CSV/XML parsers
- Manual Entry → existing add evidence form
- Photo Batch → existing batch image import

**Bottom dock:** Cases · Timeline · Gaps · Export · Settings

---

### 4.2 Case Brief (`screen-brief`)

Accessed by tapping a case row. Back button returns to canvas.

Sections (in order):
1. **Case Summary** — auto-generated paragraph from extracted facts; tap to edit inline
2. **Legal Framing** — jurisdiction + claim suggestions with statute citations and confidence
3. **Timeline** — chronological events, source-linked, expandable
4. **Key Facts** — extracted items in plain language, each traceable to source
5. **Gaps** — flagged items with suggested questions; tap to mark resolved
6. **Source Files** — collapsed by default; all files listed and accessible

**Bottom bar:** evidence count · gap count · **▶ Consult** · **Share ⇢** · **Export ↗**

---

### 4.3 Consultation Mode (overlay)

Full-screen overlay launched from `▶ Consult` in Case Brief. ESC or exit button to close.

Navigation: Prev / Next buttons + dot indicators (6 dots) + progress bar + arrow keys.

| Slide | Content |
|-------|---------|
| 1 — Orientation | Case type, jurisdiction, client goal, evidence strength bar, parties |
| 2 — The Dispute | Plain language summary, legal claims identified, library doc surfaced |
| 3 — The Proof | Each claim paired with source doc excerpt highlighted inline; message excerpts with silence notes; photo thumbnails with EXIF dates |
| 4 — Timeline | All events in order, each with tappable source badge; key events highlighted |
| 5 — Gaps | Each gap reframed as an exact question to ask the client |
| 6 — Ready | Status checklist; Export Package and Share action buttons |

---

### 4.4 Library (`screen-library`)

Flat list of documents not yet assigned to a specific case.

Auto-organized into groups: Tenant Rights · Ordinances / Local Law · Templates · Correspondence · Research / Reference · Unassigned.

Any item can be assigned to a case. When assigned, it surfaces in Case Brief and Consultation Mode slide 2 when it matches jurisdiction + claim type.

Upload entry point at top of screen.

---

### 4.5 Settings (`screen-settings`)

Four sections:
- **Sync folder** — Connect Google Drive / Dropbox (disabled placeholder; "coming soon")
- **Jurisdiction default** — state + city; drives library surfacing
- **Party defaults** — tenant name pre-filled on new cases
- **Export preferences** — Markdown / ZIP / both

---

## 5. Data Flow

```
User drops folder
    → autoProcess(files[])
        → classify each file → EvidenceCategory
        → extractMeta each file → { date, amount, address, parties }
        → assignToCase → match or create Case
        → detectGaps(case) → Gap[]
    → save Case + Evidence to IndexedDB
    → render Home canvas (case list refreshed)
    → user opens Case Brief
        → loadCase → render all sections
        → user taps ▶ Consult → overlay opens
        → user taps Export → exportCaseMarkdown or ZIP
```

---

## 6. v1 Completion Items

Bundled into this build:

1. **Screenshot OCR wiring** — wire image file through existing OCR pipeline when added via "Import Messages" → screenshot path; set `importSource: 'screenshot-ocr'` on resulting message
2. **ADR-002** — write `docs/decisions/ADR-002-capacitor-vs-pwa.md` as a standalone decision record (resolution already exists in plan frontmatter: PWA only, Capacitor deferred)

---

## 7. Testing Strategy

- Auto-processing pipeline: pure function unit tests (Vitest) — one test per classification rule, one per extraction pattern, one for case assembly logic
- Multi-case storage: extend existing storage tests for `listCases()`
- New UI: Playwright E2E tests extending existing `tests/e2e/` suites — happy path for drop folder, case brief render, consultation mode navigation
- All existing 83 unit tests and 70 E2E tests must continue to pass

---

## 8. Build Order

1. `listCases()` on repository port + IndexedDB implementation + tests
2. `autoProcess.ts` + classification rules + extraction + tests
3. New UI shell (`web/index.html` v2, `web/styles.css` v2)
4. Home / Canvas screen wired to `listCases()` + `autoProcess`
5. Case Brief screen
6. Consultation Mode overlay
7. Library screen
8. Settings screen
9. v1 completion: screenshot OCR wiring + ADR-002
10. Playwright E2E tests for new screens
