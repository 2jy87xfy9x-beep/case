# Case Organizer — V2 Design Specification

**Status:** Draft
**Date:** 2026-03-24
**Scope:** Landlord-Tenant disputes only

---

## 1. Vision

Case is a smart document processing and case presentation tool for tenants and their lawyers. It ingests raw, unorganized files — photos, PDFs, messages, notices — and produces a structured, lawyer-ready case presentation automatically.

The app does the work. The user reviews, edits if needed, and exports.

There is no AI. The app is rule-based, deterministic, and narrow in scope by design. Because the domain is tightly constrained — landlord-tenant disputes — the rules can be precise, reliable, and fast. The user never has to wonder what the app did or why.

---

## 2. Core Principles

### 2.1 The app does the work
Every classification, date extraction, timeline assembly, gap detection, and legal flag happens automatically on intake. The user opens the app and the case is already built.

### 2.2 No AI
All processing is rule-based:
- Document classification by filename pattern, file extension, and keyword matching
- Date and dollar amount extraction by regex
- Entity detection (addresses, party names) by pattern and proximity rules
- Case assembly by grouping detected entities (address + parties = case)
- Gap detection by checklist rules specific to landlord-tenant case types
- Legal claim suggestion by decision tree (documented conditions → documented claims)

Nothing is inferred. Everything is traceable. If the app flags a claim, the user can see exactly which rule triggered it and which document it came from.

### 2.3 Narrow scope is a feature
The app handles one domain: residential landlord-tenant disputes. It knows what documents to expect, what patterns to look for, and what claims are available in this context. This constraint is what makes rule-based processing reliable enough to replace manual work.

Out of scope: commercial leases, employment, family law, criminal, immigration, anything else. The Library can hold general legal documents from any domain, but case-building only applies to residential tenancy.

### 2.4 Non-destructive editing
Everything the app produces is editable. No auto-generated output is locked. The user can:
- Rename any auto-detected label
- Reassign any document to a different category
- Edit the auto-generated case summary
- Add or remove timeline events
- Override legal claim suggestions
- Mark a detected gap as resolved or not applicable

Edits are stored as overrides layered on top of the auto-processed state. The original source files and the original processing result are always preserved. Reverting to auto is one tap.

### 2.5 Source files are always preserved
The app never modifies, moves, or renames source files. All organization is a layer on top of the originals. Source files can always be accessed, downloaded, and exported in their original state.

---

## 3. Scope Definition

### In scope — document types the app recognizes
| Category | File types | Detection method |
|---|---|---|
| Lease | PDF, DOCX | Keywords: "lease agreement", "rental agreement", "tenant", "landlord", "monthly rent", signature blocks |
| Rent notices | PDF | Keywords: "rent increase", "notice of rent", "effective date", dollar amount patterns |
| Repair requests | MSG export, PDF, DOCX | Keywords: "repair", "maintenance", "fix", "damage", combined with sender context |
| Photos / damage evidence | JPG, PNG, HEIC | EXIF timestamp extraction; filename date patterns |
| Messages / correspondence | CSV, XML (iMessage export), PDF | Thread structure detection; sender/recipient extraction |
| Legal notices | PDF | Keywords: "notice to pay", "notice to quit", "unlawful detainer", "eviction" |
| Payments / ledger | PDF, CSV | Dollar amount patterns; date columns; "rent paid", "balance" |
| Lease amendments | PDF, DOCX | Keywords: "amendment", "addendum", combined with lease keywords |

### In scope — claim types the app can suggest
- Retaliatory rent increase
- Breach of implied warranty of habitability
- Failure to repair within reasonable time
- Wrongful eviction / unlawful detainer defense
- Illegal rent increase (above local ordinance limit)
- Retaliation for exercising tenant rights

### In scope — gap types the app detects
- No signed lease found
- No rent increase notice found (when increase is evidenced in messages)
- No landlord response to repair request
- No payment history / rent ledger
- Repair request exists but no follow-up documentation
- Notice issued but no proof of delivery

### Out of scope
- Security deposit disputes (future version)
- Roommate disputes
- Anything not residential tenancy

---

## 4. Intake Methods

All intake methods are additive. New files are processed and merged into the existing case state. Nothing is overwritten.

### 4.1 Sync Folder *(new in v2)*
- User connects one cloud folder: Google Drive or Dropbox (iCloud has no public API)
- Connection is set up once in Settings
- On every app open, the app polls the folder for new files since last check
- New files are processed silently in the background
- When the user opens the app, cases are already updated
- Works on both mobile and desktop via cloud API

### 4.2 Drop Folder
- User drags or selects an entire folder of mixed files
- App processes all contents and builds or updates a case
- One-time import; does not maintain sync

### 4.3 Upload Files
- Single or multi-file selection
- Any supported file type
- User assigns to an existing case or lets the app create a new one

### 4.4 Import Messages
- iMessage or SMS export in CSV or XML format
- App parses thread structure, extracts sender/recipient, timestamps, and content
- Assigns to case based on party name matching

### 4.5 Manual Entry
- User enters events, dates, notes, contact names
- Stored as structured records alongside file-based evidence
- Appears in timeline and can be source-tagged as "user entered"

