# Landlord MVP TDD plan — legal & engineering follow-ups

Discussion doc expanding on a review of the TDD implementation roadmap. Use the sections below as a checklist when refining the plan and spec.

**Related artifacts**

- [MVP design spec](../specs/landlord_case_organizer_mvp_design_spec.md)
- TDD plan (Cursor): `C:\Users\Folma\.cursor\plans\landlord_mvp_tdd_c6ad0408.plan.md` — if the plan is copied into this repo, update the link here to a relative path.

---

## Navigation

<a id="navigation"></a>

Jump to a section:

- [Cross-cutting themes](#cross-cutting-themes)
- [Legal counsel — suggested additions](#legal-counsel-suggested-additions)
  - [Unauthorized practice of law & user reliance](#unauthorized-practice-of-law-user-reliance)
  - [Privilege, confidentiality & data lifecycle](#privilege-confidentiality-data-lifecycle)
  - [OCR accuracy & evidentiary use](#ocr-accuracy-evidentiary-use)
  - [Jurisdiction & local law](#jurisdiction-local-law)
  - [Privacy regulation & DPIA-style questions](#privacy-regulation-dpia)
- [Senior engineer partner — suggested additions](#senior-engineer-suggested-additions)
  - [Scope, phases & acceptance criteria](#scope-phases-acceptance)
  - [Storage, migrations & IndexedDB realism](#storage-migrations-indexeddb)
  - [Uploads, security & integrity](#uploads-security-integrity)
  - [OCR in production (browser)](#ocr-production-browser)
  - [Testing strategy & “done” definition](#testing-strategy-done-definition)
- [Merged checklist (action items)](#merged-checklist-action-items)

---

## Cross-cutting themes

<a id="cross-cutting-themes"></a>

<details>
<summary><strong>Read: gaps the original plan underweights</strong></summary>

The roadmap optimizes for **test discipline** and **clean layering** but underweights:

1. **Legal/product risk** — what the product must not imply, and how exports and OCR affect user decisions in disputes.
2. **Non-functional requirements** — security, storage evolution, browser constraints, accessibility.
3. **Release realism** — a path from heavily mocked OCR to behavior users actually get.

Address these in the **spec** and **plan** with owners and explicit decisions, not single-line placeholders (e.g. “reject or migrate” without a chosen behavior).

[↑ Back to navigation](#navigation)

</details>

---

## Legal counsel — suggested additions

<a id="legal-counsel-suggested-additions"></a>

<details>
<summary><strong>Expand: legal & product risk section for the plan/spec</strong></summary>

Add a short **product legal memo** block (even if non-binding internal) covering disclaimers, positioning, retention, and subprocessors before calling the MVP “shippable.”

<a id="unauthorized-practice-of-law-user-reliance"></a>
<details>
<summary><strong>Unauthorized practice of law & user reliance</strong></summary>

- Require **UX copy and product positioning**: conspicuous “not legal advice,” no suggestion that outputs are filing-ready or substitute for a lawyer.
- Review features that **feel like legal analysis**: claim builder, categorization (“Rent Increase”), structured legal notes — ensure they are framed as **organization aids**, not conclusions.
- Define engineering guardrails if needed (e.g. default export footer, in-app notices before export).

[↑ Back to navigation](#navigation)

</details>

<a id="privilege-confidentiality-data-lifecycle"></a>
<details>
<summary><strong>Privilege, confidentiality & data lifecycle</strong></summary>

- Clarify **local-first** implications: shared devices, backups, future sync, and Markdown **export** (discoverability, accidental sharing).
- Document **data deletion and retention** expectations for MVP.
- Distinguish **raw documents** vs **derived text** vs **user notes** in policy and, where helpful, in the data model copy.

[↑ Back to navigation](#navigation)

</details>

<a id="ocr-accuracy-evidentiary-use"></a>
<details>
<summary><strong>OCR accuracy & evidentiary use</strong></summary>

- User-facing **warnings** about OCR error rates; preserve **originals** alongside extracted text.
- Consider **audit metadata**: when text was extracted, by which engine/version (lightweight provenance).
- Avoid implying that extracted text is a **certified** reproduction for court.

[↑ Back to navigation](#navigation)

</details>

<a id="jurisdiction-local-law"></a>
<details>
<summary><strong>Jurisdiction & local law</strong></summary>

- Landlord–tenant law is **hyper-local**. Plan/spec should address whether the MVP is **jurisdiction-agnostic** with clear limits, or carries **jurisdiction metadata** and scoped copy.
- Ensure timelines and “claims” language does not read as universal legal truth.

[↑ Back to navigation](#navigation)

</details>

<a id="privacy-regulation-dpia"></a>
<details>
<summary><strong>Privacy regulation & DPIA-style questions</strong></summary>

- Treat evidence and notes as **personal data**; consider GDPR/CCPA-style obligations, **lawful basis**, minimization, and subprocessors (including any future cloud or analytics).
- Trigger a **DPIA** (or equivalent) when the product processes sensitive categories of data at scale.
- Plan for **breach** and **user rights** (access/delete) at least at the MVP honesty level (“what we can/can’t do on-device”).

[↑ Back to navigation](#navigation)

</details>

</details>

---

## Senior engineer partner — suggested additions

<a id="senior-engineer-suggested-additions"></a>

<details>
<summary><strong>Expand: delivery plan beyond TDD discipline</strong></summary>

Turn the roadmap into something a partner would **sign**: public APIs, acceptance criteria tied to the spec, NFR gates, and integration path for OCR.

<a id="scope-phases-acceptance"></a>
<details>
<summary><strong>Scope, phases & acceptance criteria</strong></summary>

- **Decompose** Phases 1, 6, and 8 — each currently bundles multiple subsystems. Define a **narrow public API** per phase.
- Map **tests to spec sections** (IDs or headings) so “done” is not only “tests were red first.”
- **Prioritize screens** in Phase 8; avoid “each screen” without order or cut lines.
- For **ADHD / focus features**: specify **WCAG** and keyboard flows, not only pure selectors/reducers.

[↑ Back to navigation](#navigation)

</details>

<a id="storage-migrations-indexeddb"></a>
<details>
<summary><strong>Storage, migrations & IndexedDB realism</strong></summary>

- **Version** IndexedDB schema; add **migration tests** and explicit behavior for upgrade failure.
- Document **fake-indexeddb vs browser** gaps; define a fallback (e.g. Playwright storage smoke) if CI shims fail.
- Replace “corrupt payload — reject or migrate” with a **chosen** behavior and tests for it.

[↑ Back to navigation](#navigation)

</details>

<a id="uploads-security-integrity"></a>
<details>
<summary><strong>Uploads, security & integrity</strong></summary>

- **Limits**: file size, allowed types, sane handling of names/paths.
- Clarify whether bytes ever leave the device; align with privacy promises.
- Consider **integrity signals** for an evidence app: content hashes, linkage to original blob vs derived text (stakeholder expectation).

[↑ Back to navigation](#navigation)

</details>

<a id="ocr-production-browser"></a>
<details>
<summary><strong>OCR in production (browser)</strong></summary>

- **Tesseract.js**: WASM, workers, memory, timeouts, language packs.
- **CSP** implications (`worker-src`, etc.).
- Distinguish **test flakiness** from **production UX** (partial failure, retry, user messaging).

[↑ Back to navigation](#navigation)

</details>

<a id="testing-strategy-done-definition"></a>
<details>
<summary><strong>Testing strategy & “done” definition</strong></summary>

- Add **contract or smoke** path between “all mocked” and optional E2E so shipped OCR is not only a mock.
- Define **“stable”** before Phase 9 (Playwright): e.g. green suite + one real-image or staging path.
- **Completion checklist**: add measurable MVP cuts, a11y, and security/storage gates — not only red–green discipline.

[↑ Back to navigation](#navigation)

</details>

</details>

---

## Merged checklist (action items)

<a id="merged-checklist-action-items"></a>

<details>
<summary><strong>Open: consolidated checklist (copy into plan or issue tracker)</strong></summary>

| Area | Action |
|------|--------|
| Legal / product | Add disclaimers, export warnings, and “not legal advice” positioning; review claim/category UX for UPL optics. |
| Data | Document retention/deletion, local device risk, and export/discovery implications. |
| OCR | User warnings; preserve originals; lightweight provenance on extracted text. |
| Privacy | Lawful basis, minimization, subprocessors; DPIA if warranted. |
| Spec linkage | Acceptance tests mapped to spec sections with IDs. |
| IDB | Versioned schema, migrations, corrupt/upgrade tests; CI strategy for shim vs browser. |
| Uploads | Size/type limits; sanitization; integrity hashing if required by stakeholders. |
| Browser OCR | CSP, workers, memory/timeouts; production failure UX. |
| Testing | Bridge mocked OCR to minimal real integration; define “stable” for E2E. |
| UI / NFR | WCAG and keyboard paths for focus/progress features. |

[↑ Back to navigation](#navigation)

</details>
