# Landlord Case Organizer – Private MVP Design Spec
*A local-first ADHD-friendly app to organize landlord dispute evidence, learn the law, and export a lawyer-ready case.*

---

# 📌 Navigation
- [Overview](#overview)
- [Design Principles](#design-principles)
- [User Flow](#user-flow)
- [Core Modules](#core-modules)
- [Data Model](#data-model)
- [Document Processing Pipeline](#document-processing-pipeline)
- [Legal Knowledge Organizer](#legal-knowledge-organizer)
- [Case Builder](#case-builder)
- [Lawyer Search Organizer](#lawyer-search-organizer)
- [Export System](#export-system)
- [UI Layout (Mission Control Style)](#ui-layout-mission-control-style)
- [ADHD Support Features](#adhd-support-features)
- [Storage Architecture (Local + GitHub Pages)](#storage-architecture-local--github-pages)
- [MVP Scope](#mvp-scope)
- [Post‑Lawyer Upgrade System](#postlawyer-upgrade-system)
- [Technical Stack](#technical-stack)
- [File Structure](#file-structure)

---

# Overview

This app is a **private case-building workspace** designed to:

- Upload poor-quality document photos
- Extract and organize key information
- Track landlord actions and timeline
- Organize legal research
- Track potential violations
- Prepare lawyer-ready exports
- Share case via **single link**
- Work **locally first**
- Be **simple and ADHD friendly**

---

# Design Principles

<details>
<summary>Click to expand</summary>

### 1. Local First
No accounts, no cloud required

### 2. ADHD Friendly
Low clutter
Clear progress
One-task focus

### 3. Case‑First Architecture
Everything revolves around:

Case → Evidence → Claims → Timeline → Export

### 4. Lawyer Ready Output
Everything structured for:

- chronological timeline
- categorized evidence
- legal questions
- claim summaries

### 5. Incrementally Expandable
UI-driven schema editor
No code required to evolve app

</details>

---

# User Flow

<details>
<summary>Click to expand</summary>

1. Create Case
2. Upload Documents
3. App extracts text
4. App suggests categories
5. User confirms
6. Timeline auto builds
7. Legal issues detected
8. User researches law
9. Case builder assembles
10. Export lawyer packet

</details>

---

# Core Modules

<details>
<summary>Click to expand</summary>

### 1. Document Inbox
Upload anything

- photos
- screenshots
- PDFs
- text messages
- lease files
- notices

### 2. Evidence Organizer
Auto categorization

- Lease
- Rent increase
- Fees
- Late fees
- Communication
- Payment issues

### 3. Timeline Builder
Auto generated chronological log

### 4. Legal Research Notes
Your understanding of law

### 5. Claim Builder
Potential violations

### 6. Lawyer Search Tracker
Contacted / not contacted

### 7. Export Engine
Generate lawyer-ready package

</details>

---

# Data Model

<details>
<summary>Click to expand</summary>

## Case

```
Case
 ├── property
 ├── landlord
 ├── lease history
 ├── claims
 ├── timeline
 ├── evidence
 └── research
```

## Evidence

```
Evidence
 ├── id
 ├── type
 ├── date
 ├── tags
 ├── extracted text
 ├── notes
 └── source file
```

## Claim

```
Claim
 ├── title
 ├── description
 ├── related evidence
 ├── related law
 ├── strength
 └── status
```

</details>

---

# Document Processing Pipeline

<details>
<summary>Click to expand</summary>

### Step 1 — Upload
User drops image

### Step 2 — Image Cleanup
- rotate
- sharpen
- contrast
- crop

### Step 3 — OCR Extraction
Extract text from:

- lease
- notices
- letters
- checks

### Step 4 — Smart Detection
Detect:

- rent amount
- dates
- late fees
- policy changes

### Step 5 — Auto Categorization
Example:

"Rent will increase to $885"

→ category: Rent Increase

### Step 6 — Add to Timeline
Automatically inserted

</details>

---

# Legal Knowledge Organizer

This module helps organize **what you learn about the law**.

<details>
<summary>Click to expand</summary>

## Structure

```
Legal Notes
 ├── Topic
 ├── Law summary
 ├── Source
 ├── Applies to case
 ├── Questions
 └── confidence level
```

## Example Topics

- Month to month rent increases
- Late fee legality
- Bounced check fees
- Payment method restrictions
- Notice requirements

## Learning Workflow

1. Read something
2. Add legal note
3. Link to claim
4. Link to evidence
5. Mark confidence

</details>

---

# Case Builder

<details>
<summary>Click to expand</summary>

This turns raw data into structured case.

## Sections

### Property Info
Address, landlord, lease type

### Rent History
Timeline of rent

### Fee History
Late fees, penalties

### Violations
Potential legal issues

### Communication Log
Texts, notices, emails

### Evidence List
All documents

### Questions For Lawyer
Auto generated

</details>

---

# Lawyer Search Organizer

<details>
<summary>Click to expand</summary>

Track lawyers

```
Lawyer
 ├── name
 ├── firm
 ├── contacted
 ├── response
 ├── notes
 └── status
```

Also track:

- free consultations
- tenant lawyers
- legal aid
- contingency

</details>

---

# Export System

<details>
<summary>Click to expand</summary>

## Export Types

### Full Case File
Complete package

### Lawyer Summary
Short version

### Evidence Only
Documents only

### Timeline Only
Chronological log

### Legal Questions
Questions list

## Output Formats

- PDF
- Markdown
- HTML
- Share link

</details>

---

# UI Layout (Mission Control Style)

<details>
<summary>Click to expand</summary>

Left Sidebar

- Case
- Evidence
- Timeline
- Claims
- Law Notes
- Lawyers
- Export

Main Panel

Context workspace

Right Panel

Details / notes

Top Bar

Case status

Bottom Bar

Quick add

</details>

---

# ADHD Support Features

<details>
<summary>Click to expand</summary>

### Focus Mode
One section at time

### Progress Tracker

- documents added
- claims built
- timeline complete

### Smart Suggestions

"You may want to add this as evidence"

### Quick Add Buttons

+ Add rent notice
+ Add lease
+ Add text

### Visual Timeline

Simple chronological view

</details>

---

# Storage Architecture (Local + GitHub Pages)

<details>
<summary>Click to expand</summary>

Local Storage

```
/case
/evidence
/exports
/research
```

Optional GitHub Sync

- push case
- share link
- lawyer read only

</details>

---

# MVP Scope

<details>
<summary>Click to expand</summary>

MVP Includes

- Upload documents
- OCR text extraction
- Tagging
- Timeline builder
- Legal notes
- Claim builder
- Export markdown

MVP Excludes

- AI legal advice
- cloud accounts
- multi user

</details>

---

# Postlawyer Upgrade System

<details>
<summary>Click to expand</summary>

Editable schema UI

User can:

- add new claim types
- add new evidence fields
- add new sections

All from UI

</details>

---

# Technical Stack

<details>
<summary>Click to expand</summary>

Frontend

Vanilla JS or React

OCR

Tesseract.js

Storage

IndexedDB

Export

Markdown generator

Optional

GitHub Pages deploy

</details>

---

# File Structure

<details>
<summary>Click to expand</summary>

```
/app
/components
/modules
/storage
/export
/schema
```

</details>

---

# End

This MVP is intentionally small, private, and expandable.

