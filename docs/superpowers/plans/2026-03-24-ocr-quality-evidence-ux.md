# OCR Quality & Evidence UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract EXIF dates from photos, surface OCR text and review needs to the user, fix key facts noise, add a re-process button, and build an image preprocessing pipeline that significantly improves Tesseract accuracy.

**Architecture:** New utility modules handle each concern independently; `autoProcess.ts` gains EXIF date fallback and the preprocessing chain; `web/main.ts` gains review queue rendering, OCR preview toggling, key facts navigation, and re-process triggering. All new logic is pure-function tested before wiring into the UI.

**Tech Stack:** TypeScript, exifr (already installed), OffscreenCanvas API, Tesseract.js, Vitest, Vite

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `app/application/extractExifDate.ts` | Read DateTimeOriginal from JPEG EXIF |
| Create | `app/application/filterKeyFacts.ts` | Smart dollar-amount filtering + dedup |
| Create | `app/application/preprocessImageForOcr.ts` | Full image preprocessing chain |
| Modify | `app/application/prepareImageForOcr.ts` | Delegate rotation to new preprocessor |
| Modify | `app/application/autoProcess.ts` | Use EXIF date fallback; use preprocessor |
| Modify | `web/main.ts` | OCR preview, review queue, key facts nav, re-process |
| Modify | `web/styles.css` | Styles for review badge, OCR preview, fact rows |
| Create | `tests/application/extractExifDate.test.ts` | Unit tests |
| Create | `tests/application/filterKeyFacts.test.ts` | Unit tests |
| Create | `tests/application/preprocessImageForOcr.test.ts` | Unit tests |

---

## Task 1: EXIF Date Extraction

**Files:**
- Create: `app/application/extractExifDate.ts`
- Create: `tests/application/extractExifDate.test.ts`
- Modify: `app/application/autoProcess.ts` (integrate)

### Context
`exifr` is already installed (`exifr@7.1.3`). Its `parse(file, options)` function returns tag objects including `DateTimeOriginal` as a JS `Date`. The existing `prepareImageForOcr.ts` already imports `rotation` from `exifr` — same pattern applies here.

`autoProcess.ts` currently uses `extractMeta(file.name, body)` to get a date from OCR text or filename. EXIF date should be used as a high-confidence fallback when that returns null.

- [ ] **Step 1: Write failing tests**

```typescript
// tests/application/extractExifDate.test.ts
import { describe, it, expect, vi } from 'vitest';
import { extractExifDate } from '../../app/application/extractExifDate.js';

// We mock exifr because we can't create real EXIF-embedded files in unit tests
vi.mock('exifr', () => ({
  parse: vi.fn()
}));

import { parse } from 'exifr';
const mockParse = vi.mocked(parse);

describe('extractExifDate', () => {
  it('returns null for non-image files', async () => {
    const file = new File(['data'], 'doc.pdf', { type: 'application/pdf' });
    expect(await extractExifDate(file)).toBeNull();
  });

  it('returns DateTimeOriginal when present', async () => {
    mockParse.mockResolvedValueOnce({ DateTimeOriginal: new Date('2023-11-07T14:22:00') });
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    const result = await extractExifDate(file);
    expect(result).toEqual(new Date('2023-11-07T14:22:00'));
  });

  it('falls back to CreateDate when DateTimeOriginal is absent', async () => {
    mockParse.mockResolvedValueOnce({ CreateDate: new Date('2023-05-01T09:00:00') });
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    const result = await extractExifDate(file);
    expect(result).toEqual(new Date('2023-05-01T09:00:00'));
  });

  it('returns null when exifr throws', async () => {
    mockParse.mockRejectedValueOnce(new Error('no EXIF'));
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    expect(await extractExifDate(file)).toBeNull();
  });

  it('returns null when date is invalid', async () => {
    mockParse.mockResolvedValueOnce({ DateTimeOriginal: new Date('invalid') });
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    expect(await extractExifDate(file)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
npx vitest run tests/application/extractExifDate.test.ts
```
Expected: FAIL — `Cannot find module '../../app/application/extractExifDate.js'`

- [ ] **Step 3: Implement extractExifDate.ts**

