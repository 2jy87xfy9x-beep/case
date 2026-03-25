# Implementation Report: Cognitive Load Reduction
**Date:** 2026-03-25
**Commit:** 3084b86
**Scope:** web/main.ts, web/index.html, web/styles.css

---

## Summary

Five features were implemented to reduce cognitive load for the single end-user managing tenant-landlord cases in Warren, Ohio. The app now understands its context (jurisdiction, role, location) and guides the user through issue framing, evidence gathering, and document generation without requiring them to know what they need.

---

## Features Delivered

### 1. Silent First-Launch Setup Defaults
**Key:** `caseOrg.setupDone`

On first launch, the app silently:
- Sets default jurisdiction to `Warren, Ohio (Trumbull County)`
- Seeds the Library with 7 Ohio-specific statute stubs (see feature 3)

This is a one-time operation. Subsequent launches skip it. The user can always override the jurisdiction in Settings or per-case.

**Files changed:** `main.ts` — bootstrap `DOMContentLoaded` block

---

### 2. Topic Archetypes with Structured Intake Forms
**Replaced:** Plain text chips that pre-filled a text input
**With:** 5 structured archetype buttons that expand inline intake forms

**Archetypes implemented:**
| ID | Label |
|----|-------|
| `illegal-late-fees` | Illegal late fees |
| `habitability` | Habitability issues |
| `security-deposit` | Security deposit dispute |
| `rent-increase` | Rent increase validity |
| `wrongful-eviction` | Wrongful eviction |

**Each archetype expands to show:**
- A brief description of the issue type
- A statute citation (Ohio-specific)
- 4 targeted sub-questions (issue details, dates, landlord response, current status)
- A "What to gather" checklist (see feature 3b)
- "Add topic" and "Cancel" buttons

On submit, the answers assemble into a `description` field on the claim record, so the topic card shows meaningful context rather than just a label.

The custom text input ("Or type a custom topic…") remains for edge cases not covered by archetypes.

Existing claims show a remove (×) button. Below them, the same archetype grid is available for adding more topics.

**Files changed:** `main.ts` — `renderBriefClaims()` (rewritten), `showArchetypeIntake()` (new), `addClaim()` (extracted helper)

---

### 3a. Library Pre-Seeded with Ohio Resources
**Trigger:** First launch only (same setup flag as feature 1)

**Seeds added to localStorage Library:**

| Name | Type | Group |
|------|------|-------|
| ORC 5321.02 — Retaliatory conduct prohibited | Statute | Ordinances |
| ORC 5321.04 — Landlord obligations (fit and habitable premises) | Statute | Ordinances |
| ORC 5321.07 — Tenant remedies for landlord noncompliance (30-day notice) | Statute | Tenant Rights |
| ORC 5321.16 — Security deposit rules (30-day return, double damages) | Statute | Ordinances |
| ORC 1923 — Forcible entry and detainer (eviction procedure) | Statute | Ordinances |
| Trumbull County Municipal Court — Housing and Eviction Division | Reference | Research |
| Warren, OH City Code — Minimum Housing Standards | Ordinance | Ordinances |

Seeds are marked `· stub` in the type badge. They are idempotent — re-seeding skips existing IDs.

`inferGroup()` was updated to recognize `orc ` (leading space prevents false matches) and `court|municipal` patterns.

**Files changed:** `main.ts` — `OHIO_LIBRARY_SEEDS` constant, `seedLibraryDefaults()` function, `inferGroup()`

---

### 3b. "What to Gather" Checklists per Topic
Embedded in each archetype intake form. Each archetype defines a `gather` array of evidence types specific to that legal issue.

Examples for **Habitability issues:**
- Photos of the condition (with timestamps)
- Written repair requests (emails, texts, certified letters)
- Landlord responses or documentation of non-response
- Health/code inspector reports if obtained
- Medical records if health was affected
- Lease agreement (habitability and repair clauses)

Displayed as a styled checklist with `☐` markers the user can reference while gathering documents before their consultation.

---

### 4. Five Fillable Document Templates
**Location:** Library screen → "Fillable Templates" section (below the grouped library items)

Each template has a "Fill ↗" button that opens a modal form. Fields are pre-populated where possible from:
- `localStorage` tenant name
- Current case address (if a case is open when Library is accessed)

On submit, the form generates a complete plain-text document and triggers a browser download as `{template-id}-{timestamp}.txt`.

**Templates:**

| ID | Label | Legal basis |
|----|-------|-------------|
| `repair-demand` | Repair Demand Letter | ORC 5321.07 — 30-day notice prerequisite |
| `deposit-demand` | Security Deposit Demand Letter | ORC 5321.16 — 30-day return, double damages |
| `habitability-complaint` | Habitability Complaint to Inspector | Warren Code Enforcement, 391 Mahoning Ave NW |
| `timeline-log` | Case Timeline Log | Court-formatted signed incident record |
| `rent-escrow` | Rent Escrow Notice | ORC 5321.07(B) — court escrow remedy |

All certified-mail templates include the `SENT VIA CERTIFIED MAIL — RETURN RECEIPT REQUESTED` header and instructions to keep a copy with the receipt.

**Files changed:** `main.ts` — `DOCUMENT_TEMPLATES` constant, `renderLibrary()` (extended), `showTemplateModal()` (new)

---

## CSS Added

New classes in `styles.css` (appended):
- `.archetype-grid`, `.archetype-chip` — archetype selection row
- `.archetype-intake`, `.archetype-intake__*` — expanded intake panel
- `.intake-questions`, `.intake-question__*` — sub-question fields
- `.gather-section`, `.gather-list`, `.gather-item`, `.gather-check` — evidence checklist
- `.intake-actions`, `.intake-submit-btn`, `.intake-cancel-btn` — form controls
- `.claim-card__header`, `.claim-card__remove` — updated claim card layout
- `.lib-group--templates`, `.lib-item--template`, `.lib-item__body`, `.lib-item__desc` — template list items
- `.template-fill-btn` — per-template fill button
- `.template-modal-backdrop`, `.template-modal`, `.template-modal__*` — fill modal
- `.template-field__*`, `.template-generate-btn`, `.template-modal__cancel` — modal form

---

## What Was Not Changed

- Case data model (no schema changes — archetype answers stored in `claim.description`)
- Existing Library upload flow (user-uploaded docs continue to work as before)
- Settings screen (jurisdiction field now shows Warren OH placeholder)
- Export / Consult / Share flows (unaffected)

---

## Known Limitations

- Library seeds are stubs only — no actual statute text is embedded; user must upload the documents
- Template downloads are plain `.txt`; no PDF generation
- Archetype answers are not individually queryable (stored as a formatted string in `description`)
- The `SETUP_DONE_KEY` flag means seeds only inject on first launch; clearing all data resets this
