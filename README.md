# Landlord Case Organizer – README
*A private ADHD‑friendly case organizer for building a landlord dispute before speaking to a lawyer.*

<details id="quick-start">
<summary><strong>Quick start</strong></summary>

### Setup

1. **Prerequisites:** [Node.js](https://nodejs.org/) (LTS recommended).
2. **Install:** from the repo root, run `npm install`.

### Commands

| Command | What it does |
|--------|----------------|
| `npm test` | Run the full Vitest suite once. |
| `npm run test:watch` | Re-run tests on file changes. |
| `npm run test:e2e` | Run Playwright E2E tests (requires `npx playwright install` first). |
| `npm run dev:ui` | Start the Vite dev server for the web UI (`web/`). |
| `npm run build:ui` | Production build of the web UI (`dist/web/`). |

### Deploy (Netlify — recommended)

A `netlify.toml` at the repo root configures the build automatically.

1. **app.netlify.com → Add new site → Import from Git** — connect this repo.
2. Netlify reads `netlify.toml`; no manual settings needed.
3. Every push to the connected branch redeploys automatically.

Once deployed, any device with a browser can use the app at the Netlify URL.

### Use on multiple devices

Data is stored locally in each browser's IndexedDB. To move your case to another device:

1. Open the **Export** tab → **Move to another device**.
2. Tap **Download backup (.json)** — saves all case data (text, messages, notes, lawyers).
3. On the other device, open the app and tap **Restore from backup** — select the `.json` file.

> **Note:** Original image files are not stored in IndexedDB (only the extracted text is kept). Re-upload any photos after restoring on a new device.

### Install as a PWA

The app ships a Web App Manifest (`web/manifest.json`). Once hosted:

- **iOS Safari:** Share → Add to Home Screen.
- **Android Chrome:** browser install prompt, or Menu → Add to Home Screen.

The app opens fullscreen without browser chrome and behaves like a native app.

### Repo layout (high level)

- **`app/`** — domain logic, application use cases, storage adapters, OCR/message ports.
- **`web/`** — browser UI entry, Vite config, PWA manifest and icons.
- **`tests/`** — Vitest specs mirroring `app/`.
- **`netlify.toml`** — deploy and security-headers config.

### Documentation

Product and roadmap live under [`docs/`](docs/). Good entry points:

- [Design spec v2](docs/specs/landlord_case_organizer_design_spec_v2.md)
- [MVP TDD plan v2](docs/plans/landlord_mvp_tdd_v2.plan.md)
- [Multi-device support report](docs/reports/implementation/multi_device_support_2026-03-24.md)

</details>

---

# 📌 Navigation
- [Quick start](#quick-start)
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

*Phases 0–9 are implemented. Details live in [`docs/`](docs/).*

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

**Status:** Phases 0–9 implemented — domain, storage, tiered OCR (Vision/Tesseract/Manual/Cloud), message import, gap detection, claims/legal notes, Lawyer CRUD, Markdown export, vanilla TS web UI (Phase 8 shell), Playwright E2E scaffolding (Phase 9), and multi-device support (PWA manifest, JSON backup/restore, Netlify deploy config).

For product and technical detail, see:

- [Design spec v2](docs/specs/landlord_case_organizer_design_spec_v2.md)
- [MVP TDD plan v2](docs/plans/landlord_mvp_tdd_v2.plan.md)
- [Archived v1 plan](docs/archive/plans/landlord_mvp_tdd_c6ad0408_v1.plan.md)

</details>

---

This project is meant to help organize uncertainty into a structured picture you can take to a lawyer.