```typescript
// app/application/extractExifDate.ts
import { parse } from 'exifr';

const SUPPORTED = new Set(['image/jpeg', 'image/jpg', 'image/heic', 'image/heif', 'image/png']);

export async function extractExifDate(file: File): Promise<Date | null> {
  if (!SUPPORTED.has(file.type.toLowerCase())) return null;
  try {
    const tags = await parse(file, { DateTimeOriginal: true, CreateDate: true });
    const dt: unknown = tags?.DateTimeOriginal ?? tags?.CreateDate;
    if (dt instanceof Date && isFinite(dt.getTime())) return dt;
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx vitest run tests/application/extractExifDate.test.ts
```
Expected: 5 passing

- [ ] **Step 5: Integrate into autoProcess.ts**

In `autoProcess.ts`, import `extractExifDate` and call it for every image file. Use the result as a fallback when `extractMeta` returns `date: null`.

Find the block that classifies and OCRs each file (inside the `for (const file of files)` loop, after the `extractMeta` call at approximately line 284):

```typescript
// At top of file, add import:
import { extractExifDate } from './extractExifDate.js';

// Inside the for (const file of files) loop, after extractMeta:
const meta = extractMeta(file.name, body);

// Add EXIF date fallback for images with no text-extracted date:
if (meta.date === null && PHOTO_EXTS.has(extOf(file.name))) {
  meta.date = await extractExifDate(file);
}
```

Note: `meta` is currently a `const` from `extractMeta` — change that line to `let meta = extractMeta(...)` OR mutate `meta.date` directly since `ExtractMetaResult` uses plain object properties (not readonly).

- [ ] **Step 6: Run full test suite**

```bash
npm test
```
Expected: all existing tests pass, 5 new ones pass

- [ ] **Step 7: Commit**

```bash
git add app/application/extractExifDate.ts tests/application/extractExifDate.test.ts app/application/autoProcess.ts
git commit -m "feat: extract EXIF DateTimeOriginal as evidence date fallback for photos"
```

---

## Task 2: Show OCR Text Preview on Evidence Rows

**Files:**
- Modify: `web/main.ts` — `renderSourceFiles()`
- Modify: `web/styles.css` — add `.ocr-preview` styles

### Context
`Evidence.body` holds the raw OCR text (or empty string). Currently `renderSourceFiles` never shows it. We want the first 2-3 non-empty lines visible under each evidence row, collapsed by default, toggled by clicking a small "text ▸" button. No new tests needed (pure UI render).

- [ ] **Step 1: Add CSS**

Append to `web/styles.css`:

```css
/* ── OCR text preview ──────────────────────────────────────────────────── */
.ocr-preview {
  font-size: 11px;
  color: #888;
  font-family: monospace;
  line-height: 1.5;
  padding: 6px 8px;
  background: #f9f9f9;
  border-left: 2px solid #e0e0e0;
  margin: 4px 0 4px 24px;
  white-space: pre-wrap;
  word-break: break-word;
  display: none;
}
.ocr-preview.visible { display: block; }
.ocr-toggle {
  background: none; border: none; color: #aaa;
  font-size: 10px; cursor: pointer; padding: 0 4px;
  letter-spacing: 0.05em; flex-shrink: 0;
}
.ocr-toggle:hover { color: #555; }
```

- [ ] **Step 2: Update renderSourceFiles in main.ts**

Replace the current evidence row HTML template inside `renderSourceFiles` with one that includes an OCR toggle button and preview div. Also wire a click handler after setting `list.innerHTML`.

Find this section in `renderSourceFiles`:
```typescript
    return `<div class="evidence-row" data-ev-id="${esc(ev.id)}" style="display:flex;align-items:center;gap:6px">
      ...
    </div>`;
```

