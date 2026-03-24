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
- `Case` type extended with v2 fields (additive — no v1 fields removed)
- `EvidenceCategory` expanded with v2 document types
- New UI: Home / Canvas, Case Brief, Consultation Mode, Library, Settings
- v1 completion items: screenshot OCR wiring, ADR-002 file
- All existing v1 features remain accessible

### Out of scope
- Sync folder OAuth (placeholder UI only — "coming soon")
- Cloud OCR (already deferred in v1 plan)
- PDF rendering inside ZIP export (export package produces Markdown + organized folders; PDF rendering deferred)
- Capacitor native build
- Court filing or legal document drafting

---

## 3. Architecture

### What stays unchanged
The storage adapter pattern, OCR port interfaces, message parsers, and all pure domain functions are untouched. All existing unit tests and Playwright E2E tests continue to pass.

Specifically preserved without change:
- `app/ocr/` — all OCR tiers
- `app/messages/` — CSV and XML parsers, import orchestration
- `app/domain/gapDetector.ts`, `timeline.ts`, `exportReminder.ts`, `markdownExport.ts`, `claimsOps.ts`, `evidenceOps.ts`, `factories.ts`
- `app/storage/IndexedDbCaseRepository.ts` — extended (new fields, new method, DB version bump) but not replaced
- `app/ports/CaseRepository.ts` — extended with `listCases()`

### What gets replaced
`web/index.html`, `web/main.ts`, `web/styles.css` — replaced with the v2 UI. The v1 files are archived to `web/v1/` before replacement.

### Domain type extensions (`app/domain/types.ts`)

The `Case` type is extended additively. No v1 fields are removed. New optional fields are added so existing stored cases deserialize without error.

New fields on `Case`:
```typescript
// v2 additions — all optional so existing stored records remain valid
parties?: { tenant: string; landlord: string };
property?: { address: string; unit: string; jurisdiction: string };
tenancy?: { startDate: Date | null; monthlyRentOriginal: number | null; monthlyRentCurrent: number | null };
clientGoal?: string;
status?: 'ready' | 'gaps' | 'processing';
source?: 'drop-folder' | 'upload' | 'manual' | 'mixed';
timeline?: TimelineItem[];       // assembled by autoProcess, kept on Case for fast render
gaps?: Gap[];                    // populated by detectGaps inside autoProcess
libraryRefs?: string[];          // library item IDs surfaced as relevant
```

`EvidenceCategory` is expanded:
```typescript
// v1 (unchanged values kept)
// v2 additions:
export type EvidenceCategory =
  | 'lease' | 'payment' | 'rent-notice' | 'fee-notice' | 'other'  // v1
  | 'repair' | 'photo' | 'message' | 'amendment';                  // v2 additions
```

`IndexedDbCaseRepository` DB version bumped from 4 → 5. Migration: existing records remain valid (all new Case fields are optional); no data transformation required. A migration test is added.

### Multi-case support
`CaseRepository` port gains:
```typescript
listCases(): Promise<Case[]>;
```
Implementation uses `objectStore('cases').getAll()` (not a keyed index scan — the cases store has no secondary index, only a primary key). Returns all Case records with metadata only; evidence/messages are not joined at list time for performance.

### New application layer: `autoProcess.ts`

Full pipeline matching `case_v2_design_spec.md` Section 5:

```
File[]
  → CLASSIFY       classify(file) → EvidenceCategory + auto-label
  → EXTRACT META   extractMeta(file) → { date, amount, address, parties }
  → ASSEMBLE CASE  assignToCase() → match existing case or create new
  → BUILD TIMELINE buildTimeline(evidence[], messages[]) → TimelineItem[]   ← calls existing app/domain/timeline.ts
  → DETECT GAPS    detectGaps(case) → Gap[]                                  ← calls existing app/domain/gapDetector.ts
  → SUGGEST CLAIMS suggestClaims(case) → Claim[]                            ← new decision tree (see below)
  → SURFACE LIBRARY surfaceLibraryDocs(case, libraryItems) → string[]        ← matches by jurisdiction + claim type
  → Case (updated, persisted)
```

