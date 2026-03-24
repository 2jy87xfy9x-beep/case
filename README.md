# Landlord Case Organizer – README
*A private ADHD‑friendly case organizer for building a landlord dispute before speaking to a lawyer.*

---

# 📌 Navigation
- [Purpose](#purpose)
- [Who This Is For](#who-this-is-for)
- [Goals](#goals)
- [Non‑Goals](#non-goals)
- [ADHD Design Requirements](#adhd-design-requirements)
- [User Knowledge Constraints](#user-knowledge-constraints)
- [Core Problems This Solves](#core-problems-this-solves)
- [Draft product direction](#draft-product-direction)
- [Privacy requirements](#privacy-requirements)
- [Project status and documentation](#project-status-and-documentation)

---

# Purpose

This app exists to help a tenant **organize a potential legal case against a landlord** before contacting a lawyer.

It should help you:

- organize messy documents
- surface important information from what you already have
- track events chronologically
- learn relevant law at your own pace
- see possible issues to discuss with counsel
- prepare materials a lawyer can use quickly
- reduce overwhelm

This is **not a legal advice tool**. It is a **case organization workspace**.

---

# Who This Is For

<details>
<summary>Click to expand</summary>

This app is designed for:

- someone with ADHD
- no legal knowledge
- overwhelmed by documents
- unsure what matters
- unsure what to collect
- unsure what lawyers need
- wants to prepare before consultation

The user may:

- upload messy photos
- forget context
- jump between topics
- learn law gradually
- discover new issues later

The app should support that style of work.

</details>

---

# Goals

<details>
<summary>Click to expand</summary>

Primary goals:

1. Reduce overwhelm
2. Organize evidence
3. Build a chronological timeline
4. Track rent changes, fees, and communication where relevant
5. Track legal research in one place
6. Identify possible claims to discuss with a lawyer (not conclusions)
7. Prepare a concise lawyer packet
8. Allow ongoing edits as you learn more

Secondary goals:

- work locally
- remain private
- simple UI
- room to grow later

</details>

---

# Non Goals

<details>
<summary>Click to expand</summary>

This app does NOT:

- give legal advice
- predict case outcomes
- contact lawyers automatically
- file legal paperwork
- require login (as a design default)
- depend on cloud storage for core use

</details>

---

# ADHD Design Requirements

<details>
<summary>Click to expand</summary>

The UI should:

- reduce clutter
- show one primary task at a time when possible
- allow quick capture
- help impose order without demanding perfection
- avoid long forms
- allow incomplete entries
- show progress
- support jumping around

The experience should:

- assist with categorization and timeline assembly where it helps
- nudge toward next sensible steps without pretending to know your case

</details>

---

# User Knowledge Constraints

<details>
<summary>Click to expand</summary>

User may not know:

- what laws apply
- what documents matter
- what lawyers need
- what violations exist
- what timeline matters

The app should:

- allow learning gradually
- support legal notes
- help relate law, evidence, and possible claims over time

</details>

---

# Core Problems This Solves

<details>
<summary>Click to expand</summary>

Problem 1  
Documents are scattered

Problem 2  
User forgets events

Problem 3  
User unsure what matters legally

Problem 4  
User overwhelmed by research

Problem 5  
User unsure what lawyer needs

Problem 6  
Timeline unclear

Problem 7  
Evidence not organized

</details>

---

# Draft product direction

*Nothing here is implemented yet. Details live in `/docs`.*

<details>
<summary>Click to expand</summary>

Rough intent for a first version:

- bring documents and images into one workspace
- extract or capture text where useful (e.g. OCR) so items are searchable and quotable
- tag and group evidence; link items to dates and topics
- maintain a chronological view of rent, notices, fees, messages, and payments as you add them
- keep legal learning notes and connect them to evidence and issues you are tracking
- outline possible claims or issues for counsel—not automated legal conclusions
- optional notes and questions for the lawyer visit
- export or share a readable packet when you are ready (formats TBD in spec)

Out of scope for early thinking: multi-user accounts, mandatory auth, cloud as the default store, or anything that presents itself as legal advice.

Design and engineering choices (stack, export formats, deployment) belong in the specs and plans below—not in this README.

</details>

---

# Privacy requirements

<details>
<summary>Click to expand</summary>

Must be:

- local first
- no login required for core use
- no cloud required to use the product privately
- treat user data as sensitive

Optional directions (to be decided in spec):

- static or static-friendly deployment
- optional publish/export paths if you explicitly choose them

</details>

---

# Project status and documentation

<details>
<summary>Click to expand</summary>

**Status:** initial TypeScript MVP scaffold implemented (domain + parsers + OCR ports).

For product and technical detail, see:

- [Design spec v2](docs/specs/landlord_case_organizer_design_spec_v2.md)
- [MVP TDD plan v2](docs/plans/landlord_mvp_tdd_v2.plan.md)
- [Archived v1 plan](docs/archive/plans/landlord_mvp_tdd_c6ad0408_v1.plan.md)

</details>

---

This project is meant to help organize uncertainty into a structured picture you can take to a lawyer.