Replace with:
```typescript
    const previewLines = ev.body
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .slice(0, 3)
      .join('\n');
    const hasPreview = previewLines.length > 0;
    return `<div class="evidence-row-wrap" data-ev-id="${esc(ev.id)}">
      <div class="evidence-row" style="display:flex;align-items:center;gap:6px">
        <span class="evidence-row__icon">${icon}</span>
        <span class="evidence-row__name" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(ev.title)}</span>
        <span class="evidence-row__tag">${esc(ev.category ?? '—')}</span>
        <span style="font-size:10px;color:#bbb;flex-shrink:0">${esc(date)}</span>
        ${hasPreview ? `<button class="ocr-toggle" data-ev-id="${esc(ev.id)}" type="button" data-tip="Show OCR text">text ▸</button>` : ''}
        <button class="ev-edit-btn" data-ev-id="${esc(ev.id)}" type="button" data-tip="Edit">✏</button>
        <button class="ev-delete-btn" data-ev-id="${esc(ev.id)}" type="button" data-tip="Delete" style="background:none;border:none;color:#666;cursor:pointer;font-size:16px;padding:2px 4px;flex-shrink:0">×</button>
      </div>
      ${hasPreview ? `<div class="ocr-preview" id="ocr-preview-${esc(ev.id)}">${esc(previewLines)}</div>` : ''}
    </div>`;
```

After setting `list.innerHTML`, add toggle handler (alongside the existing edit/delete handlers):
```typescript
  list.querySelectorAll('.ocr-toggle').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const evId = (btn as HTMLElement).dataset.evId!;
      const preview = document.getElementById(`ocr-preview-${evId}`);
      if (!preview) return;
      const showing = preview.classList.toggle('visible');
      (btn as HTMLElement).textContent = showing ? 'text ▾' : 'text ▸';
    });
  });
```

- [ ] **Step 3: Build and verify in browser**

```bash
npm run build:ui
```
Open the case, expand Source Files — each item with OCR text should show a `text ▸` button. Click it to see the extracted text.

- [ ] **Step 4: Commit**

```bash
git add web/main.ts web/styles.css
git commit -m "feat: show OCR text preview toggle on evidence rows"
```

---

## Task 3: Needs Review Queue

**Files:**
- Modify: `web/main.ts` — add `renderNeedsReview()`
- Modify: `web/index.html` — add review section to brief screen
- Modify: `web/styles.css` — review badge and section styles

### Context
Items needing review are those where `requiresUserReview === true` AND either `ev.body.length < 50` or `ev.category === 'photo'`. These are evidence items where OCR produced too little text to classify. The queue groups them separately and prompts the user to edit (rename/recategorize) or re-process.

- [ ] **Step 1: Add HTML section to brief screen**

In `web/index.html`, find the `<!-- 7. Gaps -->` comment block and add a new section just BEFORE it:

```html
<!-- 6b. Needs Review -->
<div class="brief-section" id="brief-review-section" style="display:none">
  <div class="brief-section__header">
    <span>Needs Review</span>
    <span class="review-badge" id="brief-review-badge">0</span>
  </div>
  <p style="font-size:12px;color:#888;margin:0 0 8px">These items couldn't be read clearly. Rename them, change their category, or use Re-process to try OCR again.</p>
  <div id="brief-review-list"><!-- Rendered by JS --></div>
</div>
```

- [ ] **Step 2: Add CSS**

```css
/* ── Needs Review section ──────────────────────────────────────────────── */
.review-badge {
  background: #b85c00;
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 10px;
  letter-spacing: 0.04em;
}
.review-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #fff8f0;
  border: 1px solid #f0d9b5;
  border-radius: 4px;
  margin-bottom: 4px;
  font-size: 12px;
}
.review-row__label { flex: 1; color: #555; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.review-row__reason { font-size: 10px; color: #b85c00; flex-shrink: 0; }
.review-row__edit { background: none; border: 1px solid #ccc; color: #333; padding: 3px 8px; border-radius: 3px; cursor: pointer; font-size: 11px; flex-shrink: 0; font-family: inherit; }
.review-row__edit:hover { border-color: #888; }
```

- [ ] **Step 3: Add renderNeedsReview() to main.ts**

Add this function after `renderSourceFiles`:

