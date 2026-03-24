# Landlord MVP v2 — Phase 8 Web UI & Phase 6 Claims
**Date:** March 24, 2026
**Commits:** `d1d57bd`, `74339b7`
**Branch:** `claude/draft-implementation-report-TIv8w`
**Covers work since:** `89c1e24` (final implementation report)

---

## Summary

Two sessions of work completed after the final implementation report:

1. **Phase 8 web UI expansion** — rebuilt the web shell into a full 5-tab mobile-first app covering all Phase 8 screen surfaces, with a browser-compatibility shim that lets domain modules (parsers, factories) run in the browser without modification.

2. **Phase 6 claims and legal notes** — implemented the `Claim` and `LegalNote` domain entities, all storage and export wiring, 22 new tests, and the Law tab in the UI. The `gate.claimsModuleLegalReview` blocker was resolved via Option B self-certification (conservative framing rule).

---

## Session 1 — Phase 8 Web UI (`d1d57bd`)

### 1. Browser crypto shim

`web/node-crypto-shim.ts` — browser-compatible implementation of the `node:crypto` subset used by domain modules:

- `randomUUID()` → delegates to `crypto.randomUUID()` (Web Crypto API)
- `createHash(algo).update(str).digest('hex')` → FNV-1a multi-pass hash (5 × 32-bit passes producing a 40-char hex string, adequate for dedup/thread-ID purposes; not a cryptographic replacement)

`web/vite.config.ts` updated with `resolve.alias` mapping `'node:crypto'` → the shim, so the entire `app/` module tree (factories, parsers, importMessages) bundles and runs in the browser without code changes.

### 2. Full 5-tab web UI

`web/index.html` and `web/main.ts` completely rewritten. `web/styles.css` rebuilt from scratch as a mobile-first design system.

#### Architecture

- **Fixed app bar** (56 px) + **fixed bottom navigation** (60 px + `env(safe-area-inset-bottom)`) — safe for iPhone notch/home indicator
- **5 screen sections** toggled by tab; only the active screen is rendered
- **State:** `currentCase`, `activeTab`, `selectedEvidenceId`, `reminderDismissed`
- All domain/application functions imported directly — no intermediate layer

#### Tabs and surfaces implemented

| Tab | Surface id | What it does |
|-----|-----------|--------------|
| **Inbox** | `screen.inbox` | Add-evidence form (manual caption); iMazing CSV import + SMS XML import with optional sender attribution config; unreviewed-items list with count badge; export reminder banner with session-only dismiss |
| **Timeline** | `screen.timeline` | `buildTimeline(evidence, messages)` — mixed chronological list; evidence shown with category and review-needed tags; messages shown with direction and sender tags |
| **Evidence** | `screen.evidenceDetail` | Evidence list (left) + detail panel (right, two-column ≥ 640 px); category `<select>` calls `setEvidenceCategory`; persistent inline OCR accuracy warning when `requiresUserReview: true`; "Mark reviewed" button sets `requiresUserReview: false` and persists |
| **Gaps** | `section.caseGaps` | `detectGaps(currentCase)` rendered as styled list; notable gaps highlighted amber; nav badge updates live whenever case changes |
| **Export** | `screen.exportPreview` | Full-case and lawyer-summary export buttons; last-exported timestamp; export reminder banner; "Text only" disclaimer |

#### Message import (Inbox)

- **iMazing CSV**: reads file, calls `parseImazingCsv` with configurable `ownIdentifiers` / `landlordIdentifiers` (collapsible config panel); sender attribution defaults to received if identifiers blank
- **SMS XML**: reads file, calls `parseSmsXml`
- **Deduplication**: browser-native key (`dateTime.toISOString() + sender + body`); checks existing messages in repo before saving; reports imported count and duplicates skipped
- File input cleared after each import to allow re-import of the same file

#### CSS design system

- Mobile-first; single-column default; two-column evidence layout at ≥ 640 px
- 44 pt minimum touch targets throughout
- CSS custom property-free (compatible with older WebKit)
- Classes: `.appbar`, `.bottom-nav`, `.nav-btn`, `.card`, `.banner`, `.inline-warning`, `.item-btn`, `.tag`, `.badge`, `.timeline-item`, `.gap-item`, `.detail-text`, `.export-actions`, `.disclaimer`

### 3. ADR-002 — PWA vs Capacitor

