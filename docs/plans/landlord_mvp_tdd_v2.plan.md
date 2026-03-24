---
name: Landlord MVP TDD — v2 (spec-aligned revision)
overview: >
  Surgical update to landlord_mvp_tdd_c6ad0408.plan.md, realigning the
  implementation plan with design spec v2. Changes cover: tiered OCR
  architecture (Vision → Tesseract → manual → cloud), text message import as a
  first-class domain feature, mobile/iOS platform gates, architecture tension
  resolution, export-as-backup, gap detection, and lawyer/consultation prep
  cut-line decision.
  
  Stack — React, Vitest, RTL, IndexedDB, tiered OCR (Vision/Tesseract/manual),
  Markdown export, optional Capacitor wrapper.
  
  Source specs:
    - docs/specs/landlord_case_organizer_design_spec_v2.md  (authoritative)
    
  Supersedes:
    - docs/plans/landlord_mvp_tdd_c6ad0408.plan.md (v1 plan, built against spec v1)

change_summary:
  - "Phase 1: Add Message entity and lastExportedAt to domain model"
  - "Phase 3: Replace Tesseract-only OCR with tiered OCR port"
  - "Phase 3.5 (new): Text message import — CSV + XML parsers, timeline integration"
  - "Phase 4: Expand pipeline to handle tiered OCR results and manual caption path"
  - "Phase 5: Add gap detection pure function"
  - "Phase 7: Split export into lawyer-packet vs backup; add reminder logic"
  - "Phase 8: Mobile-first UI build order; add backup banner + consultation prep"
  - "Gates: Add PWA-vs-Capacitor decision gate before Phase 3; add iPhone QA gate"
  - "Architecture: Record explicit decision on ports/adapters vs simplified approach"

decisions_required_before_build:
  - id: decision.capacitor-vs-pwa
    question: "Ship as pure PWA or Capacitor-wrapped native app?"
    impact: "Determines whether Apple Vision OCR (Tier 1) is available. Blocks Phase 3."
    options:
      - "PWA only — Vision unavailable; Tesseract is Tier 1 in practice"
      - "Capacitor wrapper — Vision available; adds native build pipeline"
    resolution: "PWA only. Capacitor deferred to post-MVP."
    status: resolved

  - id: decision.architecture-complexity
    question: "Keep ports/adapters layering or simplify to direct module imports?"
    impact: "Affects repo layout, test injection patterns, and future extensibility."
    options:
      - "Keep ports/adapters — justified by testability, not enterprise scale"
      - "Simplify — thin seams only at OCR and storage boundaries"
    recommendation: >
      Keep ports/adapters. The spec v2 critique was about perceived complexity,
      not the testability benefit. For a solo project the cost is low and the
      benefit (injectable fakes for OCR and storage) is real. Document this
      rationale in the repo so the decision is not revisited silently.
    status: resolved

  - id: decision.lawyer-entity-mvp
    question: "Is the Lawyer Contact entity and Consultation Prep module in MVP scope?"
    impact: "Affects Phase 1 domain types and Phase 8 UI build order."
    options:
      - "In MVP — include Lawyer entity in Phase 1; add Consultation Prep screen to Phase 8"
      - "Post-MVP — cut from plan; note as deferred"
    recommendation: >
      Include a minimal Lawyer entity (name, contacted boolean, notes, questions[]).
      The questions list is low-cost and directly serves the app's core purpose.
      Full lawyer search tracker is post-MVP.
    status: resolved

  - id: decision.cloud-ocr-provider
    question: "Which cloud OCR provider for the post-MVP opt-in?"
    impact: "Privacy policy, subprocessor disclosure, per-image pricing."
    resolution: >
      Deferred until cloud OCR is pulled into scope. When ready, prefer
      Google Cloud Vision over AWS Textract for single-image document
      uploads (better accuracy on real-world photos; Textract pricing
      favors batch). Triggering this decision requires: privacy policy
      update, subprocessor disclosure, explicit user opt-in UI, and DPIA
      review.
    status: "deferred — do not implement until post-MVP"

  - id: decision.export-includes-images
    question: "Should export include original images or text only?"
    resolution: >
      Text only for MVP. Original images remain on device as the
      authoritative source (stated in disclaimers). Lawyers reviewing
      the export before consultation need the timeline and text content,
      not embedded images. If a lawyer requests specific photos, share
      them separately via Files app or AirDrop. Image-inclusive export
      is a post-MVP option.
    status: resolved

  - id: gate.claimsModuleLegalReview
    question: "Has the claims module copy been reviewed for UPL risk?"
    impact: >
      Blocks Phase 6. The risk is not the code — it is the strings
      shown to the user. Section headers, status labels, and framing
      language must not imply legal analysis or conclusions.
    how_to_clear: >
      Option A: Get an informal review from a tenant rights org or
      legal aid clinic. They will often do this for free for a
      non-commercial personal tool.
      Option B (if no reviewer available): Apply the conservative
      framing rule below and self-certify.
    conservative_framing_rule: >
      Every string in the claims module must pass this test: does it
      sound like a filing system or a notebook, not a legal assessment?
      Use "Things to bring up with your lawyer" not "Possible
      violations." Use "You noted this issue" not "This may constitute
      a claim." Use "Status: researching" not "Status: viable."
      If a string implies the app has evaluated the legal merit of
      anything, rewrite it.
    resolution: >
      Cleared via conservative framing rule (Option B self-certification).
      Every string in the claims module was reviewed against the rule:
      section header is "Topics to discuss with your lawyer" (not "Claims" or
      "Possible violations"); status values are "Researching / Ready to discuss /
      Resolved / Dropped" (notebook-style, no legal assessment); disclaimer
      appears in-app and in all exports; the app does not generate topics
      automatically — only the user adds them; no string implies the app has
      evaluated legal merit. See docs/decisions/ADR-003-claims-framing.md.
    status: "resolved — conservative framing rule applied; see ADR-003"

  - id: decision.github-pages-sync
    question: "Implement GitHub Pages encrypted share link?"
    resolution: >
      No. Excluded from MVP and from near-term post-MVP scope. The
      encryption requirement (cannot push plaintext sensitive legal
      documents to a public repo) adds meaningful complexity that is
      not justified by the use case. If a sharing mechanism is needed
      post-MVP, the first step is a password-protected HTML export
      sent via email or AirDrop — not a sync pipeline. Revisit only
      if a specific sharing need cannot be met by file export.
    status: "resolved — excluded"

---

# TDD Plan: Landlord Case Organizer MVP — v2

<a id="nav-top"></a>

<details open>
<summary><strong>On this page</strong> (navigation)</summary>

