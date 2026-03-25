# ADR-002: Capacitor vs PWA

**Status:** Resolved — PWA only for MVP

## Decision

Ship as a pure PWA. Capacitor wrapper deferred to post-MVP.

## Context

The v2 spec raised the question of whether to wrap the app in Capacitor to
access Apple Vision OCR (Tier 1). Vision OCR would provide higher accuracy
and native-speed processing than Tesseract.js (the current Tier 1 in the
PWA build).

## Consequences

- Apple Vision OCR (Tier 1) is unavailable. Tesseract.js serves as Tier 1
  in practice for the MVP.
- The `OcrService` port and tier-selector logic are written to accommodate
  Vision when Capacitor is added — no rewrite needed post-MVP.
- PWA build is simpler, faster to deploy, and works across platforms without
  an App Store submission.

## Post-MVP path

When Capacitor is pulled into scope:
1. Implement `app/ocr/vision/index.ts` (stub exists as a deferred module)
2. Add Capacitor build pipeline
3. Update `selectTier` — Vision will be auto-selected when available
4. Submit to App Store
