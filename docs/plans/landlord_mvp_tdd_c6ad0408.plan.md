---
name: Landlord MVP TDD
overview: A test-first roadmap for the Landlord Case Organizer MVP ([design spec](../specs/landlord_case_organizer_mvp_design_spec.md)), incorporating legal/product risk, NFRs, and delivery realism from [plan review follow-ups](../discussions/landlord_mvp_tdd_plan_review_followups.md). Stack — React, Vitest, RTL, IndexedDB, Tesseract.js, Markdown export.
todos:
  - id: phase-0-vitest
    content: "Phase 0: Add Vitest + RTL + jsdom; first smoke test proves runner."
    status: pending
  - id: phase-1-domain
    content: "Phase 1: TDD narrow domain API — case/evidence/claim/note factories, timeline, tagging."
    status: pending
  - id: phase-2-idb
    content: "Phase 2: TDD versioned IndexedDB + migrations + corrupt/upgrade tests; shim vs browser CI strategy."
    status: pending
  - id: phase-3-ocr
    content: "Phase 3: TDD Tesseract wrapper (mocked unit); provenance fields; errors/timeouts."
    status: pending
  - id: phase-4-pipeline
    content: "Phase 4: TDD upload→OCR→evidence; file limits/types/sanitization; preserve originals + optional hash."
    status: pending
  - id: phase-5-categorize
    content: "Phase 5: TDD rule-based categorization; copy framed as organization aid (UPL-safe UX)."
    status: pending
  - id: phase-6-claims-notes
    content: "Phase 6: TDD claims + legal notes in slices — domain API, then persistence, each with narrow surface."
    status: pending
  - id: phase-7-export
    content: "Phase 7: TDD Markdown export + disclaimers/warnings in output; not certified reproduction."
    status: pending
  - id: phase-8-ui
    content: "Phase 8: TDD UI in priority order; WCAG + keyboard for focus/progress; map RTL tests to spec sections."
    status: pending
  - id: ocr-bridge
    content: "Contract/smoke path — minimal real recognizer or real-image test between all-mock and Playwright."
    status: pending
  - id: phase-9-e2e
    content: "Phase 9: Playwright happy path only after stable definition (green suite + bridge path)."
    status: pending
  - id: legal-product-gates
    content: "Shippable gates — internal legal memo, disclaimers, retention/deletion honesty, DPIA if warranted."
    status: pending
  - id: spec-traceability
    content: "Traceability — map acceptance tests to spec headings/anchors; document cut lines for MVP."
    status: pending
isProject: false
---

# TDD plan: Landlord Case Organizer MVP

## Source material

- [MVP design spec](../specs/landlord_case_organizer_mvp_design_spec.md)
- [Legal and engineering follow-ups / checklist](../discussions/landlord_mvp_tdd_plan_review_followups.md) — expanded themes below are merged from this doc

## Principles (non-negotiable)

Follow red–green–refactor for every behavior: **write one failing test → run and confirm the failure is for the right reason → minimal production code → run all tests → refactor while green**. No production code without a prior failing test (project TDD / red–green–refactor discipline).