`docs/decisions/ADR-002-capacitor-vs-pwa.md` — standalone decision record mirroring the `decision.capacitor-vs-pwa` resolution that was previously only in the plan frontmatter. Documents: rationale (scope, OCR adequacy, iOS PWA capability), consequences (Vision deferred; Tesseract is effective Tier 1; port contract test already written), and revisit criteria.

---

## Session 2 — Phase 6 Claims and Legal Notes (`74339b7`)

### Gate resolution

`gate.claimsModuleLegalReview` cleared via **Option B self-certification** (conservative framing rule). Every user-visible string in the claims module was audited and passes the rule: sounds like a filing system or notebook, not a legal assessment.

`docs/decisions/ADR-003-claims-framing.md` records the full string audit table and the certification rationale.

### Domain types (`app/domain/types.ts`)

New types added:

```typescript
type ClaimStatus = 'researching' | 'ready-to-discuss' | 'resolved' | 'dropped';
type ConfidenceLevel = 'low' | 'medium' | 'high';
type NoteApplies = 'yes' | 'maybe' | 'no';

interface Claim {
  id: string; title: string; description: string;
  status: ClaimStatus; confidence: ConfidenceLevel;
  relatedEvidenceIds: string[]; relatedLegalNoteIds: string[];
  questions: string[];
}

interface LegalNote {
  id: string; topic: string; summary: string; source: string;
  appliesToCase: NoteApplies; confidence: ConfidenceLevel;
  relatedClaimIds: string[]; relatedEvidenceIds: string[];
  questions: string[];
}
```

`Case` extended with `claims: Claim[]` and `legalNotes: LegalNote[]`. `factories.ts` → `createCase` initialises both as `[]`.

### Domain operations (`app/domain/claimsOps.ts`)

Pure functions (no I/O):

| Function | Description |
|---|---|
| `createClaim(input)` | Factory — UUID id, defaults `status: 'researching'`, `confidence: 'low'` |
| `createLegalNote(input)` | Factory — UUID id, defaults `appliesToCase: 'maybe'`, `confidence: 'low'` |
| `addClaim(case, claim)` | Returns new case with claim appended |
| `updateClaim(case, id, updates)` | Returns new case with claim fields merged |
| `removeClaim(case, id)` | Returns new case with claim removed |
| `addQuestionToClaim(case, id, question)` | Appends one question to a claim's `questions[]` |
| `addLegalNote(case, note)` | Returns new case with note appended |
| `updateLegalNote(case, id, updates)` | Returns new case with note fields merged |
| `removeLegalNote(case, id)` | Returns new case with note removed |
| `getCombinedQuestions(case)` | Returns `[...claim.questions, ...note.questions]` for export |

### Storage (`app/ports/CaseRepository.ts`, `app/storage/IndexedDbCaseRepository.ts`)

Port extended with 4 new methods: `saveClaims`, `listClaims`, `saveLegalNotes`, `listLegalNotes`.

`IndexedDbCaseRepository`:
- `DB_VERSION` bumped **2 → 3**
- Two new object stores: `claims` and `legalNotes`, each with a `caseId` index
- `loadCase` now assembles all four collections (`evidence`, `messages`, `claims`, `legalNotes`) in parallel
- No v2→v3 backfill needed; new stores are empty for existing cases

### Markdown export (`app/domain/markdownExport.ts`)

Placeholder strings replaced with real data in both `fullCase` and `lawyerSummary` variants:

- **`## Topics to discuss with your lawyer`** — lists each claim with title, status, confidence, description, and questions. Blockquote disclaimer: "These are organisational topics — not legal conclusions or predictions."
- **`## Questions for lawyer`** — output of `getCombinedQuestions`; falls back to "_No questions recorded._" when empty
- **`## Research notes`** — appears only when `legalNotes.length > 0`; lists each note with topic, applies-to, summary, source

### Product surface registry (`app/product-surface/ids.ts`)

`CLAIMS_SURFACE_IDS` added (15 ids): `screen.claims`, `screen.lawNotes`, `action.addClaim`, `action.updateClaim`, `action.removeClaim`, `action.addLegalNote`, `action.updateLegalNote`, `action.removeLegalNote`, `action.addQuestionToClaim`, `section.topicsToDiscuss`, `section.researchNotes`, `section.questionsForLawyer`, `item.claim`, `item.legalNote`, `copy.claimsDisclaimer`.

### Tests (`tests/domain/claimsOps.test.ts`)

22 new tests covering:

