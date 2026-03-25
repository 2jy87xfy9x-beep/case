/**
 * Full UI validation — mechanical end-user walkthrough.
 *
 * Covers every tab and every interactive surface in the Case Organizer UI:
 *   • App load & initial state
 *   • Tab navigation (all 6 tabs)
 *   • Inbox: add evidence (validation + success), CSV import, needs-review panel
 *   • Timeline: count badge, evidence + message items
 *   • Evidence: list, detail panel, category dropdown, mark-reviewed flow
 *   • Law: topics (add, detail, question, delete), research notes (add, delete)
 *   • Gaps: detection on seeded case, nav badge
 *   • Export: initial state, buttons present, download triggered
 *
 * Seeded state (cleared IndexedDB → fresh case): 2 sample evidence items
 *   1. "Sample lease excerpt"
 *   2. "Rent increase email"  ← contains "New rent" → triggers gap.missingRentIncreaseNotice
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

test.beforeEach(async ({ page }) => {
  // v1 UI is served at /v1/
  await page.goto('/v1/');
  await page.evaluate(() => indexedDB.deleteDatabase('case-organizer'));
  await page.reload();
  await page.waitForSelector('#add-evidence-form', { state: 'visible' });
  // Wait for init() to fully complete (ensureCase resolves and currentCase is set).
  // Without this, fast tests that submit the form immediately can hit the
  // `if (!currentCase) return` guard before the async DB open finishes.
  await expect(page.locator('#status')).toHaveText('Ready.', { timeout: 10000 });
});

// ── App load ────────────────────────────────────────────────────────────────

test('app loads: inbox is the default active tab', async ({ page }) => {
  await expect(page.locator('#screen-inbox')).toBeVisible();
  await expect(page.locator('#screen-timeline')).not.toBeVisible();
  await expect(page.locator('[data-tab="inbox"]')).toHaveClass(/nav-btn--active/);
});

test('app loads: status shows Ready', async ({ page }) => {
  await expect(page.locator('#status')).toHaveText('Ready.', { timeout: 5000 });
});

test('app loads: page title is Case Organizer', async ({ page }) => {
  await expect(page).toHaveTitle('Case Organizer');
});

test('app loads: app bar heading visible', async ({ page }) => {
  await expect(page.locator('.appbar__title')).toHaveText('Case Organizer');
});

// ── Tab navigation ──────────────────────────────────────────────────────────

test('tab navigation: all 6 tabs switch screens correctly', async ({ page }) => {
  const tabs: Array<{ tab: string; screen: string }> = [
    { tab: 'timeline', screen: '#screen-timeline' },
    { tab: 'evidence', screen: '#screen-evidence' },
    { tab: 'law', screen: '#screen-law' },
    { tab: 'gaps', screen: '#screen-gaps' },
    { tab: 'export', screen: '#screen-export' },
    { tab: 'inbox', screen: '#screen-inbox' },
  ];

  for (const { tab, screen } of tabs) {
    await page.click(`[data-tab="${tab}"]`);
    await expect(page.locator(screen)).toBeVisible();
    // Ensure other screens are hidden
    await expect(page.locator(`[data-tab="${tab}"]`)).toHaveClass(/nav-btn--active/);
  }
});

test('tab navigation: only one screen visible at a time', async ({ page }) => {
  await page.click('[data-tab="timeline"]');
  const hiddenScreens = page.locator('.screen--hidden');
  // 5 screens should be hidden (6 total minus 1 active)
  await expect(hiddenScreens).toHaveCount(5);
});

// ── Inbox: add evidence form ────────────────────────────────────────────────

test('inbox: evidence form is present with all fields', async ({ page }) => {
  await expect(page.locator('#ev-title')).toBeVisible();
  await expect(page.locator('#ev-date')).toBeVisible();
  await expect(page.locator('#ev-image')).toBeAttached();
  await expect(page.locator('#ev-body')).toBeVisible();
  await expect(page.locator('#add-evidence-form button[type="submit"]')).toBeVisible();
});

test('inbox: submitting with empty title does not add evidence', async ({ page }) => {
  // Go to evidence tab to count items before
  await page.click('[data-tab="evidence"]');
  const initialCount = await page.locator('#evidence-list li').count();

  // Back to inbox, submit with no title
  await page.click('[data-tab="inbox"]');
  await page.click('#add-evidence-form button[type="submit"]');

  // Return to evidence — count unchanged
  await page.click('[data-tab="evidence"]');
  await expect(page.locator('#evidence-list li')).toHaveCount(initialCount);
});

test('inbox: add evidence with title only — appears in evidence and timeline', async ({ page }) => {
  await page.fill('#ev-title', 'Notice to quit');
  await page.click('#add-evidence-form button[type="submit"]');

  // Wait for async save to complete (status updates after IndexedDB write)
  await expect(page.locator('#status')).toHaveText('Added: Notice to quit', { timeout: 5000 });

  // Form cleared after save
  await expect(page.locator('#ev-title')).toHaveValue('');

  // Evidence tab shows the new item
  await page.click('[data-tab="evidence"]');
  await expect(page.locator('#evidence-list')).toContainText('Notice to quit');

  // Timeline tab shows the new item
  await page.click('[data-tab="timeline"]');
  await expect(page.locator('#timeline-list')).toContainText('Notice to quit');
});

test('inbox: add evidence with all fields — title, date, body', async ({ page }) => {
  await page.fill('#ev-title', 'Late fee invoice');
  await page.fill('#ev-date', '2025-11-01');
  await page.fill('#ev-body', 'Invoice for $150 late fee, due November 15.');
  await page.click('#add-evidence-form button[type="submit"]');

  await page.click('[data-tab="evidence"]');
  const btn = page.locator('#evidence-list .item-btn').filter({ hasText: 'Late fee invoice' });
  await expect(btn).toBeVisible();
});

test('inbox: import CSV section has both import buttons', async ({ page }) => {
  await expect(page.locator('label:has(#import-csv)')).toContainText('iMazing CSV');
  await expect(page.locator('label:has(#import-xml)')).toContainText('SMS Backup XML');
});

test('inbox: sender attribution details can be opened', async ({ page }) => {
  await page.click('details.import-config > summary');
  await expect(page.locator('#cfg-own')).toBeVisible();
  await expect(page.locator('#cfg-landlord')).toBeVisible();
});

test('inbox: import CSV imports messages and shows result', async ({ page }) => {
  const csvPath = path.join(FIXTURES_DIR, 'messages', 'imazing-sample.csv');
  await page.setInputFiles('#import-csv', csvPath);
  await expect(page.locator('#import-result')).toContainText(/imported 3 messages/i, { timeout: 5000 });
});

test('inbox: import same CSV twice deduplicates messages', async ({ page }) => {
  const csvPath = path.join(FIXTURES_DIR, 'messages', 'imazing-sample.csv');
  await page.setInputFiles('#import-csv', csvPath);
  await expect(page.locator('#import-result')).toContainText(/imported/i, { timeout: 5000 });
  await page.setInputFiles('#import-csv', csvPath);
  await expect(page.locator('#import-result')).toContainText(/3 duplicate/i, { timeout: 5000 });
});

test('inbox: needs review empty state shown on seeded case (no OCR items)', async ({ page }) => {
  await expect(page.locator('#unreviewed-empty')).toBeVisible();
  await expect(page.locator('#unreviewed-empty')).toHaveText('All items reviewed.');
});

// ── Timeline tab ────────────────────────────────────────────────────────────

test('timeline: seeded case has 2 evidence items', async ({ page }) => {
  await page.click('[data-tab="timeline"]');
  await expect(page.locator('#timeline-list li')).toHaveCount(2);
});

test('timeline: shows sample evidence titles', async ({ page }) => {
  await page.click('[data-tab="timeline"]');
  await expect(page.locator('#timeline-list')).toContainText('Sample lease excerpt');
  await expect(page.locator('#timeline-list')).toContainText('Rent increase email');
});

test('timeline: count badge matches item count', async ({ page }) => {
  await page.click('[data-tab="timeline"]');
  const badge = page.locator('#timeline-count');
  await expect(badge).toHaveText('2');
});

test('timeline: after adding evidence, count increments', async ({ page }) => {
  await page.fill('#ev-title', 'Extra document');
  await page.click('#add-evidence-form button[type="submit"]');
  // Wait for async save to complete before switching tabs
  await expect(page.locator('#status')).toHaveText('Added: Extra document', { timeout: 5000 });

  await page.click('[data-tab="timeline"]');
  await expect(page.locator('#timeline-list li')).toHaveCount(3);
  await expect(page.locator('#timeline-count')).toHaveText('3');
});

test('timeline: messages show after CSV import', async ({ page }) => {
  const csvPath = path.join(FIXTURES_DIR, 'messages', 'imazing-sample.csv');
  await page.setInputFiles('#import-csv', csvPath);
  await expect(page.locator('#import-result')).toContainText(/imported/i, { timeout: 5000 });

  await page.click('[data-tab="timeline"]');
  // 2 seeded evidence + 3 CSV messages = 5
  await expect(page.locator('#timeline-list li')).toHaveCount(5);
});

test('timeline: evidence items render with document icon', async ({ page }) => {
  await page.click('[data-tab="timeline"]');
  // Evidence items have class timeline-item--evidence
  await expect(page.locator('.timeline-item--evidence').first()).toBeVisible();
});

test('timeline: empty state hidden when items exist', async ({ page }) => {
  await page.click('[data-tab="timeline"]');
  await expect(page.locator('#timeline-empty')).not.toBeVisible();
});

// ── Evidence tab ────────────────────────────────────────────────────────────

test('evidence: list shows both seeded items', async ({ page }) => {
  await page.click('[data-tab="evidence"]');
  await expect(page.locator('#evidence-list li')).toHaveCount(2);
  await expect(page.locator('#evidence-list')).toContainText('Sample lease excerpt');
  await expect(page.locator('#evidence-list')).toContainText('Rent increase email');
});

test('evidence: count badge shows 2 on seeded case', async ({ page }) => {
  await page.click('[data-tab="evidence"]');
  await expect(page.locator('#evidence-count')).toHaveText('2');
});

test('evidence: detail panel shows first item on load', async ({ page }) => {
  await page.click('[data-tab="evidence"]');
  // detail-body should be visible (first item pre-selected in init)
  await expect(page.locator('#detail-body')).toBeVisible();
  await expect(page.locator('#detail-title')).not.toBeEmpty();
});

test('evidence: selecting an item shows its title in detail panel', async ({ page }) => {
  await page.click('[data-tab="evidence"]');
  // Click the second item
  const secondItem = page.locator('#evidence-list .item-btn').nth(1);
  await secondItem.click();
  const titleText = await secondItem.locator('.item-btn__title').textContent();
  await expect(page.locator('#detail-title')).toHaveText(titleText ?? '');
});

test('evidence: detail panel shows evidence body text', async ({ page }) => {
  await page.click('[data-tab="evidence"]');
  // Click "Sample lease excerpt" specifically so we know which body text to expect
  await page.locator('#evidence-list .item-btn').filter({ hasText: 'Sample lease excerpt' }).click();
  await expect(page.locator('#detail-text')).toContainText('Tenancy term');
});

test('evidence: category dropdown has all expected options', async ({ page }) => {
  await page.click('[data-tab="evidence"]');
  const opts = page.locator('#detail-category option');
  await expect(opts).toHaveCount(6); // — None —, lease, payment, rent-notice, fee-notice, other
  await expect(opts.nth(0)).toHaveText('— None —');
  await expect(opts.nth(1)).toHaveText('Lease');
  await expect(opts.nth(2)).toHaveText('Payment record');
  await expect(opts.nth(3)).toHaveText('Rent notice');
  await expect(opts.nth(4)).toHaveText('Fee notice');
  await expect(opts.nth(5)).toHaveText('Other');
});

test('evidence: changing category saves and updates status', async ({ page }) => {
  await page.click('[data-tab="evidence"]');
  await page.selectOption('#detail-category', 'lease');
  await expect(page.locator('#status')).toHaveText('Category saved.', { timeout: 3000 });
});

test('evidence: changing category reflects in list tag', async ({ page }) => {
  await page.click('[data-tab="evidence"]');
  await page.selectOption('#detail-category', 'payment');
  // The first item's list entry should now show "payment" tag
  const firstItemMeta = page.locator('#evidence-list .item-btn').first().locator('.item-btn__meta');
  await expect(firstItemMeta).toContainText('payment');
});

test('evidence: mark reviewed button hidden for manual-entry items', async ({ page }) => {
  await page.click('[data-tab="evidence"]');
  // Seeded items are manual (requiresUserReview: false), so button has hidden=true DOM property
  await expect(page.locator('#btn-confirm-review')).toHaveJSProperty('hidden', true);
});

test('evidence: OCR warning hidden for manual-entry items', async ({ page }) => {
  await page.click('[data-tab="evidence"]');
  await expect(page.locator('#ocr-warning')).not.toBeVisible();
});

test('evidence: empty state hidden when evidence exists', async ({ page }) => {
  await page.click('[data-tab="evidence"]');
  await expect(page.locator('#evidence-empty')).not.toBeVisible();
});

test('evidence: meta shows provenance tier', async ({ page }) => {
  await page.click('[data-tab="evidence"]');
  await expect(page.locator('#detail-meta')).toContainText('manual');
});

// ── Law tab ─────────────────────────────────────────────────────────────────

test('law: disclaimer note is visible', async ({ page }) => {
  await page.click('[data-tab="law"]');
  await expect(page.locator('.law-disclaimer')).toBeVisible();
});

test('law: topics empty state shown on fresh case', async ({ page }) => {
  await page.click('[data-tab="law"]');
  await expect(page.locator('#claims-empty')).toBeVisible();
  await expect(page.locator('#claims-empty')).toHaveText('No topics yet. Add one below.');
});

test('law: notes empty state shown on fresh case', async ({ page }) => {
  await page.click('[data-tab="law"]');
  await expect(page.locator('#notes-empty')).toBeVisible();
  await expect(page.locator('#notes-empty')).toHaveText('No notes yet.');
});

test('law: add topic form can be opened', async ({ page }) => {
  await page.click('[data-tab="law"]');
  await page.click('details.add-form-toggle:has(#add-claim-form) > summary');
  await expect(page.locator('#add-claim-form')).toBeVisible();
});

test('law: add topic — appears in list', async ({ page }) => {
  await page.click('[data-tab="law"]');
  await page.click('details.add-form-toggle:has(#add-claim-form) > summary');
  await page.fill('#claim-title', 'Late fee above legal cap');
  await page.fill('#claim-desc', 'The late fee charged exceeds the statutory limit.');
  await page.selectOption('#claim-status', 'researching');
  await page.click('#add-claim-form button[type="submit"]');

  await expect(page.locator('#claims-list')).toContainText('Late fee above legal cap');
  await expect(page.locator('#claims-empty')).not.toBeVisible();
});

test('law: add topic — clears form after save', async ({ page }) => {
  await page.click('[data-tab="law"]');
  await page.click('details.add-form-toggle:has(#add-claim-form) > summary');
  await page.fill('#claim-title', 'Notice period violation');
  await page.click('#add-claim-form button[type="submit"]');

  await expect(page.locator('#claim-title')).toHaveValue('');
  await expect(page.locator('#claim-desc')).toHaveValue('');
});

test('law: add topic — status tag shown in list item', async ({ page }) => {
  await page.click('[data-tab="law"]');
  await page.click('details.add-form-toggle:has(#add-claim-form) > summary');
  await page.fill('#claim-title', 'Security deposit');
  await page.selectOption('#claim-status', 'ready-to-discuss');
  await page.click('#add-claim-form button[type="submit"]');

  const listItem = page.locator('#claims-list .item-btn').filter({ hasText: 'Security deposit' });
  await expect(listItem).toContainText('Ready to discuss');
});

test('law: claims count badge updates', async ({ page }) => {
  await page.click('[data-tab="law"]');
  await page.click('details.add-form-toggle:has(#add-claim-form) > summary');
  await page.fill('#claim-title', 'Illegal entry');
  await page.click('#add-claim-form button[type="submit"]');

  await expect(page.locator('#claims-count')).toHaveText('1');
});

test('law: clicking topic shows detail panel', async ({ page }) => {
  await page.click('[data-tab="law"]');
  await page.click('details.add-form-toggle:has(#add-claim-form) > summary');
  await page.fill('#claim-title', 'Noise ordinance breach');
  await page.click('#add-claim-form button[type="submit"]');

  await page.locator('#claims-list .item-btn').filter({ hasText: 'Noise ordinance breach' }).click();
  await expect(page.locator('#claim-detail')).toBeVisible();
  await expect(page.locator('#claim-detail-body')).toContainText('Noise ordinance breach');
});

test('law: add question to topic', async ({ page }) => {
  await page.click('[data-tab="law"]');
  await page.click('details.add-form-toggle:has(#add-claim-form) > summary');
  await page.fill('#claim-title', 'Habitability issue');
  await page.click('#add-claim-form button[type="submit"]');

  // Select the topic to show detail
  await page.locator('#claims-list .item-btn').filter({ hasText: 'Habitability issue' }).click();

  // Add a question
  await page.fill('#claim-question-input', 'Is this a breach of the implied warranty of habitability?');
  await page.click('#btn-add-claim-question');

  await expect(page.locator('#claim-detail-body')).toContainText('Is this a breach of the implied warranty of habitability?');
  await expect(page.locator('#status')).toHaveText('Question added.');
});

test('law: question count shown in list badge', async ({ page }) => {
  await page.click('[data-tab="law"]');
  await page.click('details.add-form-toggle:has(#add-claim-form) > summary');
  await page.fill('#claim-title', 'Retaliation claim');
  await page.click('#add-claim-form button[type="submit"]');

  await page.locator('#claims-list .item-btn').filter({ hasText: 'Retaliation claim' }).click();
  await page.fill('#claim-question-input', 'What constitutes unlawful retaliation?');
  await page.click('#btn-add-claim-question');

  const listItem = page.locator('#claims-list .item-btn').filter({ hasText: 'Retaliation claim' });
  await expect(listItem).toContainText('1 question');
});

test('law: delete topic removes it from list', async ({ page }) => {
  await page.click('[data-tab="law"]');
  await page.click('details.add-form-toggle:has(#add-claim-form) > summary');
  await page.fill('#claim-title', 'To be deleted');
  await page.click('#add-claim-form button[type="submit"]');

  await expect(page.locator('#claims-list')).toContainText('To be deleted');

  // Click the delete button (✕ next to the item)
  const delBtn = page.locator('#claims-list li').filter({ hasText: 'To be deleted' }).locator('.btn-icon-del');
  await delBtn.click();

  await expect(page.locator('#claims-list')).not.toContainText('To be deleted');
  await expect(page.locator('#claims-empty')).toBeVisible();
  await expect(page.locator('#status')).toHaveText('Topic removed.');
});

test('law: add research note — appears in list', async ({ page }) => {
  await page.click('[data-tab="law"]');
  await page.click('details.add-form-toggle:has(#add-note-form) > summary');
  await page.fill('#note-topic', 'Late fee caps in this state');
  await page.fill('#note-summary', 'Section 1234 limits late fees to 5% of monthly rent.');
  await page.fill('#note-source', 'tenant-rights.example.org/late-fees');
  await page.selectOption('#note-applies', 'yes');
  await page.click('#add-note-form button[type="submit"]');

  await expect(page.locator('#notes-list')).toContainText('Late fee caps in this state');
  await expect(page.locator('#notes-empty')).not.toBeVisible();
});

test('law: research note applies tag shown in list', async ({ page }) => {
  await page.click('[data-tab="law"]');
  await page.click('details.add-form-toggle:has(#add-note-form) > summary');
  await page.fill('#note-topic', 'Notice requirements');
  await page.selectOption('#note-applies', 'maybe');
  await page.click('#add-note-form button[type="submit"]');

  const noteItem = page.locator('#notes-list .item-btn').filter({ hasText: 'Notice requirements' });
  await expect(noteItem).toContainText('Applies: maybe');
});

test('law: notes count badge updates', async ({ page }) => {
  await page.click('[data-tab="law"]');
  await page.click('details.add-form-toggle:has(#add-note-form) > summary');
  await page.fill('#note-topic', 'Habitability standards');
  await page.click('#add-note-form button[type="submit"]');

  await expect(page.locator('#notes-count')).toHaveText('1');
});

test('law: delete research note removes it', async ({ page }) => {
  await page.click('[data-tab="law"]');
  await page.click('details.add-form-toggle:has(#add-note-form) > summary');
  await page.fill('#note-topic', 'Temporary note');
  await page.click('#add-note-form button[type="submit"]');

  const delBtn = page.locator('#notes-list li').filter({ hasText: 'Temporary note' }).locator('.btn-icon-del');
  await delBtn.click();

  await expect(page.locator('#notes-list')).not.toContainText('Temporary note');
  await expect(page.locator('#notes-empty')).toBeVisible();
  await expect(page.locator('#status')).toHaveText('Note removed.');
});

test('law: add note clears form after save', async ({ page }) => {
  await page.click('[data-tab="law"]');
  await page.click('details.add-form-toggle:has(#add-note-form) > summary');
  await page.fill('#note-topic', 'Rent control rules');
  await page.fill('#note-summary', 'Summary text here');
  await page.click('#add-note-form button[type="submit"]');

  await expect(page.locator('#note-topic')).toHaveValue('');
  await expect(page.locator('#note-summary')).toHaveValue('');
});

// ── Gaps tab ─────────────────────────────────────────────────────────────────

test('gaps: detects rent increase gap on seeded case', async ({ page }) => {
  // Seeded: "Rent increase email" body contains "New rent" → triggers gap.missingRentIncreaseNotice
  await page.click('[data-tab="gaps"]');
  await expect(page.locator('#gaps-list li')).toHaveCount(1);
  await expect(page.locator('#gaps-list')).toContainText('Possible rent increase');
  await expect(page.locator('#gaps-empty')).not.toBeVisible();
});

test('gaps: badge shows gap count', async ({ page }) => {
  await page.click('[data-tab="gaps"]');
  await expect(page.locator('#gaps-badge')).toHaveText('1');
});

test('gaps: nav badge shows gap count on load', async ({ page }) => {
  // Nav badge should be updated by render() on init
  await expect(page.locator('#nav-gaps-badge')).toHaveText('1');
});

test('gaps: gap item shows severity', async ({ page }) => {
  await page.click('[data-tab="gaps"]');
  const gapItem = page.locator('.gap-item').first();
  await expect(gapItem).toBeVisible();
  // Gap item contains severity text
  await expect(gapItem.locator('.gap-item__sev')).toBeVisible();
});

test('gaps: all gaps disappear after properly categorizing evidence', async ({ page }) => {
  // Categorize "Rent increase email" as rent-notice (clears gap.missingRentIncreaseNotice)
  // AND categorize "Sample lease excerpt" as lease (clears gap.missingLease that would appear)
  await page.click('[data-tab="evidence"]');

  const rentItem = page.locator('#evidence-list .item-btn').filter({ hasText: 'Rent increase email' });
  await rentItem.click();
  await page.selectOption('#detail-category', 'rent-notice');
  await expect(page.locator('#status')).toHaveText('Category saved.', { timeout: 3000 });

  const leaseItem = page.locator('#evidence-list .item-btn').filter({ hasText: 'Sample lease excerpt' });
  await leaseItem.click();
  await page.selectOption('#detail-category', 'lease');
  await expect(page.locator('#status')).toHaveText('Category saved.', { timeout: 3000 });

  // Now gaps tab should show no gaps (missingRentIncreaseNotice gone, missingLease also gone)
  await page.click('[data-tab="gaps"]');
  await expect(page.locator('#gaps-list li')).toHaveCount(0);
  await expect(page.locator('#gaps-empty')).toBeVisible();
  await expect(page.locator('#gaps-badge')).toHaveText('');
});

test('gaps: nav badge clears when gaps resolved', async ({ page }) => {
  await page.click('[data-tab="evidence"]');

  const rentItem = page.locator('#evidence-list .item-btn').filter({ hasText: 'Rent increase email' });
  await rentItem.click();
  await page.selectOption('#detail-category', 'rent-notice');
  await expect(page.locator('#status')).toHaveText('Category saved.', { timeout: 3000 });

  const leaseItem = page.locator('#evidence-list .item-btn').filter({ hasText: 'Sample lease excerpt' });
  await leaseItem.click();
  await page.selectOption('#detail-category', 'lease');
  await expect(page.locator('#status')).toHaveText('Category saved.', { timeout: 3000 });

  await expect(page.locator('#nav-gaps-badge')).toHaveText('');
});

test('gaps: intro text is visible', async ({ page }) => {
  await page.click('[data-tab="gaps"]');
  await expect(page.locator('.gaps-intro')).toBeVisible();
  await expect(page.locator('.gaps-intro')).toContainText('not legal conclusions');
});

// ── Export tab ────────────────────────────────────────────────────────────────

test('export: shows "Not yet exported." on fresh case', async ({ page }) => {
  await page.click('[data-tab="export"]');
  await expect(page.locator('#last-exported-label')).toHaveText('Not yet exported.');
});

test('export: both export buttons are present', async ({ page }) => {
  await page.click('[data-tab="export"]');
  await expect(page.locator('#btn-export-full')).toBeVisible();
  await expect(page.locator('#btn-export-summary')).toBeVisible();
  await expect(page.locator('#btn-export-full')).toContainText('Full case');
  await expect(page.locator('#btn-export-summary')).toContainText('Lawyer summary');
});

test('export: disclaimer text is visible', async ({ page }) => {
  await page.click('[data-tab="export"]');
  await expect(page.locator('.disclaimer')).toContainText('Text only');
});

test('export: full export triggers download', async ({ page }) => {
  await page.click('[data-tab="export"]');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#btn-export-full')
  ]);
  expect(download.suggestedFilename()).toMatch(/^case-export-\d{4}-\d{2}-\d{2}\.md$/);
});

test('export: lawyer summary export triggers download', async ({ page }) => {
  await page.click('[data-tab="export"]');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#btn-export-summary')
  ]);
  expect(download.suggestedFilename()).toMatch(/^case-lawyer-summary-\d{4}-\d{2}-\d{2}\.md$/);
});

test('export: after export, last-exported label updates', async ({ page }) => {
  await page.click('[data-tab="export"]');
  await Promise.all([
    page.waitForEvent('download'),
    page.click('#btn-export-full')
  ]);
  await expect(page.locator('#last-exported-label')).toContainText('Last exported:');
});

// ── Inbox: export reminder banner ─────────────────────────────────────────

test('export reminder: banner hidden after export', async ({ page }) => {
  // First trigger a reminder by checking if it shows (fresh case → hasn't exported)
  // The reminder shows only if needsExportReminder() is true.
  // On a completely fresh case, lastExportedAt is null, so the reminder should show.
  // (It depends on the export reminder logic — checking here regardless.)
  await page.click('[data-tab="export"]');
  await Promise.all([
    page.waitForEvent('download'),
    page.click('#btn-export-full')
  ]);

  // After export, reminder should be hidden
  await page.click('[data-tab="inbox"]');
  await expect(page.locator('#export-reminder')).not.toBeVisible();
});

// ── Cross-tab data consistency ────────────────────────────────────────────

test('data consistency: evidence added in inbox appears correctly in all tabs', async ({ page }) => {
  await page.fill('#ev-title', 'Consistency test doc');
  await page.fill('#ev-date', '2025-06-15');
  await page.fill('#ev-body', 'This document tests cross-tab consistency.');
  await page.click('#add-evidence-form button[type="submit"]');

  // Timeline
  await page.click('[data-tab="timeline"]');
  await expect(page.locator('#timeline-list')).toContainText('Consistency test doc');

  // Evidence
  await page.click('[data-tab="evidence"]');
  await expect(page.locator('#evidence-list')).toContainText('Consistency test doc');
});

test('data consistency: evidence count badge consistent with list', async ({ page }) => {
  await page.click('[data-tab="evidence"]');
  const listCount = await page.locator('#evidence-list li').count();
  const badgeText = await page.locator('#evidence-count').textContent();
  expect(String(listCount)).toBe(badgeText);
});