**Jump:** [Principles](#nav-principles) · [Architecture](#nav-architecture) · [Completion checklist](#nav-completion-checklist) · [Deferred](#nav-deferred)

<details>
<summary><strong>Phases 0–9 (v1/v2 base — complete)</strong></summary>

| Phase | Section |
|------|---------|
| 0 | [Test harness](#nav-phase-0) |
| 1 | [Domain + timeline](#nav-phase-1) |
| 2 | [IndexedDB storage](#nav-phase-2) |
| 3 | [OCR wrapper](#nav-phase-3) |
| 3.5 | [Text message import](#nav-phase-3-5) |
| 4 | [Upload pipeline](#nav-phase-4) |
| 5 | [Gap detection](#nav-phase-5) |
| 6 | [Claims / legal notes](#nav-phase-6) |
| 7 | [Export](#nav-phase-7) |
| 8 | [React UI](#nav-phase-8) |
| 9 | [Playwright E2E](#nav-phase-9) |

</details>

<details>
<summary><strong>Phases 10–15 (v2 build — new)</strong></summary>

| Phase | Section |
|------|---------|
| 10 | [Domain type extensions + DB migration](#nav-phase-10) |
| 11 | [Multi-case storage — listCases()](#nav-phase-11) |
| 12 | [Auto-processing pipeline + claim suggester](#nav-phase-12) |
| 13 | [New UI — Home, Case Brief, Consultation Mode, Library, Settings](#nav-phase-13) |
| 14 | [v1 completion items](#nav-phase-14) |
| 15 | [Playwright E2E — new screens](#nav-phase-15) |

</details>

- [What changed from v1](#nav-what-changed)
- [Principles](#nav-principles)
- [Architecture decision](#nav-architecture)

</details>

<a id="nav-what-changed"></a>

## What changed from v1 and why

_<a href="#nav-top">↑ On this page</a> · Next: [Principles](#nav-principles)_

<details open>
<summary><strong>v1 → v2 scope comparison</strong></summary>

Design spec v2 introduced six material changes that break alignment with the
original plan. This document patches each one surgically. Unchanged phases from
v1 are noted but not re-specified here; consult the original plan for their
full content.

| Area | v1 plan | v2 spec requirement | This plan |
|---|---|---|---|
| OCR architecture | Tesseract-only, single port | Tiered: Vision → Tesseract → manual → cloud | Phase 3 rewritten |
| Text message import | Not mentioned | First-class feature, higher priority than OCR for texts | Phase 3.5 added |
| Mobile platform | Not addressed | iPhone 16 / Safari primary; Capacitor optional | Gates + Phase 8 reordered |
| Architecture | Ports/adapters | Spec v2 calls it over-engineered | Decision recorded; ports kept with rationale |
| Export as backup | Phase 7 only | 7-day reminder, prompt after session, Files app | Phase 7 expanded; Phase 1 domain updated |
| Gap detection | Not mentioned | Case Builder surfaces likely-missing items | Phase 5 expanded |
| Lawyer / consultation prep | "Optional MVP" | Full data model in spec | Decision gate added |

</details>

---

<a id="nav-principles"></a>

## Principles (unchanged from v1)

_<a href="#nav-top">↑ On this page</a> · Prev: [What changed](#nav-what-changed) · Next: [Architecture](#nav-architecture)_

<details open>
<summary><strong>TDD principles</strong></summary>

Red–green–refactor for every behavior. No production code without a prior
failing test. Behavior-focused tests on real modules. Mock only slow or
non-deterministic boundaries. Add a contract/smoke path for real OCR so
shipped behavior is not only mocks.

</details>

---

<a id="nav-architecture"></a>

## Architecture decision (record here before build)

_<a href="#nav-top">↑ On this page</a> · Prev: [Principles](#nav-principles) · Next: [Phase 0](#nav-phase-0)_

<details open>
<summary><strong>Ports/adapters rationale (ADR-001)</strong></summary>

Resolve `decision.architecture-complexity` before writing any code. The
recommendation is to keep ports/adapters with this rationale written into
`docs/decisions/ADR-001-architecture.md`:

> The ports/adapters pattern is retained not for enterprise scalability but
> for testability. The OCR and storage boundaries are genuinely slow and
> non-deterministic; injectable fakes are the cleanest way to test around
> them. The pattern adds one interface file per boundary — that is the full
> cost. The spec v2 critique is acknowledged and this decision is recorded
> explicitly so it is not silently revisited.

</details>

---

<a id="nav-phase-0"></a>

## Phase 0 — Test harness (unchanged from v1)

_<a href="#nav-top">↑ On this page</a> · Next: [Phase 1](#nav-phase-1)_

<details open>
<summary><strong>Phase 0 notes</strong></summary>

No changes. Proceed as specified in v1 plan.

</details>

---

<a id="nav-phase-1"></a>

## Phase 1 — Domain model and timeline ← MODIFIED

_<a href="#nav-top">↑ On this page</a> · Prev: [Phase 0](#nav-phase-0) · Next: [Phase 2](#nav-phase-2)_

<details>
<summary><strong>Phase 1 — domain entities, timeline, export fields</strong> (expand)</summary>

All v1 content applies. The following additions are required.

<details>
<summary><strong>1a — Message entity</strong></summary>

### 1a. Add Message entity

The `Message` entity is a first-class domain type. It must be defined here
so the timeline builder, text message import (Phase 3.5), and export (Phase 7)
all work from the same type.

```typescript
// app/domain/types.ts (additions)

type MessageSender = 'you' | 'landlord' | 'other';
type MessageDirection = 'sent' | 'received';
type MessageImportSource = 'imazing-csv' | 'sms-xml' | 'screenshot-ocr' | 'manual';

interface Message {
  id: string;                        // stable UUID
  threadId: string;                  // groups messages by conversation
  dateTime: Date;                    // from structured export or OCR
  sender: MessageSender;
  direction: MessageDirection;
  body: string;
  importSource: MessageImportSource;
  tags: string[];
  notes: string;
}
```

**Tests to write (red first):**

- `createMessage()` factory produces a valid `Message` with stable id
- A `Message` with a `dateTime` value appears in the timeline alongside `Evidence` entries in correct chronological order
- Timeline builder with mixed `Evidence` and `Message` inputs returns a single sorted array with stable tie-break by id
- Messages from the same `threadId` can be grouped and retrieved as a thread
- Renaming a thread (changing the display label, not the id) does not break any linked evidence or claims

</details>

<details>
<summary><strong>1b — lastExportedAt on Case</strong></summary>

### 1b. Add lastExportedAt to Case

The export-as-backup behavior (Phase 7) requires knowing when the user last
exported. Add this field to the `Case` entity.

```typescript
// app/domain/types.ts (addition to Case)
interface Case {
  // ... existing fields ...
  lastExportedAt: Date | null;       // null = never exported
}
```

**Tests to write (red first):**

- A newly created case has `lastExportedAt: null`
- After export, `lastExportedAt` is updated to the export timestamp
- `needsExportReminder(case: Case, now: Date): boolean` returns `true` when
  `lastExportedAt` is null or more than 7 days before `now`
- Returns `false` when last export was within 7 days

</details>

<details>
<summary><strong>1c — Gap type</strong></summary>

### 1c. Gap detection types

Add the `Gap` type used by the gap detector in Phase 5.

```typescript
// app/domain/types.ts

interface Gap {
  id: string;              // e.g. 'gap.missingLease', 'gap.missingPaymentRecord'
  displayName: string;     // e.g. 'No original lease found'
  description: string;     // plain-language explanation for the user
  severity: 'suggested' | 'notable';
}
```

</details>

<details>
<summary><strong>1d — Lawyer entity</strong></summary>

### 1d. Lawyer entity (resolve decision.lawyer-entity-mvp first)

If the decision is "in MVP", add:

```typescript
interface Lawyer {
  id: string;
  name: string;
  firm: string;
  phoneOrEmail: string;
  contacted: boolean;
  consultationType: 'free' | 'paid' | 'legal-aid' | 'contingency' | 'unknown';
  notes: string;
  status: string;
  questions: string[];   // questions to ask this specific lawyer
}
```

If the decision is "post-MVP", add a `TODO` comment referencing the deferred
decision and skip Lawyer from all Phase 1 tests.

</details>

</details>

---

<a id="nav-phase-2"></a>

## Phase 2 — IndexedDB storage adapter (unchanged from v1)

_<a href="#nav-top">↑ On this page</a> · Prev: [Phase 1](#nav-phase-1) · Next: [Phase 3](#nav-phase-3)_

<details open>
<summary><strong>Phase 2 — IndexedDB schema & migration</strong></summary>

No changes to structure or test strategy. Extend the schema to include the
`messages` object store and the new `lastExportedAt` field on cases when
Phase 1 additions are complete. Write a migration test from the v1 schema
(without `messages` store) to the v2 schema (with it).

</details>

---

<a id="nav-phase-3"></a>

## Phase 3 — OCR wrapper ← REWRITTEN

_<a href="#nav-top">↑ On this page</a> · Prev: [Phase 2](#nav-phase-2) · Next: [Phase 3.5](#nav-phase-3-5)_

<details>
<summary><strong>Phase 3 — tiered OCR port & implementations</strong> (expand)</summary>

The v1 plan specified a single Tesseract.js wrapper. This phase now defines
a **tiered OCR port** that the rest of the system depends on, plus
infrastructure implementations for each tier.

### Platform decision: PWA only (Capacitor deferred)

Apple Vision (Tier 1) is not available in a PWA. Tesseract.js is therefore
Tier 1 in practice for MVP. Manual caption remains a first-class alternative.
The `OcrService` port and tier-selector logic are written as if Vision could
exist (so Capacitor can be added post-MVP without rewriting the port), but no
Vision infrastructure module is implemented in MVP.

### Port definition

```typescript
// app/ports/OcrService.ts

type OcrTier = 'vision' | 'tesseract' | 'manual' | 'cloud';

interface OcrResult {
  text: string;
  tier: OcrTier;
  requiresUserReview: boolean;  // always true for 'tesseract' and 'cloud'
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  extractedAt: Date;
  engineVersion?: string;       // for provenance
}

interface OcrService {
  extractText(file: File): Promise<OcrResult>;
  isAvailable(): boolean;       // lets orchestration check before calling
}
```

### Tier implementations (infrastructure layer)

Each lives in its own module under `app/ocr/`:

```
app/ocr/
  vision/index.ts     — DEFERRED (requires Capacitor; post-MVP)
  tesseract/index.ts  — Tier 1 for MVP (PWA)
  manual/index.ts     — Tier 2 for MVP
  cloud/index.ts      — DEFERRED (post-MVP opt-in). Preferred provider:
                        Google Cloud Vision. Do not implement until privacy
                        policy and DPIA are complete.
  tiered/index.ts     — Selects best available tier automatically
```

### Tier selector logic (pure, testable)

```typescript
// app/ocr/tiered/selectTier.ts

function selectTier(
  available: OcrTier[],
  userPreference?: OcrTier
): OcrTier {
  // Returns best available tier; never surfaces the choice to the user
  // unless they have explicitly opted into cloud
}
```

**Tests to write (red first):**

- When Vision is available (future Capacitor path), `selectTier` returns
  `'vision'` — write this test now so the port contract is proved even though
  Vision is not implemented in MVP
- When Vision is unavailable and Tesseract is available, returns `'tesseract'`
- When only manual is available, returns `'manual'`
- Cloud is never selected unless `userPreference === 'cloud'` is explicit
- Tesseract result has `requiresUserReview: true`
- Vision result has `requiresUserReview: false`
- Manual result (user typed the text) has `requiresUserReview: false`
- OCR result carries `tier`, `extractedAt`, and `engineVersion` for provenance
- Timeout on Tesseract produces a structured error with `userMessage` code (aligned with `error.ocrFailed` surface id) — not a silent failure
- Partial failure on Tesseract (low confidence) returns result with `confidence: 'low'` and `requiresUserReview: true`; does not throw

### Manual caption as first-class path

Manual entry is not a fallback — it is an equally valid input path. The
`manual` OCR implementation simply wraps user-supplied text in an `OcrResult`:

```typescript
// Result from user typing their own description
{
  text: userInput,
  tier: 'manual',
  requiresUserReview: false,
  confidence: 'high',    // user confirmed their own input
  extractedAt: now,
}
```

**Tests:**
- Manual caption produces an `OcrResult` with the same shape as a
  Tesseract or Vision result
- Evidence built from a manual caption has `ocrMethod: 'manual'` in its
  provenance fields
- The upload pipeline (Phase 4) handles a manual-tier result the same way
  it handles any other tier — no special casing in orchestration

</details>

---

<a id="nav-phase-3-5"></a>

## Phase 3.5 — Text message import ← NEW PHASE

_<a href="#nav-top">↑ On this page</a> · Prev: [Phase 3](#nav-phase-3) · Next: [Phase 4](#nav-phase-4)_

<details>
<summary><strong>Phase 3.5 — CSV/XML parsers & import orchestration</strong> (expand)</summary>

This phase is entirely new. It sits between Phase 3 (OCR) and Phase 4
(upload pipeline) because text message import is higher priority than OCR
for this evidence type and has no OCR dependency.

### What this phase delivers

A pure parsing module that converts structured export files (iMazing CSV,
SMS Backup & Restore XML) into arrays of `Message` domain entities, ready
for timeline insertion and persistence.

### Repo location

```
app/messages/
  parsers/
    imazingCsv.ts     — iMazing CSV → Message[]
    smsXml.ts         — SMS Backup & Restore XML → Message[]
  importMessages.ts   — orchestration: parse → validate → persist via port
```

### iMazing CSV format (expected columns)

**Important:** Do not write the parser against the publicly documented iMazing
CSV format. Column names have changed across iMazing versions. Before writing
any parser code, export a real iMazing CSV from the version installed on your
device and check it into `tests/fixtures/messages/imazing-sample.csv` (redact
any personal content first). The parser tests must run against this fixture
file, not against an assumed schema. If the fixture file does not exist, the
parser tests must fail loudly with a clear message: "Fixture file missing —
export a real iMazing CSV first."

Use the fixture’s actual column headers when implementing `parseImazingCsv`;
document any optional columns you discover in code comments.

```typescript
function parseImazingCsv(csvText: string): Message[]
```

### SMS Backup & Restore XML format

Each `<sms>` element has attributes: `date_sent` (unix ms), `address`,
`body`, `type` (1 = received, 2 = sent), `contact_name`.

```typescript
function parseSmsXml(xmlText: string): Message[]
```

### Tests to write (red first — all parsers are pure functions):

**iMazing CSV parser:**
- `tests/fixtures/messages/imazing-sample.csv` exists — if not, test suite
  exits with: `"Missing fixture: export imazing-sample.csv from your device
  before running parser tests"`
- Empty CSV → empty array, no throw
- Single message row → one `Message` with correct `dateTime`, `sender`, `direction`, `body`
- 50 message rows → 50 `Message` entities
- Sender attribution: rows where sender is the landlord's number → `direction: 'received'`; rows where sender is 'Me' or own number → `direction: 'sent'`
- Malformed row (missing date) → that row is skipped; remainder parsed; error logged with row index
- All resulting messages have `importSource: 'imazing-csv'`

**SMS XML parser:**
- `type=1` → `direction: 'received'`; `type=2` → `direction: 'sent'`
- `date_sent` (unix ms) correctly converted to `Date`
- All resulting messages have `importSource: 'sms-xml'`
- Malformed XML → throws a structured error (not a silent empty array)

**Timeline integration:**
- `Message[]` from parsed import merged with existing `Evidence[]` produces a
  single sorted timeline (test the merge/sort pure function from Phase 1)
- Thread grouping: messages with same `threadId` are retrievable as an ordered
  array

**Persistence (via port, fake storage injected):**
- `importMessages(messages, repo)` persists all messages and returns their ids
- Duplicate import detection: importing the same CSV twice does not create
  duplicate messages (define and test the deduplication key — suggested:
  hash of `dateTime + sender + body`)

### Screenshot fallback

Screenshot-based text message import uses the existing OCR pipeline from
Phase 3. No additional parser needed. The user reviews OCR output and
manually corrects sender attribution. This path produces `Message` entities
with `importSource: 'screenshot-ocr'` and `requiresUserReview: true`.

</details>

---

<a id="nav-phase-4"></a>

## Phase 4 — Upload → evidence pipeline ← MODIFIED

_<a href="#nav-top">↑ On this page</a> · Prev: [Phase 3.5](#nav-phase-3-5) · Next: [Phase 5](#nav-phase-5)_

<details>
<summary><strong>Phase 4 — upload pipeline & image prep</strong> (expand)</summary>

All v1 content applies. The following modifications are required.

### Handle tiered OCR results

The pipeline now receives an `OcrResult` (not a raw string) from the OCR
port. Update the orchestration to:

1. Store `tier`, `extractedAt`, and `engineVersion` in the evidence
   `provenance` field
2. Set `requiresUserReview` on the evidence record based on `OcrResult.requiresUserReview`
3. Never mark evidence as "reviewed" automatically for `tesseract` or
   `cloud` tier results

**Tests (additions to v1 Phase 4 tests):**
- Evidence built from a Vision result has `provenance.tier: 'vision'` and
  `requiresUserReview: false`
- Evidence built from a Tesseract result has `provenance.tier: 'tesseract'`
  and `requiresUserReview: true`
- Evidence built from a manual caption has `provenance.tier: 'manual'` and
  `requiresUserReview: false`
- The pipeline does not import or call `app/ocr/tesseract/` directly — it
  calls only the injected `OcrService` port

### Image cleanup step

V2 spec adds a lightweight pre-OCR image cleanup step (auto-rotate on EXIF,
basic contrast). This belongs in the pipeline before calling the OCR port.

```typescript
// app/application/prepareImageForOcr.ts
async function prepareImageForOcr(file: File): Promise<File>
```

**Tests:**
- File with EXIF rotation tag → returned file is rotated correctly (use a
  fixture image with known EXIF)
- File without EXIF → returned unchanged
- Pipeline calls `prepareImageForOcr` before calling `OcrService.extractText`

</details>

---

<a id="nav-phase-5"></a>

## Phase 5 — Categorization / gap detection ← MODIFIED

_<a href="#nav-top">↑ On this page</a> · Prev: [Phase 4](#nav-phase-4) · Next: [Phase 6](#nav-phase-6) · [Checklist: gaps](#nav-checklist-domain)_

<details>
<summary><strong>Phase 5 — gap detection & surface ids</strong> (expand)</summary>

V1 content (categorization) unchanged. Add gap detection.

### Gap detection pure function

```typescript
// app/domain/gapDetector.ts

function detectGaps(caseData: Case): Gap[]
```

This is a pure function with no I/O. It inspects the current state of
evidence and returns an array of `Gap` objects representing likely-missing
items. It does not draw legal conclusions — it notes organizational
absences.

### Gap detector design principle: positive-evidence-only

A gap is only flagged when the existing evidence implies something should
exist but doesn't. Never flag a gap just because a field is empty or a document
type hasn't been uploaded. For example: do not flag "missing lease" on every
new case — only flag it when a rent notice or fee notice is present (which
implies a tenancy and therefore a lease exists). This keeps gaps feeling like
useful observations rather than nagging. When in doubt, do not add the rule.

### Gap rules (seed set — extend with tests per rule)

| Gap id | Condition | Display name |
|---|---|---|
| `gap.missingLease` | Has any rent notice OR fee notice BUT no evidence tagged `lease` | "No lease or rental agreement found" |
| `gap.missingPaymentRecord` | Has a fee notice BUT no evidence tagged `payment` | "No payment records found" |
| `gap.missingRentIncreaseNotice` | Has evidence with extracted text matching rent increase keywords BUT category is not `rent-notice` | "Possible rent increase — no formal notice found" |
| `gap.noConfirmedDates` | More than half of evidence items have no confirmed date AND the case has 3 or more evidence items | "Most documents have no confirmed date — adding dates helps build your timeline" |

**Tests to write (red first):**
- Case with a rent notice evidence item but no lease-tagged evidence → returns
  `Gap` with `id: 'gap.missingLease'`
- Case with a lease evidence item and a rent notice → does not return
  `gap.missingLease`
- A case with no evidence at all returns an empty `Gap[]` — the detector does
  not flag gaps on an empty case
- All `Gap` objects have non-empty `id`, `displayName`, and `description`
- `detectGaps` is a pure function (same input → same output; no side effects)

### Product surface ids for gaps

Add to the surface registry:

```typescript
// app/product-surface/ids.ts (additions)
'gap.missingLease'
'gap.missingPaymentRecord'
'gap.missingRentIncreaseNotice'
'gap.noConfirmedDates'
'section.caseGaps'   // the UI section that renders gap suggestions
```

</details>

---

<a id="nav-phase-6"></a>

## Phase 6 — Claims and legal notes (unchanged from v1)

_<a href="#nav-top">↑ On this page</a> · Prev: [Phase 5](#nav-phase-5) · Next: [Phase 7](#nav-phase-7)_

<details open>
<summary><strong>Phase 6 — claims & legal notes</strong></summary>

**Gate: `gate.claimsModuleLegalReview` must be cleared before this phase
begins.** See `decisions_required_before_build` for how to clear it. Do not
write claims module UI copy until this gate is resolved.

No structural changes. Confirm that claim and legal note domain tests link
to v2 spec section headings (not v1), since section anchors may have changed.

</details>

---

<a id="nav-phase-7"></a>

## Phase 7 — Export ← MODIFIED

_<a href="#nav-top">↑ On this page</a> · Prev: [Phase 6](#nav-phase-6) · Next: [Phase 8](#nav-phase-8) · [Checklist: export](#nav-checklist-export)_

<details>
<summary><strong>Phase 7 — export variants, Markdown, reminders</strong> (expand)</summary>

<details>
<summary><strong>Lawyer packet vs backup contexts</strong></summary>

V1 covered Markdown export as a lawyer packet. V2 elevates export to serve
two distinct purposes: **lawyer packet** and **data backup**. These use the
same underlying serialization but have different trigger contexts, UX copy,
and reminder logic.

### Two export contexts

| Context | Trigger | Copy | File name suggestion |
|---|---|---|---|
| Lawyer packet | User action (export button) | "Prepare your lawyer packet" | `case-export-[date].md` |
| Backup | Reminder banner / auto-prompt | "Save a backup of your case" | `case-backup-[date].md` |

Both contexts produce the same file format. The distinction is in the UI
trigger and the `lastExportedAt` update.

</details>

<details>
<summary><strong>Reminder logic & Phase 7 tests</strong></summary>

### Reminder logic (pure function — already typed in Phase 1)

```typescript
// app/domain/exportReminder.ts
function needsExportReminder(lastExportedAt: Date | null, now: Date): boolean
```

This was defined in Phase 1 tests. Phase 7 ensures the export orchestration
calls `case.lastExportedAt = now` after every successful export, and that the
UI layer reads `needsExportReminder` to decide whether to show the banner.

**Additional Phase 7 tests:**
- After a successful export, `case.lastExportedAt` is updated to the export
  timestamp (test via fake repository)
- Markdown output for `export.fullCase` variant includes all sections
  defined in v2 spec: Property Summary, Rent History, Fee History,
  Communication Log, Evidence List, Possible Issues, Questions for Lawyer,
  Gaps (from `detectGaps`)
- Gaps section appears in output only when `detectGaps` returns non-empty
- All exports include the disclaimer block and OCR caveat (strings tested
  in snapshot or exact match)
- Markdown output does not contain any base64 image data or `![` image syntax
  referencing uploaded files
- Export includes the "text only" disclaimer string: "Original documents
  remain on your device and are the authoritative source. This export contains
  extracted or manually entered text only."
- Export does not throw if `lastExportedAt` is null

</details>

<details>
<summary><strong>Export variants & text-only MVP format</strong></summary>

### Export variants (update from v1)

Add `export.lawyerSummary` as a distinct variant from `export.fullCase`.
The summary contains: Claims, Questions, Key evidence (linked to claims
only). It omits: full evidence list, raw communication log.

**MVP export format: text only**

Exports contain text content, timeline, and metadata. Original images are not
embedded. All exports include the disclaimer: "Original documents remain on
your device and are the authoritative source. This export contains extracted
or manually entered text only." This disclaimer is required in every export
variant and must be tested in Phase 7 snapshot/string tests.

</details>

</details>

---

<a id="nav-phase-8"></a>

## Phase 8 — React UI ← MODIFIED

_<a href="#nav-top">↑ On this page</a> · Prev: [Phase 7](#nav-phase-7) · Next: [Phase 9](#nav-phase-9) · [Checklist: platform / QA](#nav-checklist-platform)_

<details>
<summary><strong>Phase 8 — React UI, surfaces, RTL tests, QA gate</strong> (expand)</summary>

<details>
<summary><strong>Mobile-first build order</strong></summary>

### Mobile-first build order

The v2 spec mandates iPhone 16 / Safari as primary. Reorder the Phase 8
build sequence to reflect this:

1. **App shell — mobile layout** (`screen.appShell`): bottom nav (5 tabs),
   floating action button, single-column viewport. Desktop layout is an
   enhancement added after mobile is stable.
2. **Inbox** (`screen.inbox`, `nav.inbox`): upload entry point; unreviewed
   items; zero required fields on upload
3. **Timeline** (`screen.timeline`, `nav.timeline`): chronological view of
   mixed `Evidence` and `Message` entries
4. **Evidence review** (`screen.evidenceDetail`): image + extracted text
   side by side; confirm / correct / replace text; shows `requiresUserReview`
   warning for Tesseract results
5. **Claims** (`screen.claims`)
6. **Law notes** (`screen.lawNotes`)
7. **Export + backup banner** (`screen.exportPreview`, `banner.exportReminder`)
8. **Consultation prep** (`screen.consultationPrep`) — if Lawyer entity is in
   MVP scope per decision.lawyer-entity-mvp

</details>

<details>
<summary><strong>New surface ids (v2 registry)</strong></summary>

### New surface ids (additions to v1 registry)

```typescript
// app/product-surface/ids.ts (additions for v2)

// Text message import
'screen.messageImport'
'action.importImazingCsv'
'action.importSmsXml'
'action.importMessageScreenshot'
'screen.threadView'

// Export backup
'banner.exportReminder'
'action.exportNow'
'action.dismissExportReminder'

// Gaps
'section.caseGaps'
'item.gap'             // individual gap item in the gaps section

// Consultation prep (if in MVP)
'screen.consultationPrep'
'action.addLawyerQuestion'
'action.addLawyerContact'
```

</details>

<details>
<summary><strong>Message import UI & RTL tests</strong></summary>

### Message import UI

Add the message import flow to the Quick Add menu:

```
Quick Add options:
  📷  Add photo or document    → existing upload flow
  💬  Import text messages     → screen.messageImport
  📝  Add note                 → existing note flow
  ⚖️  Add legal note           → existing legal note flow
  ❓  Add question for lawyer  → existing question flow
```

`screen.messageImport` has three entry points:
1. Import iMazing CSV (file picker, `.csv` only)
2. Import SMS Backup & Restore XML (file picker, `.xml` only)
3. Add screenshot (routes to existing upload + OCR flow)

**RTL tests:**
- Tapping "Import text messages" in Quick Add navigates to
  `screen.messageImport`
- File picker for iMazing CSV accepts `.csv` and rejects `.xml` and `.pdf`
- After successful CSV import, user sees a count of imported messages and
  a link to the timeline
- Imported messages appear in the timeline view interleaved with evidence

</details>

<details>
<summary><strong>Export reminder banner (RTL)</strong></summary>

### Export reminder banner

The `banner.exportReminder` renders when `needsExportReminder` returns `true`.

**RTL tests:**
- Banner is visible when `lastExportedAt` is null
- Banner is visible when `lastExportedAt` is more than 7 days ago
- Banner is not visible when `lastExportedAt` is within 7 days
- "Export now" button triggers export and dismisses the banner
- "Dismiss" button dismisses the banner for the current session (does not
  update `lastExportedAt`)

</details>

<details>
<summary><strong>Evidence review — OCR accuracy warning (RTL)</strong></summary>

### Evidence review UI — tiered OCR warnings

When `requiresUserReview` is `true` on an evidence item, the review screen
shows a visible warning (not a tooltip — a persistent inline notice):

> "Text was extracted automatically and may contain errors. Please review
> carefully before relying on it."

The warning references `label.extractedText` and `copy.ocrAccuracyWarning`
surface ids.

**RTL tests:**
- Evidence with `tier: 'tesseract'` shows the OCR accuracy warning
- Evidence with `tier: 'vision'` does not show the warning
- Evidence with `tier: 'manual'` does not show the warning
- Confirming the extracted text sets `requiresUserReview: false` on the
  evidence record

</details>

<details>
<summary><strong>Mobile QA gate (manual)</strong></summary>

### Mobile QA gate (manual, not automated)

<a id="nav-mobile-qa"></a>

Before any release, perform manual QA on a real iPhone (not simulator):

<details>
<summary><strong>iPhone QA checklist</strong> (expand)</summary>

- [ ] Upload a camera photo and confirm OCR or manual caption flow works
- [ ] Import a real iMazing CSV export and confirm messages appear in timeline
- [ ] Export a case and confirm file appears in Files app
- [ ] Bottom nav is reachable with one thumb; no interactive elements above safe area
- [ ] Touch targets meet 44×44pt minimum
- [ ] App is usable offline (upload, review, notes, timeline all function)
- [ ] Export reminder banner appears after simulating 7-day gap

</details>

This gate must be green before tagging any release candidate. See also [Completion checklist → Platform](#nav-checklist-platform).

</details>

</details>

---

<a id="nav-phase-9"></a>

## Phase 9 — Playwright E2E (unchanged from v1)

_<a href="#nav-top">↑ On this page</a> · Prev: [Phase 8](#nav-phase-8) · Next: [Completion checklist](#nav-completion-checklist)_

<details open>
<summary><strong>Phase 9 — Playwright E2E</strong></summary>

No structural changes. Expand the happy path to include one message import
step: create case → upload fixture → import fixture CSV → evidence and
messages visible in timeline.

</details>

---

---

<a id="nav-phase-10"></a>

## Phase 10 — Domain type extensions + DB migration ← NEW

_<a href="#nav-top">↑ On this page</a> · Next: [Phase 11](#nav-phase-11)_

<details>
<summary><strong>Phase 10 — Case v2 fields, EvidenceCategory expansion, DB v4→v5</strong> (expand)</summary>

All changes are additive. No v1 field is removed. Existing stored records must
deserialize without error after the migration.

### `EvidenceCategory` expansion (`app/domain/types.ts`)

Add four new values to the union:

```typescript
export type EvidenceCategory =
  | 'lease' | 'payment' | 'rent-notice' | 'fee-notice' | 'other'  // v1 — unchanged
  | 'repair' | 'photo' | 'message' | 'amendment';                  // v2 additions
```

### `Case` type extensions (`app/domain/types.ts`)

All new fields are optional so existing stored records remain valid without migration data backfill:

```typescript
// v2 additions to Case interface
parties?: { tenant: string; landlord: string };
property?: { address: string; unit: string; jurisdiction: string };
tenancy?: { startDate: Date | null; monthlyRentOriginal: number | null; monthlyRentCurrent: number | null };
clientGoal?: string;
status?: 'ready' | 'gaps' | 'processing';
source?: 'drop-folder' | 'upload' | 'manual' | 'mixed';
timeline?: TimelineItem[];
gaps?: Gap[];
libraryRefs?: string[];
```

### DB version bump (`app/storage/IndexedDbCaseRepository.ts`)

Bump `DB_VERSION` from 4 to 5. Migration function: no data transformation needed
(all new fields are optional). Existing case records remain valid.

**Tests to write (red first):**

- A case stored under DB_VERSION 4 (without v2 fields) opens under DB_VERSION 5 without error and without data loss on existing fields
- `createCase()` factory can be called without v2 fields; all new fields default to `undefined`
- A `Case` with all v2 fields set round-trips through `saveCase` / `loadCase` without data loss
- New `EvidenceCategory` values (`'repair'`, `'photo'`, `'message'`, `'amendment'`) are accepted by `setEvidenceCategory` without error
- `detectGaps` still passes all existing tests with the expanded `EvidenceCategory` type

</details>

---

<a id="nav-phase-11"></a>

## Phase 11 — Multi-case storage: listCases() ← NEW

_<a href="#nav-top">↑ On this page</a> · Prev: [Phase 10](#nav-phase-10) · Next: [Phase 12](#nav-phase-12)_

<details>
<summary><strong>Phase 11 — listCases() port + IndexedDB implementation</strong> (expand)</summary>

The existing repository stores cases keyed by `id` in the `cases` object store.
The new method returns all stored cases — used by the Home canvas to render
the case list.

### Port addition (`app/ports/CaseRepository.ts`)

```typescript
listCases(): Promise<Case[]>;
```

### Implementation note

The `cases` object store has no secondary index — only a primary key. Use
`objectStore('cases').getAll()` (no key argument). This is different from the
`indexGetAll()` helper used for evidence, messages, and claims, which all have
`caseId` indexes. Do not reach for `indexGetAll()` here.

```typescript
// IndexedDbCaseRepository.ts
async listCases(): Promise<Case[]> {
  return this.transaction(['cases'], 'readonly', tx =>
    this.getAll(tx.objectStore('cases'))
  );
}
```

Returns full `Case` records including evidence and messages arrays (loaded from
their stores on save, as the existing `loadCase` does). For list-view performance,
the Home canvas renders only `id`, `title`, `status`, and `evidence.length` from
each record — it does not join additional stores.

**Tests to write (red first):**

- `listCases()` on an empty database returns `[]`
- `listCases()` with two stored cases returns both, unordered
- A case saved with `saveCase` is returned by `listCases()`
- The in-memory fake repository (`tests/storage/`) implements `listCases()` per the port contract
- Existing `loadCase`, `saveCase`, `saveEvidence`, `listEvidence`, `saveMessages`, `listMessages` tests all still pass

</details>

---

<a id="nav-phase-12"></a>

## Phase 12 — Auto-processing pipeline + claim suggester ← NEW

_<a href="#nav-top">↑ On this page</a> · Prev: [Phase 11](#nav-phase-11) · Next: [Phase 13](#nav-phase-13)_

<details>
<summary><strong>Phase 12 — autoProcess.ts, claimSuggester.ts</strong> (expand)</summary>

This is the top-priority new capability. All functions are pure or
have injectable dependencies. No AI — all logic is deterministic rules.

### `app/application/autoProcess.ts`

Entry point: receives `File[]` + the current case list + a repository reference.
Runs the full pipeline and returns the updated (or newly created) `Case`.

```
File[]
  → classify(file)       → EvidenceCategory + auto-label
  → extractMeta(file)    → { date, amount, address, parties }
  → assignToCase()       → match existing Case or create new
  → buildTimeline()      → TimelineItem[]          ← app/domain/timeline.ts
  → detectGaps()         → Gap[]                   ← app/domain/gapDetector.ts
  → suggestClaims()      → Claim[]                 ← app/domain/claimSuggester.ts
  → surfaceLibraryDocs() → string[]                ← pure function, library item IDs
  → Case (persisted via repo)
```

### Classification rules (`classify` pure function)

| Category | Extensions | Keywords (filename or extracted text) |
|----------|-----------|---------------------------------------|
| `lease` | PDF, DOCX | lease agreement, rental agreement, tenant, landlord, monthly rent |
| `rent-notice` | PDF | rent increase, notice of rent, effective date |
| `payment` | PDF, CSV | rent paid, balance, ledger, payment |
| `fee-notice` | PDF | late fee, notice to pay, notice to quit, unlawful detainer, eviction |
| `repair` | MSG, PDF, DOCX | repair, maintenance, fix, damage |
| `photo` | JPG, JPEG, PNG, HEIC, WEBP | (extension only; EXIF date extracted) |
| `message` | CSV, XML | (extension only; routed to message import path) |
| `amendment` | PDF, DOCX | amendment, addendum + any lease keyword |
| `other` | any | (fallback; `requiresUserReview: true`) |

### Meta extraction (`extractMeta` pure function)

- **Dates:** ISO (YYYY-MM-DD), US (MM/DD/YYYY), written month ("February 2024"), EXIF timestamp for photos
- **Dollar amounts:** regex `\$\d[\d,]*(\.\d{2})?`
- **Addresses:** street number + street name pattern (e.g. "123 Main St")
- **Party names:** proximity to keywords "tenant", "landlord", "lessor", "lessee"

### Case assignment (`assignToCase` pure function)

- Match by shared address → merge into existing case
- Match by shared party names → merge into existing case
- No match → create new case (auto-named from address or parties)
- If address and parties are both unknown → create new case named by upload date

### `app/domain/claimSuggester.ts`

Pure function. Decision tree mapping assembled case facts → suggested `Claim[]`.
Conservative framing required (ADR-003): every claim suggestion is a "topic to
discuss with your lawyer", not a legal conclusion.

Six claim types (from `case_v2_design_spec.md` section 3):

| Claim type | Trigger condition |
|-----------|------------------|
| Retaliatory rent increase | `repair` evidence present + `rent-notice` within 180 days after repair request date |
| Breach of implied warranty of habitability | `repair` evidence with no landlord response message found |
| Failure to repair within reasonable time | `repair` evidence dated > 30 days ago with no resolution evidence |
| Wrongful eviction / unlawful detainer defense | `fee-notice` evidence with eviction keywords |
| Illegal rent increase | `rent-notice` with extracted dollar amount and `property.jurisdiction` set |
| Retaliation for exercising tenant rights | Legal notice evidence + `rent-notice` within 90 days |

Each suggestion records: `triggeredByEvidenceIds[]`, the rule that fired, and
`confidence: 'low' | 'medium' | 'high'` based on evidence completeness.

### `surfaceLibraryDocs` pure function (in `autoProcess.ts`)

Matches `Case.property.jurisdiction` and triggered claim types against a
`LibraryItem[]` list. Returns `string[]` of matching item IDs. Library items
have `jurisdiction` and `claimTypes[]` metadata fields.

**Tests to write (red first):**

_Classification:_
- Each category rule fires correctly on a matching filename
- Extension-only rules (photo, message) fire without keyword match
- `amendment` requires both amendment keyword AND a lease keyword
- Unknown file type falls through to `other` with `requiresUserReview: true`

_Meta extraction:_
- ISO date in filename → extracted correctly
- Written month date in text body → extracted correctly
- EXIF timestamp on photo file → extracted as `dateTime`
- Dollar amount regex matches `$1,200`, `$950`, `$1200.00`
- No match on any pattern → returns `{ date: null, amount: null, ... }`

_Case assignment:_
- Files sharing an address match to the same existing case
- Files with no address and no party match create a new case
- Creating a new case sets `source: 'drop-folder'` or `'upload'` based on intake

_Pipeline integration:_
- `autoProcess` calls `buildTimeline` (existing `timeline.ts`) after classification
- `autoProcess` calls `detectGaps` (existing `gapDetector.ts`) after timeline build
- `autoProcess` calls `suggestClaims` and stores result on `Case.claims`
- `autoProcess` persists the updated case via the injected repository

_Claim suggester:_
- Each of the six claim types triggers only when its condition is met
- No claim is suggested on an empty case
- A claim that fires cites the evidence IDs that triggered it
- All suggested claim strings pass the conservative framing rule (no legal conclusions)
- `suggestClaims` is a pure function (same input → same output; no side effects)

</details>

---

<a id="nav-phase-13"></a>

## Phase 13 — New UI: Home, Case Brief, Consultation Mode, Library, Settings ← NEW

_<a href="#nav-top">↑ On this page</a> · Prev: [Phase 12](#nav-phase-12) · Next: [Phase 14](#nav-phase-14)_

<details>
<summary><strong>Phase 13 — v2 web UI replacing web/</strong> (expand)</summary>

The v1 `web/` shell is archived to `web/v1/` before any changes. The new UI
replaces `web/index.html`, `web/main.ts`, and `web/styles.css` entirely.

Reference: `docs/demos/case_organizer_mvp2_mockup.html` for visual treatment
and interaction patterns.

### App shell

- Bottom dock: **Cases** · **Timeline** · **Gaps** · **Export** · **Settings**
  (5 tabs — Timeline and Gaps are global views across all cases)
- All v1 screens (Inbox, Evidence, Lawyer) are accessible within a case context,
  not as top-level dock tabs

### Screen: Home / Canvas (`screen-home`)

- Top bar: "Cases" title + sync status dot (static; sync folder is OAuth-gated)
- Case list: one row per case — name, item count + categories, status badge
  (`ready` / `gaps` / `processing`)
- Library entry below active cases
- Intake toggle (dashed border): expands 2×3 grid —
  Sync Folder (disabled, "coming soon"), Drop Folder, Upload Files,
  Import Messages, Manual Entry, Photo Batch
- Drop Folder and Upload Files feed `autoProcess()` from Phase 12
- Active case row → opens Case Brief

### Screen: Case Brief (`screen-brief`)

Eight sections (in order):
1. Case Summary — auto-generated; tap to edit inline
2. Legal Framing — jurisdiction + suggested claims with citations
3. Client Goal — `Case.clientGoal`; editable
4. Timeline — chronological events from `Case.timeline`; source-linked
5. Key Facts — extracted items; each traceable to source document
6. Gaps — from `Case.gaps`; tap to mark resolved; each shows suggested question
7. Library Docs Surfaced — from `Case.libraryRefs`; one-tap assign to case
8. Source Files — collapsed by default; all evidence accessible

Bottom bar: evidence count · gap count · **▶ Consult** · **Share ⇢** · **Export ↗**

### Screen: Consultation Mode (overlay, `consult-overlay`)

Full-screen overlay launched from `▶ Consult`. ESC or exit button to close.

Navigation: Prev / Next buttons + 6 dot indicators + progress bar + arrow keys.

| Slide | Content |
|-------|---------|
| 1 — Orientation | Case type, jurisdiction, `Case.clientGoal`, evidence strength bar, parties |
| 2 — The Dispute | Plain language summary, suggested claims, library doc surfaced |
| 3 — The Proof | Each claim with source excerpt highlighted inline; message excerpts with silence notes; photo thumbnails + EXIF dates |
| 4 — Timeline | All `Case.timeline` events; key events highlighted; tappable source badge per event |
| 5 — Gaps | Each `Case.gaps` item as an exact question to ask the client |
| 6 — Ready | Status checklist; Export Package + Share action buttons |

### Screen: Library (`screen-library`)

- Flat list of unassigned documents, grouped by type:
  Tenant Rights · Ordinances / Local Law · Templates · Correspondence · Research / Reference · Unassigned
- Upload entry at top
- Any item assignable to a case (sets `Case.libraryRefs`)
- Items surface in Case Brief section 7 and Consultation slide 2 when
  `jurisdiction` + `claimTypes` match

### Screen: Settings (`screen-settings`)

Five sections:
1. Sync folder — Google Drive / Dropbox (disabled placeholder; "coming soon")
2. Jurisdiction default — state + city; drives library surfacing
3. Party defaults — tenant name pre-filled on new cases
4. Export preferences — Markdown (v1 path) / ZIP structured package (v2 path; PDF rendering deferred) / both
5. Reset / clear cache — clears IndexedDB state

**Implementation notes:**
- Remove hardcoded `CASE_ID = 'mvp-local-case'` from `main.ts`; all case access
  is by dynamic ID from `listCases()` or route state
- Settings values stored in `localStorage`; no new IndexedDB store required

</details>

---

<a id="nav-phase-14"></a>

## Phase 14 — v1 completion items ← NEW

_<a href="#nav-top">↑ On this page</a> · Prev: [Phase 13](#nav-phase-13) · Next: [Phase 15](#nav-phase-15)_

<details>
<summary><strong>Phase 14 — screenshot OCR wiring + ADR-002</strong> (expand)</summary>

Two items carried forward from the v1 completion checklist.

### 14a — Screenshot OCR → `importSource: 'screenshot-ocr'`

Wire the image screenshot path through the existing OCR pipeline when a user
adds an image via the message import "screenshot" option:

1. User selects an image in the message import flow
2. Image passes through `prepareImageForOcr` (Phase 4)
3. Image passes through the tiered OCR service
4. Result is wrapped in a `Message` with `importSource: 'screenshot-ocr'`
   and `requiresUserReview: true`
5. Message is persisted and appears in the timeline

**Tests:**
- A JPEG passed through the screenshot path produces a `Message` with
  `importSource: 'screenshot-ocr'`
- The resulting message has `requiresUserReview: true`
- The OCR pipeline is called (verify via injected fake OCR service)

### 14b — ADR-002: Capacitor vs PWA

Write `docs/decisions/ADR-002-capacitor-vs-pwa.md` as a standalone decision
record. Resolution is already documented in the v2 plan frontmatter; this
phase moves it to a canonical ADR file.

Content: PWA only for MVP. Capacitor deferred post-MVP. Apple Vision OCR
(Tier 1) unavailable without Capacitor; Tesseract is Tier 1 in practice.
Port is ready for Capacitor addition without rewriting.

</details>

---

<a id="nav-phase-15"></a>

## Phase 15 — Playwright E2E: new screens ← NEW

_<a href="#nav-top">↑ On this page</a> · Prev: [Phase 14](#nav-phase-14) · Next: [Completion checklist](#nav-completion-checklist)_

<details>
<summary><strong>Phase 15 — E2E tests for v2 UI screens</strong> (expand)</summary>

Extends `tests/e2e/` alongside the existing `happy-path.spec.ts` and
`full-ui-validation.spec.ts`. All existing 70 E2E tests must continue to pass.

**Home / Canvas (`canvas.spec.ts`):**
- Fresh app shows empty case list with intake toggle
- Drop Folder intake: dropping a folder of mixed files creates a case row
- Created case row shows correct status badge (`ready` or `gaps`)
- Library row is present and navigates to Library screen

**Case Brief (`case-brief.spec.ts`):**
- Opening a case shows all 8 sections
- Case Summary section is present and editable
- Timeline section shows events in chronological order
- Gaps section shows gap items with suggested questions
- `▶ Consult` button is present and opens Consultation Mode overlay

**Consultation Mode (`consultation.spec.ts`):**
- Overlay opens on `▶ Consult` tap
- All 6 slides are navigable via Next / Prev buttons
- Dot indicators update as slides change
- ESC key closes the overlay
- Slide 6 shows Export and Share action buttons

**Library (`library.spec.ts`):**
- Library screen shows grouped document list
- Upload adds an item to the Unassigned group

**Settings (`settings.spec.ts`):**
- Jurisdiction field saves to localStorage and persists on reload
- Reset / clear cache clears IndexedDB and returns to empty state

</details>

---

<a id="nav-completion-checklist"></a>

## Completion checklist (additions to v1)

_<a href="#nav-top">↑ On this page</a> · Prev: [Phase 9](#nav-phase-9) · Next: [Deferred](#nav-deferred)_

<details open>
<summary><strong>Completion checklist — intro</strong></summary>

Implementation status reflects the repo as of the last plan update (domain/application/tests; **MVP UI is a Vite + vanilla TS shell** under [`web/`](../../web/) — Phase 8 React surfaces remain future work). Adjust checkboxes when scope changes.

</details>

<details open>
<summary><strong>MVP web UI (evidence category + export)</strong></summary>

<a id="nav-checklist-web-ui"></a>

- [x] Evidence detail: category control calls [`setEvidenceCategory`](../../app/domain/evidenceOps.ts), merges returned `Case` into app state (evidence array replaced), persists with [`saveEvidence`](../../app/ports/CaseRepository.ts) — [`web/main.ts`](../../web/main.ts)
- [x] Export: [`loadCase`](../../app/storage/IndexedDbCaseRepository.ts) assembles case, [`exportCaseMarkdown`](../../app/application/exportCase.ts) produces Markdown and updates `lastExportedAt`, client downloads the Markdown string — [`web/main.ts`](../../web/main.ts); dev: `npm run dev:ui`, production assets: `npm run build:ui` → `dist/web/`
- [x] Export reminder banner (non-blocking) driven by [`needsExportReminder`](../../app/domain/exportReminder.ts) — [`web/main.ts`](../../web/main.ts)

</details>

<details open>
<summary><strong>Domain additions</strong></summary>

<a id="nav-checklist-domain"></a>

- [x] `Message` entity defined with all fields from v2 data model — [`app/domain/types.ts`](../../app/domain/types.ts)
- [x] `Case.lastExportedAt` field present and tested — [`exportReminder.ts`](../../app/domain/exportReminder.ts), [`domain.test.ts`](../../tests/domain/domain.test.ts)
- [x] `Gap` type defined — [`types.ts`](../../app/domain/types.ts)
- [x] `needsExportReminder` pure function written and tested — [`exportReminder.ts`](../../app/domain/exportReminder.ts)
- [x] `detectGaps` pure function written and tested with seed rule set — [`gapDetector.ts`](../../app/domain/gapDetector.ts), [`gapDetector.test.ts`](../../tests/domain/gapDetector.test.ts); see [Phase 5](#nav-phase-5)
- [x] Timeline builder handles mixed `Evidence[]` and `Message[]` inputs — [`timeline.ts`](../../app/domain/timeline.ts)
- [x] `Evidence.category` for gap rules — [`types.ts`](../../app/domain/types.ts); **set category (immutable case update):** [`evidenceOps.ts`](../../app/domain/evidenceOps.ts) (`setEvidenceCategory`); **wired in UI:** [`web/main.ts`](../../web/main.ts); React evidence detail (Phase 8): [Phase 8](#nav-phase-8)

</details>

<details>
<summary><strong>OCR tiering</strong></summary>

<a id="nav-checklist-ocr"></a>

- [x] `OcrService` port defined in `app/ports/` — [`OcrService.ts`](../../app/ports/OcrService.ts)
- [x] Tier selector logic is a pure function with full test coverage — [`selectTier.ts`](../../app/ocr/tiered/selectTier.ts), [`ocr.test.ts`](../../tests/ocr/ocr.test.ts)
- [x] Tesseract implementation produces `requiresUserReview: true` — [`tesseract/index.ts`](../../app/ocr/tesseract/index.ts)
- [x] Manual caption path produces a valid `OcrResult` with same shape — [`manual/index.ts`](../../app/ocr/manual/index.ts)
- [x] Vision implementation noted as deferred; port contract test written (`selectTier` prefers `vision` when listed) — [Phase 3](#nav-phase-3)
- [x] All results carry provenance: `tier`, `extractedAt`, `engineVersion` — upload path: [`uploadPipeline.ts`](../../app/application/uploadPipeline.ts)

</details>

<details>
<summary><strong>Text message import</strong></summary>

<a id="nav-checklist-messages"></a>

- [x] Real iMazing CSV fixture checked into `tests/fixtures/messages/` (personal content redacted)
- [x] iMazing CSV parser written and tested (unit; pure function) — [`imazingCsv.ts`](../../app/messages/parsers/imazingCsv.ts)
- [x] SMS XML parser written and tested (unit; pure function) — [`smsXml.ts`](../../app/messages/parsers/smsXml.ts)
- [x] Deduplication logic defined and tested — [`importMessages.ts`](../../app/messages/importMessages.ts)
- [x] Messages persist via repository port (`saveMessages` / `listMessages`) and merge into timeline in domain — [`CaseRepository`](../../app/ports/CaseRepository.ts), [`IndexedDbCaseRepository`](../../app/storage/IndexedDbCaseRepository.ts); **UI timeline screen:** [Phase 8](#nav-phase-8)
- [ ] Screenshot fallback uses existing OCR pipeline; produces `importSource: 'screenshot-ocr'` (type exists; **end-to-end flow not wired**)

</details>

<details>
<summary><strong>Storage & pipeline (related)</strong></summary>

<a id="nav-checklist-storage"></a>

- [x] IndexedDB adapter + v1→v2 migration test — [Phase 2](#nav-phase-2), [`IndexedDbCaseRepository.ts`](../../app/storage/IndexedDbCaseRepository.ts)
- [x] `prepareImageForOcr` + pipeline calls OCR after preprocess — [Phase 4](#nav-phase-4), [`prepareImageForOcr.ts`](../../app/application/prepareImageForOcr.ts)
- [ ] Optional: basic contrast preprocessing (spec mentions; not implemented)

</details>

<details>
<summary><strong>Export</strong></summary>

<a id="nav-checklist-export"></a>

- [x] `case.lastExportedAt` updated after every successful export — [`exportCase.ts`](../../app/application/exportCase.ts) (`exportCaseMarkdown` + [`markCaseExported`](../../app/domain/exportReminder.ts)); persistence via `CaseRepository.saveCase`
- [x] Full case export includes Gaps section (only when `detectGaps` non-empty) — [`markdownExport.ts`](../../app/domain/markdownExport.ts) (`buildMarkdownExport`), tests in [`markdownExport.test.ts`](../../tests/domain/markdownExport.test.ts)
- [x] Export reminder **pure function** tested — [`exportReminder.ts`](../../app/domain/exportReminder.ts); **banner in web UI:** [`web/main.ts`](../../web/main.ts); **RTL tests:** [Phase 8](#nav-phase-8)
- [x] Lawyer packet variant (`export.lawyerSummary`) differs from full case export — same module; omits evidence list + communication log; still includes Gaps when applicable
- [x] Export actions in UI call `exportCaseMarkdown` and download `.md` — [`web/main.ts`](../../web/main.ts)

</details>

<details>
<summary><strong>Product surface ids (gaps)</strong></summary>

- [x] Gap-related ids registered — [`app/product-surface/ids.ts`](../../app/product-surface/ids.ts) (see [Phase 5](#nav-phase-5))

</details>

<details>
<summary><strong>Legal gates</strong></summary>

<a id="nav-checklist-legal"></a>

- [x] `gate.claimsModuleLegalReview` cleared — conservative framing rule applied (Option B self-cert); see [`docs/decisions/ADR-003-claims-framing.md`](../decisions/ADR-003-claims-framing.md)
- [x] All claims module strings reviewed against conservative framing rule — passed

</details>

<details>
<summary><strong>Platform & decisions</strong></summary>

<a id="nav-checklist-platform"></a>

- [x] `decision.architecture-complexity` recorded — [`docs/decisions/ADR-001-architecture.md`](../decisions/ADR-001-architecture.md)
- [ ] `decision.capacitor-vs-pwa` mirrored as standalone decision file under `docs/decisions/` (currently **resolved in this plan’s frontmatter only**)
- [x] `decision.lawyer-entity-mvp` reflected in domain types — [`types.ts`](../../app/domain/types.ts) (`Lawyer`); **Consultation Prep UI:** [Phase 8](#nav-phase-8)
- [ ] Manual iPhone QA checklist completed and signed off before release — [Phase 8 — Mobile QA gate](#nav-mobile-qa)

</details>

<details open>
<summary><strong>V2 build (Phases 10–15)</strong></summary>

<a id="nav-checklist-v2"></a>

- [ ] `EvidenceCategory` expanded with `repair`, `photo`, `message`, `amendment` — [`types.ts`](../../app/domain/types.ts); [Phase 10](#nav-phase-10)
- [ ] `Case` type extended with v2 optional fields (`parties`, `property`, `tenancy`, `clientGoal`, `status`, `source`, `timeline`, `gaps`, `libraryRefs`) — [`types.ts`](../../app/domain/types.ts); [Phase 10](#nav-phase-10)
- [ ] DB_VERSION bumped 4→5; migration test written; existing records survive — [`IndexedDbCaseRepository.ts`](../../app/storage/IndexedDbCaseRepository.ts); [Phase 10](#nav-phase-10)
- [ ] `listCases()` added to port and implementation using `objectStore('cases').getAll()` — [`CaseRepository.ts`](../../app/ports/CaseRepository.ts), [`IndexedDbCaseRepository.ts`](../../app/storage/IndexedDbCaseRepository.ts); [Phase 11](#nav-phase-11)
- [ ] `classify()` pure function covers all 9 categories with tests per rule — [`autoProcess.ts`](../../app/application/autoProcess.ts); [Phase 12](#nav-phase-12)
- [ ] `extractMeta()` pure function covers date, amount, address, party name patterns with tests — [`autoProcess.ts`](../../app/application/autoProcess.ts); [Phase 12](#nav-phase-12)
- [ ] `assignToCase()` matches by address and party name; creates new case on no match — [`autoProcess.ts`](../../app/application/autoProcess.ts); [Phase 12](#nav-phase-12)
- [ ] `autoProcess()` pipeline calls `buildTimeline`, `detectGaps`, `suggestClaims`, `surfaceLibraryDocs` in order — [`autoProcess.ts`](../../app/application/autoProcess.ts); [Phase 12](#nav-phase-12)
- [ ] `claimSuggester.ts` decision tree covers all 6 claim types; conservative framing verified; pure function tested — [`claimSuggester.ts`](../../app/domain/claimSuggester.ts); [Phase 12](#nav-phase-12)
- [ ] v1 `web/` archived to `web/v1/` before UI replacement — [Phase 13](#nav-phase-13)
- [ ] Hardcoded `CASE_ID = 'mvp-local-case'` removed; all case access dynamic — [`web/main.ts`](../../web/main.ts); [Phase 13](#nav-phase-13)
- [ ] Home / Canvas screen: case list, library row, intake grid (Sync Folder disabled) — [Phase 13](#nav-phase-13)
- [ ] Case Brief screen: all 8 sections rendered; edit paths for Summary and Client Goal — [Phase 13](#nav-phase-13)
- [ ] Consultation Mode overlay: 6 slides, Prev/Next, dot indicators, ESC to close — [Phase 13](#nav-phase-13)
- [ ] Library screen: grouped list, upload entry, assign to case — [Phase 13](#nav-phase-13)
- [ ] Settings screen: jurisdiction, party defaults, export preference, reset/clear cache — [Phase 13](#nav-phase-13)
- [ ] Screenshot OCR path produces `Message` with `importSource: 'screenshot-ocr'` — [Phase 14](#nav-phase-14)
- [ ] `docs/decisions/ADR-002-capacitor-vs-pwa.md` written — [Phase 14](#nav-phase-14)
- [ ] Playwright E2E tests for Home, Case Brief, Consultation Mode, Library, Settings — [Phase 15](#nav-phase-15)
- [ ] All existing unit tests still pass after v2 changes
- [ ] All existing 70 Playwright E2E tests still pass after v2 changes

</details>

**All v1 checklist items** also apply and are not repeated here.

---

<a id="nav-deferred"></a>

## Deferred items (post-MVP, do not add tests)

_<a href="#nav-top">↑ On this page</a> · Prev: [Completion checklist](#nav-completion-checklist)_

<details>
<summary><strong>Post-MVP / out-of-scope list</strong></summary>

- Apple Vision OCR (Tier 1) — requires Capacitor wrapper; port is ready,
  infrastructure module not implemented
- Cloud OCR (Tier 4) — stub the interface, do not implement
- Image-inclusive export (embed original photos in export file)
- PDF export
- GitHub Pages encrypted share link — excluded from near-term scope; see
  `decision.github-pages-sync`
- Android SMS XML import (parser is written in Phase 3.5 but may need
  real-device testing deferred)
- App Store distribution
- Full lawyer search tracker
- Schema editor / user-extensible fields

</details>

---

<details>
<summary><strong>Document notes</strong> (living plan / version)</summary>

*This plan is a living document. Update it as open questions resolve and new
information surfaces. All decisions in `decisions_required_before_build`
must be resolved and recorded before the relevant phase begins.*

*Version: v2 (base) + v2 build extension — Phases 0–9 complete; Phases 10–15 added
2026-03-24 to implement `case_v2_design_spec.md`. Design spec:
`docs/superpowers/specs/2026-03-24-case-v2-design.md`.*

</details>