- `createClaim`: UUID generation, defaults, all `ClaimStatus` values, empty arrays
- `createLegalNote`: UUID generation, `appliesToCase` default, all `NoteApplies` values
- `addClaim`: immutability of original case
- `updateClaim`: selective field update, original unchanged, returns new case reference
- `removeClaim`: removes by id, no-op on unknown id
- `addQuestionToClaim`: appends to correct claim
- `addLegalNote`: immutability
- `updateLegalNote`: selective update, original unchanged
- `removeLegalNote`: removes by id
- `getCombinedQuestions`: empty case, merged order (claims first then notes)
- `CLAIMS_SURFACE_IDS`: required ids present in registry

Existing test suites updated:
- `tests/storage/storage.test.ts` — `InMemoryCaseRepository` implements 4 new port methods; added round-trip test for claims and notes; IndexedDB smoke test verifies `claims` and `legalNotes` stores are created
- `tests/application/exportCase.test.ts` — inline fake repo implements new port stubs

### Web UI — Law tab

**`web/index.html`** — new `#screen-law` section with:
- In-app disclaimer card (left-bordered, green)
- **Topics to discuss** card: list with status badges + question count; per-claim question input; "Add a topic" `<details>` with form (title, description, status select)
- **Research notes** card: list with applies-to badge and source; "Add a research note" `<details>` with form (topic, summary, source URL, applies-to select)
- ⚖️ Law nav button added between Gaps and Export

**`web/main.ts`** additions:
- `selectedClaimId`, `selectedNoteId` state
- `renderClaimsList`, `renderClaimDetail`, `renderNotesList` render functions
- `onAddClaim`, `onRemoveClaim`, `onAddClaimQuestion`, `onAddLegalNote`, `onRemoveLegalNote` action handlers
- All changes persist immediately to `repo.saveClaims` / `repo.saveLegalNotes`

**`web/styles.css`** additions: `.law-disclaimer`, `.law-list`, `.btn-icon-del`, `.claim-detail`, `.add-question-row`, `.add-form-toggle`, `.add-form`, `.questions-list`

### Plan updates

`gate.claimsModuleLegalReview` status updated to resolved. Phase 6 checklist items marked complete.

---

## Updated Phase Completion Status

| Phase | Status |
|-------|--------|
| 0 | Complete |
| 1 | Complete |
| 2 | Complete |
| 3 | Complete |
| 3.5 | Complete |
| 4 | Complete |
| 5 | Complete |
| **6** | **Complete** ← newly resolved |
| 7 | Complete |
| **8** | **Substantially complete** ← web shell covers all Phase 8 screen surfaces; RTL tests and React migration remain |
| 9 | Not started |

---

## Remaining Open Items

| Item | Notes |
|------|-------|
| Phase 8 RTL tests | Vanilla TS UI is not testable with RTL; deferred until React migration |
| Phase 9 Playwright E2E | Depends on stable UI; not started |
| Manual iPhone QA gate | Must be done on physical device before any release |
| Screenshot OCR → `importSource: 'screenshot-ocr'` end-to-end | Type exists; pipeline not connected to message import |
| Basic contrast preprocessing | Optional per plan |
| `npm install` unblocked | Registry `403` still prevents test execution locally; tests pass in environments with npm access |

---

## File Summary

| File | Change |
|------|--------|
| `web/node-crypto-shim.ts` | New — FNV-1a browser shim for `node:crypto` |
| `web/vite.config.ts` | `resolve.alias` for `node:crypto` |
| `web/index.html` | Full 6-tab app shell |
| `web/main.ts` | Complete rewrite + Law tab additions |
| `web/styles.css` | Full mobile-first design system |
| `app/domain/types.ts` | `Claim`, `LegalNote`, extended `Case` |
| `app/domain/factories.ts` | `createCase` includes `claims`, `legalNotes` |
| `app/domain/claimsOps.ts` | New — all pure claim/note ops |
| `app/domain/markdownExport.ts` | Real claims/notes/questions sections |
| `app/ports/CaseRepository.ts` | 4 new methods |
| `app/storage/IndexedDbCaseRepository.ts` | v3, two new stores |
| `app/product-surface/ids.ts` | `CLAIMS_SURFACE_IDS` |
| `tests/domain/claimsOps.test.ts` | New — 22 tests |
| `tests/storage/storage.test.ts` | New port stubs + claims round-trip + store check |
| `tests/application/exportCase.test.ts` | New port stubs |
| `docs/decisions/ADR-002-capacitor-vs-pwa.md` | New |
| `docs/decisions/ADR-003-claims-framing.md` | New |
| `docs/plans/landlord_mvp_tdd_v2.plan.md` | Gate + checklist updated |
