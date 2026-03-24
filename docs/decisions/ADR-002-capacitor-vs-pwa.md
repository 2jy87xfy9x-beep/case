# ADR-002 — PWA vs Capacitor wrapper

**Status:** Resolved
**Date:** March 24, 2026
**Applies to:** Landlord Case Organizer MVP v2
**Plan reference:** `docs/plans/landlord_mvp_tdd_v2.plan.md` — `decision.capacitor-vs-pwa`

---

## Context

The v2 design spec (§ Platform) identifies iPhone 16 / Safari as the primary target. It also calls out
Apple Vision Framework OCR as a higher-quality Tier 1 OCR option. Vision is only accessible from a
native context — either Capacitor or a React Native bridge.

This decision needed to be resolved before Phase 3 (tiered OCR) could be implemented, because it
determines which OCR tier is actually Tier 1 at runtime.

## Decision

**Ship as a PWA (Progressive Web App). Capacitor is deferred to post-MVP.**

## Rationale

- **Scope.** Adding a Capacitor wrapper requires a native iOS build pipeline (Xcode, provisioning
  profiles, Apple Developer account). That is a meaningful scope increase for an MVP.
- **OCR fallback is adequate.** Tesseract.js (Tier 2 in the plan) runs in the browser and produces
  usable results for printed documents. Manual caption (Tier 3 in the plan) is a first-class input
  path, not a degraded fallback. The OCR port is already designed to accept Vision as Tier 1, so
  adding Capacitor later requires only a new infrastructure module — no port changes.
- **iOS PWA support is sufficient for MVP use.** Safari on iOS 16+ supports service workers,
  IndexedDB, and file downloads. The app's core flow (upload, review, export) works without
  native capabilities.
- **No App Store distribution in MVP.** Not targeting App Store removes one of the primary
  motivations for Capacitor at this stage.

## Consequences

| Affected area | Impact |
|---|---|
| OCR Tier 1 (Vision) | Not implemented. Tesseract.js is effective Tier 1 for MVP. Port contract test is written (`selectTier` prefers `vision` when listed), so the infrastructure can be added post-MVP. |
| `app/ocr/vision/` | Not created. Noted as deferred in plan and codebase. |
| Cloud OCR (Tier 4) | Separately deferred — see `decision.cloud-ocr-provider` in the plan. |
| Phase 8 UI target | Mobile-first PWA layout, tested on Safari / iPhone 16. Desktop is an enhancement. |

## Revisit criteria

Consider revisiting this decision if:
- Apple tightens PWA capabilities on iOS (limiting IndexedDB, file access, or background sync).
- Post-MVP roadmap includes App Store distribution.
- User feedback indicates OCR quality is insufficient and Vision would materially improve it.