Prefer **behavior-focused tests** on real modules (pure domain, storage adapter, export builder). Mock **only** boundaries that are slow or non-deterministic (e.g. Tesseract in unit tests). Add a **contract or smoke** path that exercises real OCR (or a real fixture image) so shipped behavior is not only mocks — see [Testing strategy and definition of done](#testing-strategy-and-definition-of-done).

## Cross-cutting themes (from review)

The roadmap optimizes for **test discipline** and **clean layering** but must also explicitly cover:

1. **Legal / product risk** — what the product must not imply; how exports and OCR affect user decisions in disputes.
2. **Non-functional requirements** — security, storage evolution, browser constraints, accessibility.
3. **Release realism** — a path from heavily mocked OCR to behavior users actually get in the browser.

Address these with **owners and explicit decisions** in spec and plan, not single-line placeholders (e.g. replace “reject or migrate” with a **chosen** behavior and tests).

## Legal, privacy, and product risk (shippable gates)

Internal **product legal memo** (even if non-binding) before calling the MVP shippable: disclaimers, positioning, retention, subprocessors.

**Unauthorized practice of law and user reliance**

- UX and positioning: conspicuous **“not legal advice”**; do not imply outputs are filing-ready or substitute for a lawyer.
- Features that feel like legal analysis (claim builder, categories such as “Rent Increase,” structured legal notes) are framed as **organization aids**, not conclusions.
- Engineering guardrails: default **export footer** / in-app notices before export (test copy presence in Markdown export fixtures).

**Privilege, confidentiality, and data lifecycle**

- Document **local-first** implications: shared devices, backups, future sync, Markdown **export** (discoverability, accidental sharing).
- **Retention and deletion** expectations for MVP; user-facing honesty about what on-device delete can and cannot do.
- Distinguish **raw documents** vs **derived text** vs **user notes** in policy and, where helpful, in domain types and export sections.

**OCR accuracy and evidentiary use**

- User-facing **warnings** about OCR error rates; **always preserve originals** alongside extracted text.
- **Audit metadata** on extracted text: when extracted, which engine/version (lightweight provenance) — cover with domain/export tests.
- Do not imply extracted text is a **certified** court reproduction (copy in UI and export).

**Jurisdiction and local law**

- Landlord–tenant law is **hyper-local**: MVP is **jurisdiction-agnostic** with clear limits, or carries **jurisdiction metadata** and scoped copy — decide and test any user-visible strings / empty states accordingly.
- Timelines and “claims” language must not read as universal legal truth.

**Privacy regulation (DPIA-style)**

- Treat evidence and notes as **personal data**; consider GDPR/CCPA-style **lawful basis**, minimization, subprocessors (including future cloud or analytics).
- Trigger a **DPIA** (or equivalent) when processing sensitive categories at scale.
- Plan **breach** and **user rights** (access/delete) at MVP honesty level.

## Specification traceability and phase scope

- **Map tests to spec sections** (headings or stable anchors) so “done” is not only “tests were red first.”
- **Decompose** Phases 1, 6, and 8: each phase delivers a **narrow public API** (exported functions/hooks/components) documented in one place; avoid bundling unrelated subsystems in a single test file without boundaries.
- **Prioritize Phase 8 screens** (suggested order below); document **cut lines** for MVP vs later.
- **ADHD / focus features**: specify **WCAG** targets and **keyboard** flows, not only pure selectors/reducers — test focus order and announcements where applicable.

## MVP scope from spec (in test terms)


| MVP capability      | Primary test home                                          |
| ------------------- | ---------------------------------------------------------- |
| Upload documents    | File handling + persistence of blob metadata               |
| OCR text extraction | OCR service wrapper (mocked in unit; bridge + optional E2E) |
| Tagging             | Evidence tags + optional rule-based category suggestion    |
| Timeline builder    | Pure function: evidence → sorted timeline events           |
| Legal notes         | CRUD + links to claims/evidence (domain + storage)         |
| Claim builder       | CRUD + relations to evidence/research                      |
| Export markdown     | Deterministic Markdown from fixture `Case` graphs + legal copy |


Defer (not in MVP list): PDF/HTML export, share link, GitHub sync, schema UI editor, full image cleanup pipeline — add tests only when pulled into scope.

## Suggested repo layout (tests co-located or `__tests__`)

Align with the spec’s [File Structure](../specs/landlord_case_organizer_mvp_design_spec.md) and keep **domain + export + storage testable without the UI**:

- `app/domain/` — types, validation, timeline derivation, categorization helpers
- `app/storage/` — IndexedDB implementation behind a small interface
- `app/ocr/` — Tesseract wrapper
- `app/export/` — Markdown generators per export shape
- `app/components/`, `app/modules/` — React UI

Use **Vitest** + **@testing-library/react**; **fake-indexeddb** (or equivalent) for IndexedDB in Node. Document **fake-indexeddb vs real browser** gaps; if CI shims fail, add **Playwright storage smoke** as fallback.

## Implementation order (dependency-first)

Each phase is a sequence of **small tests** (one behavior per test name). Complete the full cycle per test before starting the next.

```mermaid
flowchart LR
  domain[Domain_and_timeline]
  storage[IndexedDB_adapter]
  ocr[OCR_wrapper]
  pipeline[Upload_to_evidence_slice]
  claims[Claims_and_legal_notes]
  export_md[Markdown_export]
  ui[React_UI]
  domain --> storage
  domain --> export_md
  storage --> pipeline
  ocr --> pipeline
  pipeline --> claims
  claims --> ui
  export_md --> ui
```



### Phase 0 — Test harness

- Add Vitest + RTL + jsdom; path aliases if needed.
- **First failing test**: e.g. `describe('domain smoke', () => { it('exports createEmptyCase', () => { ... }) })` so the runner is proven before domain work.

### Phase 1 — Domain model and timeline (pure, fast)

**Narrow public API**: exported factories/reducers/selectors for **Case**, **Evidence**, **Claim**, **Legal note**, **Lawyer** (optional MVP), with types matching the spec.

Cover structures from the spec: **Evidence** (`id`, `type`, `date`, `tags`, extracted text, notes, source reference); **Claim** (title, description, related evidence, related law, strength, status); **Legal note** (topic, summary, source, applies-to-case, questions, confidence).

Example tests:

- Creating a case and adding evidence updates state as specified.
- **Timeline builder**: given evidence with dates (and without), output a **chronological** list with stable tie-break (e.g. by id).
- **Tagging**: add/remove tags; validate allowed shapes (non-empty id, etc.).
- **Provenance** (if modeled here): extracted-text records include optional `extractedAt`, `engineId` / version — assert serialization shape.

### Phase 2 — IndexedDB storage adapter

- **Version** the IndexedDB schema; **migration tests** from version N to N+1; explicit behavior when **upgrade fails** (user messaging + test expectation).
- Define a narrow interface (`loadCase`, `saveCase`, `addEvidence`, …) and test against **fake IndexedDB**.
- **RED / GREEN**: persist then load; deep equality on domain graph.
- **Corrupt payload**: pick one behavior (**reject with clear error**, **quarantine key**, or **reset with backup**) — document it and TDD that path; do not leave “reject or migrate” undecided.
- **CI**: document shim limitations; add Playwright storage smoke if Node IndexedDB behavior diverges.

### Phase 3 — OCR wrapper

- **RED**: mock `Tesseract.recognize` (or wrapper) → fixed text; assert trimmed output and error propagation.
- **GREEN**: thin module around Tesseract.js per [Technical Stack](../specs/landlord_case_organizer_mvp_design_spec.md).
- **NFR checklist** (tests or manual gate where automated is impractical): WASM/workers, memory, **timeouts**, language packs; **CSP** (`worker-src`, etc.).
- Distinguish **test flakiness** from **production UX**: partial failure, retry, user-visible messaging — specify expected behavior and test what is deterministic (e.g. retry count policy as pure function).

### Phase 4 — Upload → evidence slice (application service)

- **Uploads — security and integrity**: **file size cap**, **allowed MIME/types**, sane handling of **file names** (sanitization, path traversal rejected); confirm **bytes stay on device** if that is the privacy promise.
- **Integrity (optional but stakeholder-driven)**: **content hash** linking evidence to original blob vs derived text — TDD hash computation and storage fields if required.
- **RED**: given a `File` (image), after process, evidence has `extractedText` from mocked OCR, **original preserved**, stable `sourceFile` id/name.
- **GREEN**: orchestration only: read file → OCR → build evidence → storage (inject mock storage in tests).

### Phase 5 — Categorization / smart detection (MVP-simple)

- **RED**: e.g. `"Rent will increase to $885"` → suggested category `Rent Increase` (or enum).
- **GREEN**: keyword/regex table; extend with tests per supported category.
- **Copy framing**: UI and exports present suggestions as **user organization**, not legal classification — align strings with legal review.

### Phase 6 — Claims and legal notes

Split into **slices** with narrow surfaces:

1. Domain: link claim ↔ evidence ids, legal note ↔ claim ids; invariants for missing ids (define error vs silent skip — test the choice).
2. Persistence: round-trip with links.

Tests mirror [Legal Knowledge Organizer](../specs/landlord_case_organizer_mvp_design_spec.md) workflow only as far as MVP requires; link each describe block to a spec heading.

### Phase 7 — Markdown export

- **RED**: fixture case → snapshot or exact string for **Full Case File** and at least one variant (**Timeline Only** or **Evidence Only**) per [Export System](../specs/landlord_case_organizer_mvp_design_spec.md).
- Include **disclaimer / not legal advice** and **OCR limitation** blocks in expected output (strings or snapshots with stable sections).
- **GREEN**: pure functions in `app/export/`; no React.

### Phase 8 — React UI (RTL), mission-control layout

**Suggested build order** (adjust if product dictates):

1. App shell + case switcher / empty state  
2. Evidence + upload entry points  
3. Timeline view  
4. Claims  
5. Law notes  
6. Export trigger + preview  

For each: **RED** with providers/fakes; assert labels, navigation, actions (e.g. upload invokes handler with `File`). **GREEN**: minimal components.

**Accessibility**: WCAG-oriented tests for **focus mode** and **progress tracker** — focus order, visible focus, `aria-*` / live regions where needed, **keyboard** paths without mouse.

### Phase 9 — Optional Playwright

- One E2E: create case → upload fixture → evidence visible — only when **stable** (below).
- OCR may be mocked at build or stubbed; prefer aligning with **ocr-bridge** so E2E matches a known real path.

## Testing strategy and definition of done

- **Bridge**: between “all mocked” and full E2E, add **contract or smoke** using real `Tesseract` (or one checked-in image) so shipped OCR is not only mocks.
- **Stable before Phase 9**: e.g. full suite green **plus** bridge path green (or documented manual gate with ticket).
- **Completion** includes measurable MVP cuts, **a11y** and **security/storage** gates — not only red–green discipline.

## Completion checklist

**TDD discipline**

- Every new function/module has tests **observed failing** first.
- Mocks only at I/O boundaries; assertions describe contracts or user-visible behavior.
- Full suite green; no ignored failures.

**Merged action items** (from follow-ups)

| Area | Gate |
|------|------|
| Legal / product | Disclaimers, export warnings, “not legal advice”; claim/category UX reviewed for UPL optics |
| Data | Retention/deletion documented; local device and export/discovery implications stated |
| OCR | User warnings; originals preserved; provenance on extracted text |
| Privacy | Lawful basis, minimization, subprocessors; DPIA if warranted |
| Spec linkage | Acceptance tests mapped to spec sections |
| IDB | Versioned schema, migrations, corrupt/upgrade tests; CI shim vs browser strategy |
| Uploads | Size/type limits; sanitization; integrity hashing if stakeholders require |
| Browser OCR | CSP, workers, memory/timeouts; production failure UX |
| Testing | Mock-to-real bridge; “stable” defined before E2E |
| UI / NFR | WCAG and keyboard paths for focus/progress features |

## Risk notes

- **OCR and image cleanup**: keep behind interfaces; unit tests use mocks; bridge + optional E2E for realism.
- **IndexedDB in CI**: prefer `fake-indexeddb`; fall back to Playwright for storage if shims diverge from browsers.