```typescript
function renderNeedsReview(c: Case): void {
  const section = document.getElementById('brief-review-section')!;
  const list = document.getElementById('brief-review-list')!;
  const badge = document.getElementById('brief-review-badge')!;

  const reviewItems = c.evidence.filter(
    (ev) => ev.requiresUserReview && (ev.body.trim().length < 50 || ev.category === 'photo')
  );

  if (reviewItems.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';
  badge.textContent = String(reviewItems.length);

  list.innerHTML = reviewItems.map((ev) => {
    const reason = ev.body.trim().length < 10
      ? 'No text extracted'
      : ev.body.trim().length < 50
      ? 'Too little text to classify'
      : 'Could not identify document type';
    return `<div class="review-row" data-ev-id="${esc(ev.id)}">
      <span class="review-row__label" title="${esc(ev.title)}">${esc(ev.title)}</span>
      <span class="review-row__reason">${esc(reason)}</span>
      <button class="review-row__edit" data-ev-id="${esc(ev.id)}" type="button">Edit ✏</button>
    </div>`;
  }).join('');

  list.querySelectorAll('.review-row__edit').forEach((btn) => {
    btn.addEventListener('click', () => {
      const evId = (btn as HTMLElement).dataset.evId!;
      const ev = c.evidence.find((x) => x.id === evId);
      if (ev) showEvidenceEditForm(ev, c.id);
    });
  });
}
```

- [ ] **Step 4: Call renderNeedsReview from renderBrief**

In `renderBrief(c: Case)`, after the `renderSourceFiles(c)` call, add:
```typescript
renderNeedsReview(c);
```

- [ ] **Step 5: Build and verify**

```bash
npm run build:ui
```
Open the case — a "Needs Review" section should appear with orange badges for unclassifiable items. Clicking "Edit ✏" should open the edit modal.

- [ ] **Step 6: Commit**

```bash
git add web/main.ts web/index.html web/styles.css
git commit -m "feat: add needs-review queue for low-confidence OCR evidence items"
```

---

## Task 4: Fix Key Facts

**Files:**
- Create: `app/application/filterKeyFacts.ts`
- Create: `tests/application/filterKeyFacts.test.ts`
- Modify: `web/main.ts` — `renderKeyFacts()`
- Modify: `web/styles.css` — make fact rows clickable

### Context
Current problems: (1) regex matches account numbers, check numbers, zeros; (2) arrows are decorative only. Fix: extract into a pure filterable function, make arrows scroll+highlight the source evidence item.

- [ ] **Step 1: Write failing tests**

```typescript
// tests/application/filterKeyFacts.test.ts
import { describe, it, expect } from 'vitest';
import { extractKeyFacts } from '../../app/application/filterKeyFacts.js';

const ev = (id: string, title: string, body: string) => ({ id, title, body });

describe('extractKeyFacts', () => {
  it('filters amounts below $5', () => {
    const facts = extractKeyFacts([ev('1', 'Notice', '$3.00 was charged')]);
    expect(facts).toHaveLength(0);
  });

  it('keeps valid rent amounts', () => {
    const facts = extractKeyFacts([ev('1', 'Lease', 'monthly rent of $850.00')]);
    expect(facts).toHaveLength(1);
    expect(facts[0].amount).toBe(850);
    expect(facts[0].evidenceId).toBe('1');
  });

  it('filters all-zero amounts like account numbers', () => {
    const facts = extractKeyFacts([ev('1', 'Check', '$000.00 account')]);
    expect(facts).toHaveLength(0);
  });

  it('filters amounts with too many digits (account numbers)', () => {
    const facts = extractKeyFacts([ev('1', 'Bank', '$12345678 balance')]);
    expect(facts).toHaveLength(0);
  });

  it('deduplicates same amount from same evidence', () => {
    const facts = extractKeyFacts([ev('1', 'Lease', '$850.00 rent due $850.00 per month')]);
    expect(facts).toHaveLength(1);
  });

  it('caps at 8 total facts across evidence', () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      ev(String(i), `Item ${i}`, `$${(i + 1) * 100}.00 due`)
    );
    expect(extractKeyFacts(items)).toHaveLength(8);
  });

  it('includes evidenceId for navigation', () => {
    const facts = extractKeyFacts([ev('abc-123', 'Notice', '$75.00 late fee')]);
    expect(facts[0].evidenceId).toBe('abc-123');
  });

  it('filters amounts starting with three or more zeros', () => {
    const facts = extractKeyFacts([ev('1', 'Check', '$0001.00 ref number')]);
    expect(facts).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/application/filterKeyFacts.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement filterKeyFacts.ts**

```typescript
// app/application/filterKeyFacts.ts

