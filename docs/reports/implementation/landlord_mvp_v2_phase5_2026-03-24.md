# Landlord MVP v2 — Phase 5 implementation report

**Date:** March 24, 2026  
**Plan:** `docs/plans/landlord_mvp_tdd_v2.plan.md` (Phase 5 — Categorization / gap detection, modified)

## Objective

Complete the next highest-priority plan phase after prior work through Phase 3.5, Phase 2 (storage), and pipeline preprocessing: **Phase 5**, aligning gap detection with the v2 plan’s **positive-evidence-only** rules and adding **product surface ids** for gaps.

Phase 6 remains blocked by `gate.claimsModuleLegalReview`. Phase 4 was already largely satisfied (tiered OCR provenance on upload, `prepareImageForOcr` before OCR, tests for EXIF path and call order).

## Changes

### 1. Evidence categorization (domain)

- Added `EvidenceCategory`: `'lease' | 'payment' | 'rent-notice' | 'fee-notice' | 'other'`.
- Extended `Evidence` with optional `category`. When omitted, the item is treated as uncategorized for gap rules.

**File:** `app/domain/types.ts`

### 2. Gap detector rewrite

Replaced heuristic “always check for lease/payment/rent-increase” behavior with plan rules:

| Gap id | Trigger (summary) |
|--------|-------------------|
| `gap.missingLease` | Any evidence categorized as `rent-notice` or `fee-notice`, and none as `lease`. |
| `gap.missingPaymentRecord` | Any `fee-notice` and none `payment`. |
| `gap.missingRentIncreaseNotice` | Rent-increase keywords in title/body of some evidence, and no item categorized `rent-notice`. |
| `gap.noConfirmedDates` | At least three evidence items and **more than half** lack a confirmed (finite) `dateTime`. |

**Empty case:** If `evidence.length === 0`, returns `[]` (messages alone do not activate these rules).

Display names match the plan table (e.g. “No lease or rental agreement found”, “Possible rent increase — no formal notice found”).

**File:** `app/domain/gapDetector.ts`

### 3. Product surface registry

- Added `GAP_SURFACE_IDS` and `GapSurfaceId` for gap-related UI/copy/analytics anchors, including `section.caseGaps` and `item.gap` per plan Phase 5 / 8 notes.

**File:** `app/product-surface/ids.ts`

### 4. Tests

- Replaced `tests/domain/gapDetector.test.ts` with cases that match Phase 5 scenarios: positive triggers, negatives, `noConfirmedDates` threshold, non-empty gap fields, purity check, and a smoke assertion that registry constants include expected ids.

## Verification

- Ran `npm test` in this environment: **30 tests passed** across 6 files (including `gapDetector.test.ts`, storage, messages, domain, OCR, application).

## Follow-ups (not in this phase)

- **Phase 7:** Markdown export sections including gaps; `export.lawyerSummary` variant; backup vs lawyer-packet copy ids.
- **Phase 8:** Render `section.caseGaps` / `item.gap` in the case builder UI; wire evidence review to set `category`.
- **IndexedDB:** Optional explicit persistence typing/docs for `category` on evidence rows (serialization already spreads `Evidence` fields).
- **Phase 4:** Optional “basic contrast” preprocessing if spec still requires it beyond EXIF rotation.

## Status

Phase 5 plan items for **gap detection pure function**, **positive-evidence-only rules**, and **gap-related surface ids** are **implemented and covered by tests**. UI surfacing remains Phase 8.
