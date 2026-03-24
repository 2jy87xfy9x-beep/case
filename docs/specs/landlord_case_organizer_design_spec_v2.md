# Landlord Case Organizer — Design Spec v2
*A local-first, mobile-friendly, ADHD-friendly workspace for building a landlord dispute case before speaking to a lawyer.*

> ⚠️ **This is not a legal advice tool.** It is a private case organization workspace. Nothing this app produces constitutes legal advice or predicts case outcomes.

---

## 📌 Navigation

- [Purpose](#purpose)
- [Who This Is For](#who-this-is-for)
- [What Changed From v1](#what-changed-from-v1)
- [Design Principles](#design-principles)
- [Core Problems This Solves](#core-problems-this-solves)
- [User Flow](#user-flow)
- [Core Modules](#core-modules)
- [Document Processing Pipeline](#document-processing-pipeline)
- [Text Message Import](#text-message-import)
- [OCR Strategy](#ocr-strategy)
- [Mobile Strategy](#mobile-strategy)
- [Data Model](#data-model)
- [Legal Knowledge Organizer](#legal-knowledge-organizer)
- [Case Builder](#case-builder)
- [Export System](#export-system)
- [UI Layout](#ui-layout)
- [ADHD Support Features](#adhd-support-features)
- [Storage and Privacy](#storage-and-privacy)
- [Technical Stack](#technical-stack)
- [MVP Scope](#mvp-scope)
- [Post-MVP Directions](#post-mvp-directions)
- [Legal and Compliance Gates](#legal-and-compliance-gates)
- [Open Questions](#open-questions)

---

## Purpose

This app helps a tenant **organize a potential legal case against a landlord** before contacting a lawyer.

It helps you:

- bring scattered documents into one place
- extract or describe the content of photos and screenshots
- import text message threads cleanly and accurately
- build a chronological timeline automatically
- track rent changes, fees, notices, and communications
- take and link legal research notes
- identify possible issues to discuss with counsel — not legal conclusions
- export a readable packet a lawyer can use quickly

It does **not** give legal advice, predict outcomes, or file anything.

---

## Who This Is For

<details>
<summary>Click to expand</summary>

This app is designed for one primary user:

- Has ADHD
- Is on iPhone (currently iPhone 16)
- Has no legal knowledge
- Is overwhelmed by scattered documents
- Is unsure what matters, what to collect, what lawyers need
- Wants to prepare before a consultation
- May upload messy phone photos
- May forget context between sessions
- May jump between topics nonlinearly
- Will discover new issues as they go

The app must support that actual working style — not an idealized linear process.

</details>

---

## What Changed From v1

<details>
<summary>Click to expand</summary>

This spec supersedes the original MVP design spec. Key changes based on design critique and platform constraints:

**OCR strategy replaced**
Tesseract.js running in the browser is too slow, inaccurate, and memory-hungry for real phone photos on mobile. It is replaced with a tiered strategy: try Apple on-device Vision first (accurate, private, fast on iPhone 16), fall back to Tesseract for non-iOS, offer manual captioning as a first-class path, and make cloud OCR an explicit opt-in.

**Text message import added as a first-class feature**
Screenshots of texts are unreliable. Structured export import (CSV or XML from iMazing or SMS Backup & Restore) produces perfectly timestamped, sender-attributed records that slot directly into the timeline. This is higher priority than OCR for this evidence type.

**Mobile-first design required**
The original spec assumed a desktop-shaped layout. The primary user is on iPhone. The entire UI must be designed mobile-first, with desktop as a secondary consideration.

**"Let the user choose" replaced with sensible defaults**
Rather than presenting OCR backend options to an overwhelmed user, the app picks the best available automatically and degrades gracefully. Cloud OCR is opt-in only, clearly labeled.

**Architecture simplified**
The TDD plan proposed a ports-and-adapters architecture appropriate for a team-built product. For a personal tool this is over-engineered. The spec calls for the simplest architecture that works and can grow.

**Data durability addressed honestly**
"Local first" using IndexedDB alone is a fragile promise — browser storage gets cleared, data doesn't follow you across devices. The spec now includes explicit export-to-file as an early and frequent behavior, not an afterthought.

</details>

---

## Design Principles

<details>
<summary>Click to expand</summary>

### 1. Mobile First
Designed for iPhone. Touch targets, thumb reach, and one-handed use are primary concerns. Desktop is secondary.

### 2. Sensible Defaults, Not Option Menus
The app picks the best available behavior automatically. Options appear only when the user has a concrete reason to change them.

### 3. Local and Private by Default
No account required. No cloud required. Data stays on device unless the user explicitly exports or shares it.

### 4. ADHD Friendly
Low clutter. One primary task visible at a time. Quick capture with no required fields. Progress visible. Jumping around is fine.

### 5. Evidence First, Conclusions Later
The app helps you organize what you have. It surfaces possible topics for your lawyer conversation — it does not tell you whether you have a case.

### 6. Honest About Limitations
OCR output is flagged as unverified. Claims surfaced are labeled as organizational suggestions, not legal findings. Exports include clear disclaimers.

### 7. Export Early and Often
Because local storage can be lost, the app encourages regular export to a file. Export is a first-class action, not a final step.

</details>

---

## Core Problems This Solves

<details>
<summary>Click to expand</summary>

| # | Problem |
|---|---------|
| 1 | Documents are scattered across camera roll, email, and paper |
| 2 | Text message evidence is hard to organize and present |
| 3 | You forget which events happened when |
| 4 | You don't know what matters legally |
| 5 | Research is overwhelming and disconnected from your actual documents |
| 6 | You don't know what a lawyer needs |
| 7 | The timeline of events is unclear |
| 8 | You don't know what you're missing |

</details>

---

## User Flow

<details>
<summary>Click to expand</summary>

This is the intended flow, but the user may enter at any point or jump around. That is fine.

1. Create a case (address, landlord name — nothing else required)
2. Upload documents or photos
3. App attempts text extraction; user confirms or corrects
4. Import text message thread (structured export or screenshot)
5. App builds timeline from dated items
6. User adds descriptions and tags to evidence
7. User adds legal research notes as they learn
8. User links notes and evidence to possible claims
9. User prepares questions for lawyer
10. User exports lawyer packet

</details>

---

## Core Modules

<details>
<summary>Click to expand</summary>

### 1. Document Inbox
Accepts anything. No required fields.

- iPhone camera roll photos
- Screenshots (notices, emails, bank statements)
- PDFs
- Text message exports (structured or screenshot)
- Lease files

### 2. Text Message Importer
First-class feature. See [Text Message Import](#text-message-import).

### 3. Evidence Organizer
Each uploaded item becomes an evidence record. The user can:

- confirm or correct extracted text
- add a manual description
- tag by type (lease, notice, payment, communication, other)
- link to a date
- add free-form notes

### 4. Timeline Builder
Automatic chronological view of all dated evidence. Items without dates appear in an "undated" pile for the user to sort.

### 5. Legal Research Notes
Freeform notes linked to:

- a topic (e.g. late fee limits, notice requirements)
- a law or source
- a confidence level
- specific evidence items
- possible claims

### 6. Claim Tracker
Possible issues to discuss with a lawyer. Each claim record holds:

- a plain-language title
- a description in your own words
- linked evidence
- linked legal notes
- your confidence level
- status (researching / ready to discuss / resolved)

Presented as organizational groupings, not legal conclusions.

### 7. Lawyer Consultation Prep
- Questions list for the lawyer meeting
- Summary of claims to discuss
- Linked evidence list per claim

### 8. Export Engine
See [Export System](#export-system).

</details>

---

## Document Processing Pipeline

<details>
<summary>Click to expand</summary>

### Step 1 — Upload
User selects from camera roll or files. Multiple items at once supported.

### Step 2 — Basic Image Cleanup (client-side)
Before OCR attempt:
- Auto-rotate based on EXIF
- Basic contrast adjustment
- No cropping required from user

### Step 3 — Text Extraction (tiered)
See [OCR Strategy](#ocr-strategy). The app tries in priority order and shows the result for user review.

### Step 4 — User Review
**Always show the original image alongside any extracted text.** The user confirms, corrects, or replaces the text. This is not optional — unreviewed OCR output is never treated as authoritative.

### Step 5 — Smart Detection (lightweight)
After text is confirmed, simple pattern matching looks for:

- Dollar amounts (rent, fees)
- Dates
- Keywords (increase, late fee, notice, termination)

Matched items are highlighted as suggestions, not automatic entries.

### Step 6 — Categorization Suggestion
The app suggests a category based on detected content. The user confirms or changes it. Categories are:

- Lease / Agreement
- Rent Notice
- Fee / Penalty
- Payment Record
- Communication
- Legal Document
- Other

### Step 7 — Timeline Insertion
If a date is confirmed, the item is placed in the timeline automatically.

</details>

---

## Text Message Import

<details>
<summary>Click to expand</summary>

Text messages between you and your landlord are frequently the most important evidence in landlord disputes. They are timestamped, attributed, and difficult to dispute. This module treats them as a first-class evidence type.

### Why Not Just Screenshots?

Screenshots of text threads are usable but unreliable:

- OCR on message bubbles often misreads sender attribution
- Long threads require many screenshots
- Timestamps are easy to miss or cut off
- The result needs significant cleanup

### Recommended Path: Structured Export Import

**On iPhone**, the app [iMazing](https://imazing.com) can export any iMessage or SMS thread as a structured file (CSV or PDF) with full timestamps and sender names. This is a one-time action per thread.

**On Android**, [SMS Backup & Restore](https://www.synctech.com.au/sms-backup-restore/) exports to XML with full metadata.

The app imports these structured files and converts each message to a timestamped evidence entry automatically, with sender and direction (sent/received) preserved.

### What Import Produces

Each message becomes:

```
Message Entry
 ├── id
 ├── date + time
 ├── sender (you / landlord name)
 ├── direction (sent / received)
 ├── body text
 ├── thread tag
 └── notes (optional)
```

Messages are placed in the timeline alongside other evidence automatically.

### Supported Import Formats

| Format | Source | Notes |
|--------|--------|-------|
| CSV (iMazing) | iPhone iMessage / SMS | Preferred for iPhone users |
| XML (SMS Backup & Restore) | Android SMS | Full metadata |
| Screenshot + OCR | Any | Fallback; requires user review |

### Screenshot Fallback

If the user cannot or does not want to use structured export, screenshot upload works. OCR on message screenshots is more reliable than on document photos because the text is clean and high-contrast. The user still reviews the result and corrects sender attribution manually.

### Privacy Note

Message content never leaves the device unless the user explicitly exports the case file.

</details>

---

## OCR Strategy

<details>
<summary>Click to expand</summary>

The original spec used Tesseract.js as the sole OCR engine. This is replaced with a tiered strategy that picks the best available option automatically.

### The Problem With Tesseract on Mobile

Tesseract.js running in a browser on a phone is:

- Slow (30–60 seconds per image on older hardware)
- Memory-hungry (can crash browser tabs on constrained devices)
- Inaccurate on real phone photos (shadows, angles, paper texture)
- Silent about its own failures (confidently produces wrong text)

For an iPhone 16, there is a significantly better option available.

### Tier 1 — Apple on-Device Vision (iOS, preferred)

Apple's Vision framework runs on-device on iPhone and is:

- Fast (seconds, not minutes)
- Accurate on real photos
- Private (never leaves device)
- Free

Access from a web app requires a native wrapper (e.g. a simple Swift/WKWebView shell or a Capacitor/Cordova plugin). This is the recommended architecture if the app ships as a native-wrapped PWA rather than a pure browser app.

If the app is a pure browser app without a native wrapper, Vision is not available and the app falls back to Tier 2.

### Tier 2 — Tesseract.js (browser fallback)

Used when Vision is not available. Shown with a clear warning: "Text extraction may be less accurate. Please review carefully."

User always sees the image alongside the result. Inaccurate output can be manually corrected.

### Tier 3 — Manual Caption (always available)

The user types a description or pastes text themselves. This is presented as equally valid to OCR, not as a failure state. For some documents (especially short notices), typing is faster and more accurate than any OCR.

Quick-entry prompts:
- "What does this document say?" (free text)
- "What is the date on this document?" (date picker)
- "What type of document is this?" (category picker)

### Tier 4 — Cloud OCR (explicit opt-in only)

Google Cloud Vision or AWS Textract are dramatically more accurate on difficult photos. Available as an explicit opt-in, clearly labeled as "sends image to Google/AWS for processing." Never on by default. Never presented as the default "good" option.

### Design Rule

The user never sees a backend picker. The app chooses automatically and tells the user which method was used and how confident to be in the result.

</details>

---

## Mobile Strategy

<details>
<summary>Click to expand</summary>

### Primary Platform

iPhone 16 running iOS. Safari is the primary browser. If the app ships as a PWA wrapper (e.g. Capacitor), it has access to native APIs including Vision.

### Layout

Mobile-first. Single column. Bottom navigation (thumb-reachable). No sidebars on small screens.

Desktop uses a two or three column layout with the same underlying components.

### Touch

- All tap targets minimum 44×44pt (Apple HIG standard)
- Swipe gestures for common actions (e.g. swipe evidence item to tag or archive)
- No hover-dependent interactions

### Upload

- Native share sheet integration: user can share a photo directly from Photos app into the case organizer
- Camera capture available inline (no need to go to camera roll first)
- Multi-select from camera roll supported

### Performance

- OCR runs after upload completes, not blocking the upload UI
- Progress indicator for OCR with ability to skip and come back
- App remains usable while OCR processes in background

### Offline

Core features (viewing, editing, tagging, notes) work fully offline. OCR (Tesseract fallback) works offline. Cloud OCR requires connection and shows clear status.

### Data Durability on iOS

IndexedDB on Safari is functional but has known edge cases. Mitigation:

- Prompt user to export a backup file after each significant session
- Auto-export reminder if the user has not exported in 7+ days
- Export to Files app (iCloud Drive, local storage, AirDrop) directly from the app
- Never promise data persistence without also showing the export prompt

</details>

---

## Data Model

<details>
<summary>Click to expand</summary>

### Case

```
Case
 ├── id (stable UUID)
 ├── name (e.g. "123 Main St dispute")
 ├── property address
 ├── landlord name
 ├── lease type (month-to-month / fixed)
 ├── lease start date
 ├── created at
 ├── updated at
 ├── evidence[]
 ├── messages[]
 ├── claims[]
 ├── legal notes[]
 └── lawyer contacts[]
```

### Evidence

```
Evidence
 ├── id (stable UUID)
 ├── type (photo / pdf / screenshot / other)
 ├── category (lease / rent notice / fee / payment / communication / legal / other)
 ├── date (user confirmed)
 ├── title (user label)
 ├── extracted text (OCR output, flagged unverified until confirmed)
 ├── confirmed text (user-confirmed version)
 ├── manual caption (free text alternative)
 ├── ocr method used (vision / tesseract / manual / cloud)
 ├── tags[]
 ├── notes
 ├── source file reference
 ├── hash (optional integrity check)
 └── created at
```

### Message Entry

```
Message
 ├── id (stable UUID)
 ├── thread id (groups messages by conversation)
 ├── date + time (from structured export or OCR)
 ├── sender (you / landlord / other)
 ├── direction (sent / received)
 ├── body
 ├── import source (iMazing CSV / SMS XML / screenshot OCR / manual)
 ├── tags[]
 └── notes
```

### Claim

```
Claim
 ├── id (stable UUID)
 ├── title (plain language)
 ├── description (your words)
 ├── status (researching / ready to discuss / resolved / dropped)
 ├── confidence (low / medium / high — your estimate)
 ├── related evidence ids[]
 ├── related legal note ids[]
 └── questions for lawyer[]
```

### Legal Note

```
Legal Note
 ├── id (stable UUID)
 ├── topic
 ├── summary (your words)
 ├── source (URL or citation)
 ├── applies to case (yes / maybe / no)
 ├── confidence (how well you understand it)
 ├── related claim ids[]
 ├── related evidence ids[]
 └── questions[]
```

### Lawyer Contact

```
Lawyer
 ├── id
 ├── name
 ├── firm
 ├── phone / email
 ├── contacted (boolean)
 ├── response
 ├── consultation type (free / paid / legal aid / contingency)
 ├── notes
 └── status
```

</details>

---

## Legal Knowledge Organizer

<details>
<summary>Click to expand</summary>

This module stores what you learn about the law as you research — not conclusions the app draws, but notes you take.

### Workflow

1. You read something (statute, article, tenant rights guide)
2. You add a legal note in your own words
3. You link it to a claim you are tracking
4. You link it to specific evidence
5. You mark how confident you are in your understanding
6. Questions you have go into the questions list for the lawyer

### Topics This Typically Covers

- Rent increase notice requirements (timing, form, amount limits)
- Late fee legality (caps, grace periods)
- Bounced check fee limits
- Payment method restrictions
- Habitability and repair obligations
- Entry notice requirements
- Retaliation protections
- Security deposit rules

### Important Design Note

The app does not generate legal notes automatically. It does not tell you what the law says. It stores what **you** have learned, so you can organize it and bring it to the consultation.

</details>

---

## Case Builder

<details>
<summary>Click to expand</summary>

The Case Builder assembles your raw evidence and notes into a structured summary you can review before the lawyer meeting.

### Sections

**Property and Lease Summary**
Address, landlord name, lease type, tenancy start date.

**Rent History**
Chronological list of rent amounts and changes, sourced from evidence.

**Fee History**
Late fees, penalties, bounced check charges — each linked to source evidence.

**Communication Log**
All messages and notices in chronological order.

**Evidence List**
Every uploaded document with category and date.

**Possible Issues**
Claims you have tracked, with linked evidence and legal notes. Labeled: "Topics to discuss with your lawyer" — not "your legal claims."

**Questions for Lawyer**
Combined list from all claims and legal notes, plus anything you added manually.

**Gaps**
Items flagged as likely missing based on what you have (e.g. if you have a rent increase notice but no original lease, the app notes that).

</details>

---

## Export System

<details>
<summary>Click to expand</summary>

Export is a first-class feature. It serves two purposes: sharing with a lawyer, and backing up your data.

### Export Types

| Type | Contents | Use |
|------|----------|-----|
| Full Case File | Everything | Lawyer packet / backup |
| Lawyer Summary | Claims, questions, key evidence | Short consultation prep |
| Timeline Only | Chronological event list | Quick reference |
| Evidence List | All documents with descriptions | Document index |
| Message Thread | One conversation exported cleanly | Specific evidence |
| Legal Questions | All questions compiled | Lawyer meeting cheat sheet |

### Output Formats

| Format | Use |
|--------|-----|
| Markdown (.md) | Readable on any device, pasteable anywhere |
| PDF | Printable, shareable |
| HTML | Browser-readable, self-contained |

### All Exports Include

- Disclaimer: "This document was prepared for organizational purposes only and does not constitute legal advice."
- OCR caveat where applicable: "Some text was extracted automatically and may contain errors. Original images are the authoritative source."
- Date and time of export
- App version

### Sharing

- Save to Files app (iCloud Drive, local storage)
- AirDrop to Mac or iPad
- Share sheet (email, Messages, etc.)
- Optional: GitHub Pages share link (explicit opt-in, not default)

### Backup Prompt

After every export, the app confirms the file saved and reminds the user where it is. A banner appears if no export has been made in 7 days.

</details>

---

## UI Layout

<details>
<summary>Click to expand</summary>

### Mobile Layout (primary)

```
┌─────────────────────────┐
│ Case name    [Export ↑] │  ← top bar
├─────────────────────────┤
│                         │
│     Main workspace      │
│                         │
│                         │
│                         │
├─────────────────────────┤
│  [+]  Quick add button  │  ← floating action
├─────────────────────────┤
│ 📥  📅  🗂  ⚖️  📤   │  ← bottom nav (thumb zone)
│ Inbox Time Evid Law Exp │
└─────────────────────────┘
```

Bottom nav tabs:
- **Inbox** — new uploads and unreviewed items
- **Timeline** — chronological view of all evidence
- **Evidence** — organized evidence and messages
- **Law** — legal notes and claims
- **Export** — export and backup

### Desktop Layout (secondary)

```
┌──────────┬─────────────────────┬───────────┐
│ Sidebar  │   Main workspace    │  Details  │
│          │                     │           │
│ Inbox    │                     │ Item notes│
│ Timeline │                     │ Links     │
│ Evidence │                     │ Tags      │
│ Law      │                     │           │
│ Export   │                     │           │
└──────────┴─────────────────────┴───────────┘
```

### Quick Add

Floating button always visible. Tapping it shows:

- 📷 Add photo or document
- 💬 Import text messages
- 📝 Add note
- ⚖️ Add legal note
- ❓ Add question for lawyer

No form required. Any of these can be completed minimally and filled in later.

### Focus Mode

One section visible at a time. Other sections collapsed. Reduces visual noise for ADHD users. Togglable.

### Progress Tracker

Visible summary of:
- Documents uploaded
- Documents reviewed
- Claims tracked
- Last exported

Not a checklist to complete. A status indicator.

</details>

---

## ADHD Support Features

<details>
<summary>Click to expand</summary>

### Quick Capture
Every add action requires zero required fields. Upload a photo with no description — it goes to Inbox for later. Add a note with no links — it sits in the notes list. Nothing gets blocked.

### Inbox View
Unreviewed items live in Inbox. This is the "deal with it later" pile. The user is never forced to categorize on upload.

### Nudges (Not Nags)
The app surfaces one suggestion at a time. "You have 3 items in Inbox — want to review one?" Not a list of everything you haven't done.

### No Long Forms
Every input is one field at a time, with skip options. Nothing requires filling out a complete form before saving.

### Visible Progress
The case summary shows what exists. Gaps are shown gently, not as errors.

### Undo
All destructive actions (delete, archive) are undoable within the session.

### Autosave
Nothing is ever lost because the user forgot to save. Every change persists immediately.

</details>

---

## Storage and Privacy

<details>
<summary>Click to expand</summary>

### Local First

All data is stored locally on the device in IndexedDB. No account required. No cloud required for core use.

### What Stays On Device

- All case data
- All evidence (images, text, messages)
- All notes and claims
- All exports until the user shares them

### Known Limitation: IndexedDB on iOS Safari

Safari can clear IndexedDB under storage pressure. This is rare but real. Mitigation:

- Export to Files app after significant sessions
- App prompts after 7 days without export
- Export is fast and low-friction

### Privacy of Text Messages

Message content processed via structured import never leaves the device. If cloud OCR is enabled for screenshots, the image is sent to the selected provider. This is always clearly disclosed before the first upload.

### Optional GitHub Pages Sync

An optional path (disabled by default) allows the user to push an encrypted export to GitHub Pages and share a read-only link with a lawyer. This is:

- Explicitly opted in
- Labeled clearly as "sends data outside your device"
- Encrypted before upload
- Not the default sharing method

### Data the App Does Not Collect

- Analytics
- Crash reports (unless user opts in)
- Usage data
- Any content from your case

</details>

---

## Technical Stack

<details>
<summary>Click to expand</summary>

### Frontend

React (with hooks). Mobile-first responsive layout. PWA manifest for Add to Home Screen on iPhone.

### OCR

| Tier | Technology | When Used |
|------|-----------|-----------|
| 1 | Apple Vision (via Capacitor plugin) | iOS, if native wrapper |
| 2 | Tesseract.js | Browser fallback |
| 3 | Manual entry | Always available |
| 4 | Google Cloud Vision or AWS Textract | Explicit opt-in only |

### Storage

IndexedDB for structured data. File references for original images (stored as blobs). Prompt regular export to Files app.

### Text Message Import

- CSV parser (iMazing format)
- XML parser (SMS Backup & Restore format)
- Screenshot + OCR fallback

### Export

- Markdown: string assembly, no library required
- PDF: client-side PDF generation (pdf-lib or similar)
- HTML: template + data injection

### Deployment Options

- Static site (GitHub Pages, Netlify, Vercel)
- PWA wrapper (Capacitor) for App Store distribution
- Local file: open index.html directly in Safari (limited OCR)

### Testing

- Unit tests for domain logic and export functions (Vitest)
- Component tests for key UI flows (React Testing Library)
- Manual QA on real iPhone for upload, OCR, and export flows before any release

</details>

---

## MVP Scope

<details>
<summary>Click to expand</summary>

### MVP Includes

- Create case (minimal fields)
- Upload photos and documents
- OCR with user review (Tesseract fallback; Vision if native wrapper)
- Manual caption as first-class alternative to OCR
- Structured text message import (iMazing CSV)
- Evidence tagging and categorization
- Timeline view (auto-built from dates)
- Legal notes
- Claim tracker
- Questions list
- Markdown export
- Export to Files app (iOS)
- Export backup prompt (7-day reminder)

### MVP Excludes

- Cloud OCR (post-MVP opt-in)
- PDF export (post-MVP)
- GitHub Pages sync (post-MVP)
- Lawyer search tracker (post-MVP)
- App Store distribution (post-MVP)
- Multi-device sync
- Accounts
- AI-generated legal summaries (never)

### Build Priority Order

1. Upload + manual caption → evidence entry
2. Text message import (iMazing CSV)
3. Timeline view
4. Evidence review and tagging
5. Tesseract OCR with review UI
6. Legal notes
7. Claim tracker
8. Markdown export
9. Export-to-Files and backup prompt
10. ADHD support features (Focus mode, progress tracker, nudges)

UI prototype before infrastructure. Validate the upload and review flow on a real iPhone before building storage migrations.

</details>

---

## Post-MVP Directions

<details>
<summary>Click to expand</summary>

- PDF export
- Cloud OCR opt-in (Google Vision, AWS Textract)
- Apple Vision native wrapper (Capacitor app)
- GitHub Pages encrypted share link
- Android SMS XML import
- Lawyer search tracker
- Schema editor (user-extensible fields)
- App Store distribution

</details>

---

## Legal and Compliance Gates

<details>
<summary>Click to expand</summary>

These must be resolved before any public release. They are not afterthoughts.

### Unauthorized Practice of Law (UPL)

The claims and issue-tracking features surface possible legal topics. Review by a licensed attorney is required before shipping to confirm that framing, copy, and UX do not constitute legal advice or create UPL exposure. This review should happen before the claims module is built, not after.

### Disclaimers Required In-App

- On first launch: what the app is and is not
- On every export: not legal advice; OCR may contain errors
- On claims module: "These are topics to discuss with a lawyer, not conclusions about your case"
- On cloud OCR: "This image will be sent to [provider] for processing"

### Data and Privacy

- No personal data collected by the app
- If cloud OCR is added: privacy policy required, lawful basis for processing, subprocessor disclosure
- DPIA (Data Protection Impact Assessment) warranted if cloud features are added given sensitivity of content

### OCR Accuracy Disclosure

Users must understand that extracted text is not guaranteed accurate and that original images are the authoritative record. This is stated in the UI and in every export.

</details>

---

## Open Questions

<details>
<summary>Click to expand</summary>

These are unresolved decisions to make before or during build.

| # | Question | Impact |
|---|----------|--------|
| 1 | PWA only or Capacitor native wrapper? | Determines whether Apple Vision is available |
| 2 | Which cloud OCR provider to offer as opt-in? | Privacy policy implications |
| 3 | Is iMazing CSV format stable enough to rely on? | Text message import reliability |
| 4 | Should export include original images or text only? | File size and portability |
| 5 | How should the gap detector work? What counts as "likely missing"? | Scope of smart suggestions |
| 6 | Legal review of claims module copy: who, when? | Must happen before claims feature is built |
| 7 | GitHub Pages sync: worth the complexity for MVP? | Currently excluded; confirm |

</details>

---

*This spec is a living document. Update it as decisions are made and new information surfaces.*

*Version 2 — drafted following critique of v1 and discussion of mobile constraints, OCR strategy, and text message evidence.*