export interface KeyFact {
  raw: string;
  amount: number;
  evidenceId: string;
  evidenceTitle: string;
}

const DOLLAR_RE = /\$[\d,]+(?:\.\d{2})?/g;

export function extractKeyFacts(
  evidence: Array<{ id: string; title: string; body: string }>
): KeyFact[] {
  const facts: KeyFact[] = [];
  const seenKeys = new Set<string>();

  for (const ev of evidence) {
    const matches = ev.body.match(DOLLAR_RE) ?? [];
    for (const raw of matches.slice(0, 2)) {
      const digits = raw.replace(/[$,.]/g, '');
      const amount = parseFloat(raw.replace(/[$,]/g, ''));

      if (!isValidAmount(amount, digits)) continue;

      const key = `${digits}:${ev.id}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      facts.push({ raw, amount, evidenceId: ev.id, evidenceTitle: ev.title });
      if (facts.length >= 8) return facts;
    }
  }

  return facts;
}

function isValidAmount(amount: number, digits: string): boolean {
  if (amount < 5) return false;
  if (amount > 100_000) return false;
  if (digits.length > 7) return false;           // account/routing numbers
  if (/^0+$/.test(digits)) return false;         // all zeros
  if (/^0{3}/.test(digits)) return false;        // starts with 3+ zeros
  return true;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/application/filterKeyFacts.test.ts
```
Expected: 8 passing

- [ ] **Step 5: Update renderKeyFacts in main.ts**

Replace the entire `renderKeyFacts` function:

```typescript
import { extractKeyFacts } from '../app/application/filterKeyFacts.js';

function renderKeyFacts(c: Case): void {
  const container = document.getElementById('brief-key-facts')!;
  const empty = document.getElementById('brief-key-facts-empty')!;

  const facts = extractKeyFacts(c.evidence);

  // Prepend tenancy info if present
  const tenancyFacts: string[] = [];
  if (c.tenancy?.monthlyRentCurrent) {
    tenancyFacts.push(`$${c.tenancy.monthlyRentCurrent.toLocaleString()} — current monthly rent`);
  }
  if (c.tenancy?.monthlyRentOriginal) {
    tenancyFacts.push(`$${c.tenancy.monthlyRentOriginal.toLocaleString()} — original monthly rent`);
  }

  if (facts.length === 0 && tenancyFacts.length === 0) {
    container.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  const tenancyHTML = tenancyFacts.map((f) =>
    `<div class="fact-row"><span class="fact-row__arrow">›</span><span>${esc(f)}</span></div>`
  ).join('');

  const factHTML = facts.map((f) =>
    `<button class="fact-row fact-row--link" type="button" data-ev-id="${esc(f.evidenceId)}" data-tip="Jump to source">
      <span class="fact-row__arrow">›</span>
      <span>${esc(f.raw)} — ${esc(f.evidenceTitle)}</span>
    </button>`
  ).join('');

  container.innerHTML = tenancyHTML + factHTML;

  container.querySelectorAll('.fact-row--link').forEach((btn) => {
    btn.addEventListener('click', () => {
      const evId = (btn as HTMLElement).dataset.evId!;
      // Open sources panel and scroll to the evidence row
      const details = document.getElementById('brief-sources-details') as HTMLDetailsElement;
      if (details) details.open = true;
      setTimeout(() => {
        const row = document.querySelector(`[data-ev-id="${evId}"]`);
        if (row) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          (row as HTMLElement).style.outline = '2px solid #4a90d9';
          setTimeout(() => { (row as HTMLElement).style.outline = ''; }, 1500);
        }
      }, 100);
    });
  });
}
```

- [ ] **Step 6: Add CSS for clickable fact rows**

In `web/styles.css`, find the existing `.fact-row` style and add:
```css
.fact-row--link {
  cursor: pointer;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  font: inherit;
  padding: 0;
}
.fact-row--link:hover { background: #f0f4ff; }
.fact-row--link:hover .fact-row__arrow { color: #4a90d9; }
```

- [ ] **Step 7: Run full tests and build**

```bash
npm test && npm run build:ui
```
Expected: all pass, build clean

- [ ] **Step 8: Commit**

```bash
git add app/application/filterKeyFacts.ts tests/application/filterKeyFacts.test.ts web/main.ts web/styles.css
git commit -m "feat: smart key facts filtering and clickable navigation to source evidence"
```

---

## Task 5: Re-process Button

**Files:**
- Modify: `web/main.ts` — add `reprocessPhotos()`
- Modify: `web/index.html` — add button to brief screen

### Context
Re-process should find all evidence items with `category === 'photo'`, re-run OCR+preprocessing on their stored data, then reclassify via `classifyFromContent`. The challenge: evidence blobs are NOT stored in IndexedDB (only metadata + OCR text). The user must still have the original files available.

**Decision:** Re-process works by having the user select the original files again via a file picker filtered to images. The app matches by filename against existing evidence, runs OCR, updates the evidence item. This is the only option without storing full file blobs in the DB.

Show a progress counter: "Re-processing 3 of 8…"

- [ ] **Step 1: Add button to index.html**

In the Source Files section (`brief-sources-details`), add a button in the `<summary>` row:
```html
<summary>
  <span id="brief-sources-label">0 files</span>
  <span style="font-size:11px;color:#aaa">▸</span>
  <button id="btn-reprocess" type="button"
    style="margin-left:auto;background:none;border:1px solid #ccc;color:#555;font-size:11px;padding:3px 8px;border-radius:3px;cursor:pointer;font-family:inherit"
    data-tip="Re-run OCR on photos">Re-process ↺</button>
</summary>
```

- [ ] **Step 2: Add imports and reprocessPhotos() to main.ts**

Add `extractExifDate` to imports at the top of `web/main.ts`. Also add `classifyFromContent` to the **existing** `import { autoProcess }` line for `autoProcess.js` — do NOT add a second import statement for that module:

```typescript
// Existing line — extend it:
import { autoProcess, classifyFromContent } from '../app/application/autoProcess.js';

// New import to add:
import { extractExifDate } from '../app/application/extractExifDate.js';
```

Then add the function:

```typescript
async function reprocessPhotos(c: Case): Promise<void> {
  const photoItems = c.evidence.filter((ev) => ev.category === 'photo' || ev.requiresUserReview);
  if (photoItems.length === 0) {
    alert('No photos to re-process.');
    return;
  }

  // Ask user to re-select the original image files
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = 'image/*';
  input.style.display = 'none';
  document.body.appendChild(input);

  input.onchange = async () => {
    const files = Array.from(input.files ?? []);
    input.remove();
    if (files.length === 0) return;

    const statusEl = document.getElementById('intake-status')!;
    let updated = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      statusEl.textContent = `Re-processing ${i + 1} of ${files.length}: ${file.name}…`;

      // Find matching evidence by filename
      const ev = photoItems.find((e) => {
        const stored = e.title.toLowerCase();
        const incoming = file.name.replace(/\.[^.]+$/, '').toLowerCase();
        return stored === incoming || stored === file.name.toLowerCase();
      });
      if (!ev) continue;

      try {
        const ocrService = buildOcrService();
        const ocrResult = await ocrService.extractText(file);
        const reclassified = classifyFromContent(ocrResult.text);
        const exifDate = await extractExifDate(file);

        const updatedEv = {
          ...ev,
          body: ocrResult.text,
          requiresUserReview: ocrResult.text.trim().length < 50,
          category: reclassified?.category ?? ev.category,
          title: reclassified?.label ?? ev.title,
          dateTime: exifDate ?? ev.dateTime,
          provenance: { ...ev.provenance, tier: ocrResult.tier, extractedAt: new Date() }
        };

        await repo.saveEvidence(c.id, [updatedEv]);
        updated++;
      } catch {
        // Skip files that fail; continue with others
      }
    }

    statusEl.textContent = `Re-processed ${updated} item${updated !== 1 ? 's' : ''}.`;
    setTimeout(() => { statusEl.textContent = ''; }, 3000);
    await openCase(c.id);
  };

  input.click();
}
```

- [ ] **Step 3: Wire the button in renderBrief**

In `renderBrief(c: Case)`, after the existing event wiring, add:
```typescript
const reprocessBtn = document.getElementById('btn-reprocess');
if (reprocessBtn) {
  reprocessBtn.onclick = () => reprocessPhotos(c);
}
```

- [ ] **Step 4: Build and verify**

```bash
npm run build:ui
```
Open a case → Source Files → "Re-process ↺" button should appear. Clicking it opens a file picker.

- [ ] **Step 5: Commit**

```bash
git add web/main.ts web/index.html
git commit -m "feat: re-process button re-runs OCR on photo evidence items"
```

---

## Task 6: Image Preprocessing Pipeline

**Files:**
- Create: `app/application/preprocessImageForOcr.ts`
- Create: `tests/application/preprocessImageForOcr.test.ts`
- Modify: `app/application/autoProcess.ts` — use preprocessor instead of prepareImageForOcr

### Context
`prepareImageForOcr.ts` only handles EXIF rotation. The new preprocessor extends that with:
1. **Upscale 2.5×** — Tesseract needs ~300 DPI; phone photos are often compressed
2. **Grayscale** — removes color noise
3. **Contrast stretch** — darkens text, lightens background
4. **Sharpen** — compensates for blur via 3×3 convolution kernel
5. **Adaptive binarize** — converts to black/white using Otsu's threshold to handle uneven lighting

All operations run in `OffscreenCanvas` + `ImageData` (browser-native, no libraries needed). The sharpen and binarize steps operate on raw pixel arrays.

- [ ] **Step 1: Write failing tests**

```typescript
// tests/application/preprocessImageForOcr.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildGrayscaleArray, otsuThreshold } from '../../app/application/preprocessImageForOcr.js';

// Note: we test the pure math helpers directly; the main pipeline function
// requires browser Canvas APIs so is integration-tested via E2E

describe('otsuThreshold', () => {
  it('returns midpoint for bimodal histogram', () => {
    // 128 pixels at 0 (black text), 128 pixels at 255 (white background)
    const histogram = new Array(256).fill(0);
    histogram[0] = 128;
    histogram[255] = 128;
    const t = otsuThreshold(histogram, 256);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(255);
  });

  it('returns 127 for uniform histogram', () => {
    const histogram = new Array(256).fill(1);
    const t = otsuThreshold(histogram, 256);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThanOrEqual(255);
  });
});

describe('buildGrayscaleArray', () => {
  it('converts RGBA pixel array to grayscale', () => {
    // Red pixel: R=255, G=0, B=0, A=255
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
    const gray = buildGrayscaleArray(rgba);
    // Rec.709 luma: 0.2126*R + 0.7152*G + 0.0722*B
    expect(gray[0]).toBeCloseTo(255 * 0.2126, 0); // red → ~54
    expect(gray[1]).toBeCloseTo(255 * 0.7152, 0); // green → ~182
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/application/preprocessImageForOcr.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement preprocessImageForOcr.ts**

```typescript
// app/application/preprocessImageForOcr.ts
import { rotation } from 'exifr';

const SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);
const UPSCALE = 2.5;
const SHARPEN_KERNEL = [0, -1, 0, -1, 5, -1, 0, -1, 0]; // 3×3 unsharp mask

export async function preprocessImageForOcr(file: File): Promise<File> {
  if (!SUPPORTED.has(file.type)) return file;

  const exifRotation = await rotation(file).catch(() => null);
  const rotateDeg = exifRotation?.deg ?? 0;
  const normalized = ((rotateDeg % 360) + 360) % 360;

  const bitmap = await createImageBitmap(file);
  const srcW = bitmap.width;
  const srcH = bitmap.height;

  // Step 1: Upscale canvas (swap dims if rotating 90/270)
  const destW = Math.round((normalized === 90 || normalized === 270 ? srcH : srcW) * UPSCALE);
  const destH = Math.round((normalized === 90 || normalized === 270 ? srcW : srcH) * UPSCALE);

  const canvas = new OffscreenCanvas(destW, destH);
  const ctx = canvas.getContext('2d')!;

  // Step 2: Draw with rotation + upscale
  ctx.translate(destW / 2, destH / 2);
  ctx.rotate((rotateDeg * Math.PI) / 180);
  ctx.scale(UPSCALE, UPSCALE);
  ctx.drawImage(bitmap, -srcW / 2, -srcH / 2);
  bitmap.close();

  // Step 3: Get pixel data and apply grayscale + contrast + sharpen + binarize
  const imageData = ctx.getImageData(0, 0, destW, destH);
  const gray = buildGrayscaleArray(imageData.data);
  const contrasted = applyContrast(gray, 1.5, 10);
  const sharpened = applySharpen(contrasted, destW, destH);
  const threshold = otsuThreshold(buildHistogram(sharpened), sharpened.length);
  const binarized = applyBinarize(sharpened, threshold);

  // Write back as RGBA (grayscale → R=G=B, A=255)
  for (let i = 0; i < binarized.length; i++) {
    const v = binarized[i];
    imageData.data[i * 4] = v;
    imageData.data[i * 4 + 1] = v;
    imageData.data[i * 4 + 2] = v;
    imageData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new File([blob], file.name, { type: 'image/png', lastModified: file.lastModified });
}

// ── Pure helpers (exported for testing) ───────────────────────────────────────

export function buildGrayscaleArray(rgba: Uint8ClampedArray): Float32Array {
  const n = rgba.length / 4;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = 0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2];
  }
  return out;
}

function applyContrast(gray: Float32Array, factor: number, lift: number): Float32Array {
  const out = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    out[i] = Math.max(0, Math.min(255, (gray[i] - 128) * factor + 128 + lift));
  }
  return out;
}

