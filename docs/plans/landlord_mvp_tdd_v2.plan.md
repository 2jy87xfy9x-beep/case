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
    status: "unresolved — must be cleared before Phase 6"

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

## What changed from v1 and why

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

---

## Principles (unchanged from v1)

Red–green–refactor for every behavior. No production code without a prior
failing test. Behavior-focused tests on real modules. Mock only slow or
non-deterministic boundaries. Add a contract/smoke path for real OCR so
shipped behavior is not only mocks.

---

## Architecture decision (record here before build)

Resolve `decision.architecture-complexity` before writing any code. The
recommendation is to keep ports/adapters with this rationale written into
`docs/decisions/ADR-001-architecture.md`:

> The ports/adapters pattern is retained not for enterprise scalability but
> for testability. The OCR and storage boundaries are genuinely slow and
> non-deterministic; injectable fakes are the cleanest way to test around
> them. The pattern adds one interface file per boundary — that is the full
> cost. The spec v2 critique is acknowledged and this decision is recorded
> explicitly so it is not silently revisited.

---

## Phase 0 — Test harness (unchanged from v1)

No changes. Proceed as specified in v1 plan.

---

## Phase 1 — Domain model and timeline ← MODIFIED

All v1 content applies. The following additions are required.

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

---

## Phase 2 — IndexedDB storage adapter (unchanged from v1)

No changes to structure or test strategy. Extend the schema to include the
`messages` object store and the new `lastExportedAt` field on cases when
Phase 1 additions are complete. Write a migration test from the v1 schema
(without `messages` store) to the v2 schema (with it).

---

## Phase 3 — OCR wrapper ← REWRITTEN

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

---

## Phase 3.5 — Text message import ← NEW PHASE

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

---

## Phase 4 — Upload → evidence pipeline ← MODIFIED

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

---

## Phase 5 — Categorization / gap detection ← MODIFIED

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

---

## Phase 6 — Claims and legal notes (unchanged from v1)

**Gate: `gate.claimsModuleLegalReview` must be cleared before this phase
begins.** See `decisions_required_before_build` for how to clear it. Do not
write claims module UI copy until this gate is resolved.

No structural changes. Confirm that claim and legal note domain tests link
to v2 spec section headings (not v1), since section anchors may have changed.

---

## Phase 7 — Export ← MODIFIED

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

---

## Phase 8 — React UI ← MODIFIED

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

### Export reminder banner

The `banner.exportReminder` renders when `needsExportReminder` returns `true`.

**RTL tests:**
- Banner is visible when `lastExportedAt` is null
- Banner is visible when `lastExportedAt` is more than 7 days ago
- Banner is not visible when `lastExportedAt` is within 7 days
- "Export now" button triggers export and dismisses the banner
- "Dismiss" button dismisses the banner for the current session (does not
  update `lastExportedAt`)

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

### Mobile QA gate (manual, not automated)

Before any release, perform manual QA on a real iPhone (not simulator):

- [ ] Upload a camera photo and confirm OCR or manual caption flow works
- [ ] Import a real iMazing CSV export and confirm messages appear in timeline
- [ ] Export a case and confirm file appears in Files app
- [ ] Bottom nav is reachable with one thumb; no interactive elements above safe area
- [ ] Touch targets meet 44×44pt minimum
- [ ] App is usable offline (upload, review, notes, timeline all function)
- [ ] Export reminder banner appears after simulating 7-day gap

This gate must be green before tagging any release candidate.

---

## Phase 9 — Playwright E2E (unchanged from v1)

No structural changes. Expand the happy path to include one message import
step: create case → upload fixture → import fixture CSV → evidence and
messages visible in timeline.

---

## Completion checklist (additions to v1)

**Domain additions**
- [ ] `Message` entity defined with all fields from v2 data model
- [ ] `Case.lastExportedAt` field present and tested
- [ ] `Gap` type defined
- [ ] `needsExportReminder` pure function written and tested
- [ ] `detectGaps` pure function written and tested with seed rule set
- [ ] Timeline builder handles mixed `Evidence[]` and `Message[]` inputs

**OCR tiering**
- [ ] `OcrService` port defined in `app/ports/`
- [ ] Tier selector logic is a pure function with full test coverage
- [ ] Tesseract implementation produces `requiresUserReview: true`
- [ ] Manual caption path produces a valid `OcrResult` with same shape
- [ ] Vision implementation noted as deferred; port contract test written
- [ ] All results carry provenance: `tier`, `extractedAt`, `engineVersion`

**Text message import**
- [ ] Real iMazing CSV fixture checked into `tests/fixtures/messages/` (personal
  content redacted)
- [ ] iMazing CSV parser written and tested (unit; pure function)
- [ ] SMS XML parser written and tested (unit; pure function)
- [ ] Deduplication logic defined and tested
- [ ] Messages persist via port and appear in timeline
- [ ] Screenshot fallback uses existing OCR pipeline; produces `importSource: 'screenshot-ocr'`

**Export**
- [ ] `case.lastExportedAt` updated after every successful export
- [ ] Full case export includes Gaps section
- [ ] Export reminder banner logic tested (unit + RTL)
- [ ] Lawyer packet variant (`export.lawyerSummary`) differs from full case export

**Legal gates**
- [ ] `gate.claimsModuleLegalReview` cleared and resolution recorded
- [ ] All claims module strings reviewed against conservative framing rule

**Platform**
- [ ] decision.capacitor-vs-pwa recorded in `docs/decisions/`
- [ ] decision.architecture-complexity recorded in `docs/decisions/`
- [ ] decision.lawyer-entity-mvp recorded and reflected in Phase 1 + Phase 8
- [ ] Manual iPhone QA checklist completed and signed off before release

**All v1 checklist items** also apply and are not repeated here.

---

## Deferred items (post-MVP, do not add tests)

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

---

*This plan is a living document. Update it as open questions resolve and new
information surfaces. All decisions in `decisions_required_before_build`
must be resolved and recorded before the relevant phase begins.*

*Version: v2 — drafted as surgical update to landlord_mvp_tdd_c6ad0408.plan.md,
aligned with design spec v2.*