**CLASSIFY** — keyword + extension rules:

| Category | Extensions | Keywords |
|----------|-----------|----------|
| `lease` | PDF, DOCX | lease agreement, rental agreement, tenant, landlord, monthly rent |
| `rent-notice` | PDF | rent increase, notice of rent, effective date |
| `payment` | PDF, CSV | rent paid, balance, ledger, payment |
| `fee-notice` | PDF | late fee, notice to pay, notice to quit, unlawful detainer, eviction |
| `repair` | MSG, PDF, DOCX | repair, maintenance, fix, damage |
| `photo` | JPG, PNG, HEIC, WEBP | (extension match only; EXIF date extracted) |
| `message` | CSV, XML | (extension match; routed to message import path) |
| `amendment` | PDF, DOCX | amendment, addendum + lease keywords |
| `other` | any | (fallback; `requiresUserReview: true`) |

**EXTRACT META** — regex patterns:
- Dates: ISO, US (MM/DD/YYYY), written month ("February 2024"), EXIF for photos
- Dollar amounts: `$\d+[\d,]*(\.\d{2})?`
- Addresses: street number + street name pattern
- Party names: proximity to keywords "tenant", "landlord", "lessor", "lessee"

**SUGGEST CLAIMS** — new pure function `app/domain/claimSuggester.ts`. Decision tree mapping assembled facts → Claim suggestions. Six claim types from spec:
1. Retaliatory rent increase — repair request present + rent increase within 180 days
2. Breach of implied warranty of habitability — repair request with no landlord response
3. Failure to repair within reasonable time — repair request older than 30 days with no resolution
4. Wrongful eviction / unlawful detainer defense — eviction notice present
5. Illegal rent increase — rent increase amount extracted, jurisdiction set (ordinance comparison manual)
6. Retaliation for exercising tenant rights — legal notice + rent increase proximity

All suggestions use conservative framing (ADR-003): labelled as "Topics to discuss with your lawyer", not "Claims". Each cites which evidence triggered it.

**SURFACE LIBRARY DOCS** — pure function matching `Case.property.jurisdiction` and triggered claim types against library item metadata. Returns `string[]` of library item IDs.

---

## 4. New UI Screens

### 4.1 Home / Canvas (`screen-home`)

**Top bar:** "Cases" title + sync status (static dot — sync folder is OAuth-gated).

**Case list:** One row per case.
- Name (auto-generated from address + parties; editable)
- Item count + detected categories
- Status badge: `ready` / `gaps` / `processing` (matches `Case.status` values exactly)
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

Eight sections (matching spec section 7.2):
1. **Case Summary** — auto-generated paragraph from extracted facts; tap to edit inline
2. **Legal Framing** — jurisdiction + claim suggestions with statute citations and confidence
3. **Client Goal** — entered once; editable; shown on Consultation slide 1
4. **Timeline** — chronological events, source-linked, expandable
5. **Key Facts** — extracted items in plain language, each traceable to source
6. **Gaps** — flagged items with suggested questions; tap to mark resolved
7. **Library Docs Surfaced** — relevant library items with one-tap assign to case
8. **Source Files** — collapsed by default; all files listed and accessible

**Bottom bar:** evidence count · gap count · **▶ Consult** · **Share ⇢** · **Export ↗**

---

### 4.3 Consultation Mode (overlay)

Full-screen overlay launched from `▶ Consult` in Case Brief. ESC or exit button to close.

Navigation: Prev / Next buttons + dot indicators (6 dots) + progress bar + arrow keys.

| Slide | Content |
|-------|---------|
| 1 — Orientation | Case type, jurisdiction, client goal (`Case.clientGoal`), evidence strength bar, parties |
| 2 — The Dispute | Plain language summary, legal claims identified (from `suggestClaims`), library doc surfaced |
| 3 — The Proof | Each claim paired with source doc excerpt highlighted inline; message excerpts with silence notes; photo thumbnails with EXIF dates |
| 4 — Timeline | All events from `Case.timeline` in order, each with tappable source badge; key events highlighted |
| 5 — Gaps | Each gap from `Case.gaps` reframed as an exact question to ask the client |
| 6 — Ready | Status checklist; Export Package and Share action buttons |