### 4.6 Photo Batch
- Bulk photo import from camera roll or folder
- EXIF timestamps extracted automatically
- Date-sorted on import
- Assigned to case based on date proximity to known case events

---

## 5. Auto-Processing Pipeline

When files are ingested — by any method — the app runs this pipeline. The user sees the result, not the process.

```
INTAKE
  └─ Receive files (any method)
        │
        ▼
CLASSIFY
  └─ Detect file type → apply keyword rules → assign document category
  └─ Extract: dates, dollar amounts, addresses, party names
  └─ Flag unrecognized documents for user review
        │
        ▼
ASSEMBLE CASE
  └─ Group documents by: shared address / shared party names / date proximity
  └─ If no existing case matches → create new case (auto-named from address or parties)
  └─ If existing case matches → merge into existing case
        │
        ▼
BUILD TIMELINE
  └─ Sort all dated events chronologically
  └─ Link each event to its source document
  └─ Calculate durations between key events (e.g. repair request → rent increase)
        │
        ▼
DETECT GAPS
  └─ Run checklist against case type rules
  └─ Flag missing required documents
  └─ Flag unanswered communications
        │
        ▼
SUGGEST CLAIMS
  └─ Run decision tree against assembled facts
  └─ Each triggered claim cites: the rule, the facts that triggered it, the source documents
        │
        ▼
SURFACE LIBRARY DOCS
  └─ Match library documents by jurisdiction and claim type
  └─ Flag relevant library docs to attach to this case
        │
        ▼
READY
  └─ Case brief available
  └─ Consultation mode available
  └─ Export available
```

Processing time target: under 10 seconds for a typical case folder (< 50 files).

---

## 6. Data Model

### Case
```
case_id
name                  // auto-generated from address + parties; editable
status                // ready | gaps | processing | draft
created_at
last_updated
source                // sync_folder | drop_folder | upload | manual | mixed

parties {
  tenant              // name, editable
  landlord            // name, editable
}

property {
  address             // extracted or entered
  unit
  jurisdiction        // state + city; drives which ordinances apply
}

tenancy {
  start_date
  monthly_rent_original
  monthly_rent_current
  lease_term
}

client_goal           // free text, entered once at intake or case setup

documents[]           // see Document
timeline[]            // see Event
claims[]              // see Claim
gaps[]                // see Gap
library_refs[]        // library doc IDs surfaced as relevant
```

### Document
```
doc_id
case_id
filename_original
category              // lease | notice | repair | photo | message | payment | amendment | unrecognized
date_extracted        // from EXIF, content, or filename
date_override         // if user corrects
auto_label            // e.g. "Rent Increase Notice — Feb 2024"
user_label            // overrides auto_label if set
key_excerpts[]        // {text, highlight: true/false} — what gets shown in consultation mode
source_intake         // how it arrived
assigned_by           // auto | user
```

### Event
```
event_id
case_id
date
description           // auto-generated or user-entered
source_doc_id         // null if user-entered
event_type            // lease_signed | repair_request | notice | rent_change | message | photo | user_entry
is_key                // boolean — key events render prominently in timeline
duration_from_prev    // calculated; shown in consultation mode when significant
```

### Claim
```
claim_id
case_id
claim_type            // e.g. retaliatory_rent_increase
statute               // e.g. "CA Civil Code §1942.5"
description           // plain language, shown in consultation mode
triggered_by []       // list of {rule_id, event_ids, doc_ids} — fully traceable
confidence            // strong | possible | weak — based on completeness of supporting facts
user_confirmed        // null | true | false — user can accept or dismiss
```

### Gap
```
gap_id
case_id
gap_type
description
suggested_question    // exact wording shown to lawyer in consultation mode
resolved              // boolean
resolved_by_doc_id    // if a later upload fills the gap
```

---

## 7. Screen Inventory

### 7.1 Home / Canvas
- List of active cases with status badges (ready / gaps / processing)
- Library entry point
- Intake toggle (expands to show all 6 intake methods)
- Sync status indicator (last polled timestamp + connection status)
- No clutter. One case = one row.

### 7.2 Case Brief
The organizational view. Used by the tenant to review and edit.

Sections (in order):
1. **Case Summary** — auto-generated paragraph; editable
2. **Legal Framing** — jurisdiction, claim suggestions with statute citations, confidence level
3. **Client Goal** — entered once; editable
4. **Timeline** — chronological events, each source-linked; expandable
5. **Key Facts** — extracted claims in plain language; each traceable to source
6. **Gaps** — flagged as actionable items; each with a suggested question
7. **Library Docs Surfaced** — relevant library docs with one-tap assign
8. **Source Files** — collapsed by default; expandable; all files accessible

Bottom bar: evidence count · gap count · **▶ Consult** · **Share ⇢** · **Export ↗**

### 7.3 Consultation Mode
A separate full-screen view of the same case data, built for presenting to a lawyer. Auto-generated. Zero manual work.

