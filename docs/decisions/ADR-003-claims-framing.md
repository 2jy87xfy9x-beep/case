# ADR-003 — Claims module framing (gate.claimsModuleLegalReview)

**Status:** Resolved — conservative framing rule applied (Option B self-certification)
**Date:** March 24, 2026
**Applies to:** Landlord Case Organizer MVP v2 — Phase 6
**Plan reference:** `docs/plans/landlord_mvp_tdd_v2.plan.md` — `gate.claimsModuleLegalReview`

---

## Context

The plan's `gate.claimsModuleLegalReview` blocked Phase 6 (Claims and legal notes) until the
UI copy was reviewed for unauthorised practice of law (UPL) risk. The gate offered two options:

- **Option A:** Informal review from a tenant rights org or legal aid clinic.
- **Option B:** Self-certification against the conservative framing rule.

Option A was not available at the time of implementation. Option B was applied.

## Conservative framing rule audit

Every user-visible string in the claims module was tested against the rule:

> Does it sound like a filing system or a notebook, not a legal assessment?

### Strings reviewed

| Location | String | Pass/Fail |
|---|---|---|
| Screen heading (Law tab) | "Topics to discuss" | ✅ Notebook |
| In-app disclaimer | "These are topics to bring up with your lawyer — not conclusions about your case. Record what *you* want to ask or have researched, not what the app thinks." | ✅ Explicit non-assessment |
| Claim status: researching | "Researching" | ✅ Notebook |
| Claim status: ready-to-discuss | "Ready to discuss" | ✅ Notebook (not "viable") |
| Claim status: resolved | "Resolved" | ✅ Neutral |
| Claim status: dropped | "Dropped" | ✅ Neutral |
| Confidence field label | "Confidence (your estimate)" | ✅ User's own estimate, not app's assessment |
| Export section heading | "Topics to discuss with your lawyer" | ✅ Matches spec copy |
| Export blockquote | "These are organisational topics — not legal conclusions or predictions." | ✅ Explicit |
| Add topic button | "Save topic" | ✅ Notebook action |
| Research notes label | "Notes on what *you* have read or learned. The app does not generate these." | ✅ Explicit |
| Questions section | "Questions to ask" | ✅ Neutral |

### Strings that would have failed (not used)

- "Possible violations" ❌ — implies legal assessment
- "This may constitute a claim" ❌ — implies legal assessment
- "Status: viable" ❌ — implies the app evaluated merit
- "Your legal claims" ❌ — implies conclusions

## Decision

Self-certify Phase 6 as clear of UPL risk under Option B. The module is framed
as a personal filing system. No string implies the app has analysed legal merit.

## Consequences

- Phase 6 (Claims and legal notes) is unblocked.
- If the app is later distributed publicly or commercially, Option A (external review)
  should be obtained before launch. The self-certification is adequate for a personal
  tool used by one person.
- If any new string is added to the claims module, it must pass the conservative framing
  rule before merging.

## Revisit criteria

- Before any public or commercial distribution.
- If a future feature adds language that draws on evidence to suggest legal conclusions
  (e.g. "Based on your evidence, you may have a claim for…").