---

### 4.4 Library (`screen-library`)

Flat list of documents not yet assigned to a specific case.

Auto-organized into groups: Tenant Rights · Ordinances / Local Law · Templates · Correspondence · Research / Reference · Unassigned.

Any item can be assigned to a case. When assigned, it surfaces in Case Brief section 7 and Consultation Mode slide 2 when it matches jurisdiction + claim type.

Upload entry point at top of screen.

---

### 4.5 Settings (`screen-settings`)

Five sections:
- **Sync folder** — Connect Google Drive / Dropbox (disabled placeholder; "coming soon")
- **Jurisdiction default** — state + city; drives library surfacing
- **Party defaults** — tenant name pre-filled on new cases
- **Export preferences** — Markdown / ZIP / both ("Markdown" = existing v1 export; "ZIP" = v2 structured export package per spec section 9; PDF rendering inside ZIP is deferred)
- **Reset / clear cache** — clears IndexedDB state

---

## 5. Data Flow

```
User drops folder
    → autoProcess(files[])
        → classify each file → EvidenceCategory + auto-label
        → extractMeta each file → { date, amount, address, parties }
        → assignToCase → match existing Case or create new
        → buildTimeline(evidence[], messages[]) → TimelineItem[]
        → detectGaps(case) → Gap[]
        → suggestClaims(case) → Claim[]
        → surfaceLibraryDocs(case, library) → libraryRefs[]
        → save updated Case to IndexedDB
    → render Home canvas (listCases() refreshed)
    → user opens Case Brief
        → loadCase(id) → render all 8 sections
        → user taps ▶ Consult → overlay opens, 6 slides from Case data
        → user taps Export → exportCaseMarkdown (v1 path) or ZIP package (v2 path)
```

---

## 6. v1 Completion Items

Bundled into this build:

1. **Screenshot OCR wiring** — wire image file through existing OCR pipeline when added via message import screenshot path; set `importSource: 'screenshot-ocr'` on resulting message
2. **ADR-002** — write `docs/decisions/ADR-002-capacitor-vs-pwa.md` as a standalone decision record (resolution: PWA only, Capacitor deferred post-MVP)

---

## 7. Testing Strategy

- **Domain type additions:** unit tests confirming new optional Case fields deserialize correctly from v1-era stored records
- **DB migration:** extend storage tests for DB_VERSION 4→5 migration; confirm existing case records survive
- **`listCases()`:** unit test confirming `objectStore('cases').getAll()` pattern returns all cases
- **Auto-processing pipeline:** one unit test per classification rule; one per extraction pattern; one for case assembly; one for each `suggestClaims` decision tree branch
- **New UI:** Playwright E2E tests extending `tests/e2e/` — drop folder happy path, case brief render (all 8 sections present), consultation mode navigation (6 slides, Prev/Next, ESC)
- All existing unit tests and Playwright E2E tests must continue to pass

---

## 8. Build Order

1. `EvidenceCategory` expansion + new `Case` fields in `types.ts` + DB migration (v4→v5) + tests
2. `listCases()` on repository port + IndexedDB implementation (`objectStore('cases').getAll()`) + tests
3. `app/application/autoProcess.ts` — classify + extractMeta + assignToCase + pipeline orchestration + tests
4. `app/domain/claimSuggester.ts` — decision tree for 6 claim types + tests
5. New UI shell (`web/index.html` v2, `web/styles.css` v2)
6. Home / Canvas screen wired to `listCases()` + `autoProcess`
7. Case Brief screen (all 8 sections)
8. Consultation Mode overlay (6 slides)
9. Library screen
10. Settings screen
11. v1 completion: screenshot OCR wiring + ADR-002
12. Playwright E2E tests for new screens