6 slides:
1. **Orientation** — case type, jurisdiction, client goal, evidence strength, parties
2. **The Dispute** — plain language summary, legal claims identified, library doc surfaced
3. **The Proof** — each key claim paired with its source evidence shown inline and highlighted
4. **Timeline** — all events in order, each with a tappable source badge
5. **Gaps** — each missing item reframed as an exact question to ask the client
6. **Ready** — status checklist, library assignment prompt, export and share actions

Navigation: Prev / Next buttons · dot indicators · arrow keys · ESC to exit

Access: tap ▶ Consult from the Case Brief. Shareable via live link (read-only) or exported as PDF.

### 7.4 Library
Holds documents that don't belong to a specific case yet, or that apply generally (ordinances, templates, tenant rights summaries, research).

The app organizes library items by type automatically:
- Tenant Rights
- Ordinances / Local Law
- Templates
- Correspondence (general)
- Research / Reference
- Unassigned

Any library item can be assigned to a case at any time. When assigned, it appears in the case brief and consultation mode.

Library items are surfaced automatically in the Case Brief and Consultation Mode when they match the case's jurisdiction and claim types.

### 7.5 Settings
- Sync folder connection (Google Drive / Dropbox)
- Jurisdiction default (drives which ordinances the app looks for in the Library)
- Party name defaults (tenant name pre-populated on new cases)
- Export format preferences (PDF, ZIP, or both)
- Reset / clear cache

---

## 8. Consultation Mode — Design Detail

### Principle
Every assertion is backed by a source. Every source is visible without navigating away. The lawyer never has to ask "where does that come from?" because the answer is already on screen.

### Evidence in context
On the Proof slide, each claim is displayed as a unit:
```
[Claim statement]
[Document preview — relevant excerpt highlighted in yellow]
[Duration note if applicable — e.g. "87 days between repair request and rent increase"]
```

Message excerpts show:
```
[Sender → Recipient · timestamp]
[Message content with key phrase highlighted]
[Silence note if no reply found — "No landlord response for X days"]
```

Photo evidence shows:
```
[Thumbnail grid]
[EXIF dates displayed]
[Duration note — "Damage documented across X days"]
```

### Lawyer access
Two paths:
1. **Live access** — share a read-only link. Lawyer sees the consultation mode view in their browser. No account required. Link expires after 30 days or when manually revoked.
2. **Export package** — PDF brief (all 6 slides rendered) + source files organized in labeled folders + timeline summary. Downloaded as a ZIP.

---

## 9. Export

### Export Package contents
```
/export_123_main_st_apt4b/
  case_brief.pdf          // all 6 consultation slides rendered
  timeline_summary.pdf    // timeline only, one page
  /source_files/
    /lease/
    /notices/
    /photos/
    /messages/
    /amendments/
    /library/             // only assigned library docs
  index.txt               // plain text file listing all items with dates and categories
```

### Export triggers
- Manual: tap Export ↗ from Case Brief or Consultation Mode slide 6
- Scheduled: auto-export to sync folder on a cadence (optional, set in Settings)

---

## 10. Editing — Override Rules

Every auto-generated value has an edit path. Edits never delete the original auto-processed result.

| Field | Auto source | Edit method |
|---|---|---|
| Case name | Address + parties extracted | Tap to rename |
| Document category | Keyword rules | Tap document → reassign category |
| Document date | EXIF / content extraction | Tap date → override |
| Case summary | Template + extracted facts | Tap → free text edit |
| Timeline event | Source document date + type | Tap → edit description or date |
| Claim suggestion | Decision tree result | Accept / dismiss / edit statute citation |
| Gap status | Checklist rule | Mark resolved / not applicable |
| Client goal | User entered | Tap → edit |
| Party names | Entity extraction | Tap → edit |
| Key excerpt highlight | Auto-selected by rule | Tap excerpt → edit highlighted text |

Reverting to auto: any edited field shows a "↺ revert" option that restores the auto-processed value.

---

## 11. What This App Does Not Do

These are explicit out-of-scope boundaries, not future features. They keep the app fast, reliable, and trustworthy.

- **No legal advice.** The app identifies potential claims and cites statutes. It does not tell the user what to do, whether to file, or whether they will win.
- **No AI / LLM.** All processing is deterministic rules. No inference, no generation, no probabilistic output.
- **No cloud storage of source files.** Files are processed locally. The sync folder integration reads from the user's cloud storage — it does not copy files to a separate server.
- **No case types other than residential tenancy.** The Library can hold anything. Case-building is landlord-tenant only.
- **No drafting.** The app does not write demand letters, pleadings, or legal documents. It organizes and presents.
- **No communication.** The app does not send emails, messages, or notifications on the user's behalf.
- **No court filing.** Export produces a package. Filing is the user's responsibility.

---

## 12. Success Criteria

A lawyer should be able to open this app having never seen the case before, advance through Consultation Mode once, and have a complete picture of:
- What happened and when
- What the evidence is and where it came from
- What claims may apply and under what law
- What is missing and what to ask the client
- What the client wants as an outcome

Time to orient: under 3 minutes.

A tenant should be able to drop a folder of mixed files and have a ready case — organized, timed, and gap-checked — without naming, sorting, or labeling anything.

Time from drop to ready: under 10 seconds.