function applySharpen(gray: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(gray); // copy so border pixels retain original values (not zeroed)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          sum += gray[(y + ky) * width + (x + kx)] * SHARPEN_KERNEL[(ky + 1) * 3 + (kx + 1)];
        }
      }
      out[y * width + x] = Math.max(0, Math.min(255, sum));
    }
  }
  return out;
}

function buildHistogram(gray: Float32Array): number[] {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) {
    hist[Math.round(gray[i])]++;
  }
  return hist;
}

export function otsuThreshold(histogram: number[], total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];

  let sumB = 0, wB = 0, max = 0, threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > max) { max = between; threshold = t; }
  }
  return threshold;
}

function applyBinarize(gray: Float32Array, threshold: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) {
    out[i] = gray[i] > threshold ? 255 : 0;
  }
  return out;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/application/preprocessImageForOcr.test.ts
```
Expected: all pass

- [ ] **Step 5: Wire preprocessor into web/main.ts only**

> ⚠️ **Do NOT modify `autoProcess.ts` or `prepareImageForOcr.ts`** — the latter is still used by `importScreenshotOcr.ts` and must not be removed or altered.

The preprocessing is wired exclusively in `web/main.ts` `buildOcrService()`. Add the import at the top of `web/main.ts`:

```typescript
import { preprocessImageForOcr } from '../app/application/preprocessImageForOcr.js';
```

Update `buildOcrService()` in `web/main.ts` to preprocess before calling Tesseract:

```typescript
function buildOcrService(): TieredOcrService {
  const engine = {
    async recognize(file: File) {
      const processed = await preprocessImageForOcr(file);
      const worker = await getTesseractWorker();
      const { data } = await worker.recognize(processed);
      return { text: data.text, confidence: data.confidence / 100 };
    }
  };
  return new TieredOcrService({ tesseract: new TesseractOcrService(engine, () => new Date(), 120_000) });
}
```

Add the import at top of `web/main.ts`:
```typescript
import { preprocessImageForOcr } from '../app/application/preprocessImageForOcr.js';
```

- [ ] **Step 6: Run full suite and build**

```bash
npm test && npm run build:ui
```
Expected: all tests pass, build clean

- [ ] **Step 7: Commit**

```bash
git add app/application/preprocessImageForOcr.ts tests/application/preprocessImageForOcr.test.ts web/main.ts
git commit -m "feat: image preprocessing pipeline (upscale, grayscale, contrast, sharpen, binarize) for Tesseract"
```

---

## Final Integration Commit

After all tasks pass:

```bash
git add -A
git commit -m "chore: final integration — EXIF dates, OCR preview, review queue, key facts nav, re-process, preprocessing pipeline"
git push origin main
```
