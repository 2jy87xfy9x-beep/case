/**
 * Phase 9 — Playwright E2E happy path.
 *
 * Covers the minimal end-to-end flow for the single-case PWA:
 *   1. App loads and inbox is visible
 *   2. User adds an evidence item via the manual form
 *   3. User imports text messages via an iMazing CSV file
 *   4. Timeline tab shows the evidence item and imported messages
 *
 * Fixtures: tests/fixtures/images/ and tests/fixtures/messages/imazing-sample.csv
 *
 * Notes:
 *  - The app uses a fixed local case (CASE_ID = 'mvp-local-case') — no "create case" step.
 *  - IndexedDB is reset between test runs by clearing the origin storage in beforeEach.
 *  - On a fresh case, ensureCase() seeds 2 sample evidence items. Counts include these.
 *  - The CSV fixture contains 3 valid rows across 2 threads (1 row has a missing date and
 *    is skipped by the parser), so 3 messages are expected in the timeline.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

test.beforeEach(async ({ page }) => {
  // Clear IndexedDB so each test starts from an empty case.
  // v1 UI is served at /v1/
  await page.goto('/v1/');
  await page.evaluate(() => indexedDB.deleteDatabase('case-organizer'));
  await page.reload();
  // Wait for the app to initialise (status text clears once the case is ready).
  await page.waitForSelector('#add-evidence-form', { state: 'visible' });
});

test('adds evidence via form and evidence appears in timeline', async ({ page }) => {
  // ── Step 1: fill in the Add Evidence form ────────────────────────────────
  await page.fill('#ev-title', 'Rent increase letter Jan 2026');
  await page.fill('#ev-date', '2026-01-15');
  await page.fill('#ev-body', 'Your rent will increase by $200 effective March 1 2026.');

  await page.click('button[type="submit"]');

  // ── Step 2: switch to Timeline tab ───────────────────────────────────────
  await page.click('[data-tab="timeline"]');
  await page.waitForSelector('#screen-timeline:not(.screen--hidden)', { state: 'visible' });

  // ── Step 3: verify evidence in timeline ──────────────────────────────────
  // 1 new item + 2 seeded sample items = 3 total; new item sorts first (Jan 2026).
  const timelineItems = page.locator('#timeline-list li');
  await expect(timelineItems).toHaveCount(3);
  await expect(timelineItems.first()).toContainText('Rent increase letter Jan 2026');
});

test('imports iMazing CSV and messages appear in timeline', async ({ page }) => {
  // ── Step 1: configure sender attribution ─────────────────────────────────
  // Open the attribution disclosure so the inputs are active.
  await page.click('details.import-config > summary');
  await page.fill('#cfg-own', 'Me');
  await page.fill('#cfg-landlord', '+15551230000');

  // ── Step 2: upload the CSV ───────────────────────────────────────────────
  const csvPath = path.join(FIXTURES_DIR, 'messages', 'imazing-sample.csv');
  await page.setInputFiles('#import-csv', csvPath);

  // Wait for the import result status to confirm success.
  await expect(page.locator('#import-result')).toContainText(/imported/i, { timeout: 5000 });

  // ── Step 3: switch to Timeline tab ───────────────────────────────────────
  await page.click('[data-tab="timeline"]');
  await page.waitForSelector('#screen-timeline:not(.screen--hidden)', { state: 'visible' });

  // ── Step 4: verify messages in timeline ──────────────────────────────────
  // 3 CSV messages + 2 seeded sample evidence items = 5 total.
  const timelineItems = page.locator('#timeline-list li');
  await expect(timelineItems).toHaveCount(5);
});

test('full happy path: add evidence + import CSV, both visible in timeline', async ({ page }) => {
  // ── Add evidence ─────────────────────────────────────────────────────────
  await page.fill('#ev-title', 'Signed lease 2025');
  await page.fill('#ev-date', '2025-03-01');
  await page.fill('#ev-body', 'Lease signed for 12 months beginning April 1 2025.');
  await page.click('button[type="submit"]');

  // ── Import CSV ───────────────────────────────────────────────────────────
  const csvPath = path.join(FIXTURES_DIR, 'messages', 'imazing-sample.csv');
  await page.setInputFiles('#import-csv', csvPath);
  await expect(page.locator('#import-result')).toContainText(/imported/i, { timeout: 5000 });

  // ── Timeline shows all items ──────────────────────────────────────────────
  await page.click('[data-tab="timeline"]');
  await page.waitForSelector('#screen-timeline:not(.screen--hidden)', { state: 'visible' });

  // 1 new evidence + 3 CSV messages + 2 seeded sample evidence = 6 total.
  const timelineItems = page.locator('#timeline-list li');
  await expect(timelineItems).toHaveCount(6);

  // Evidence title must appear.
  await expect(page.locator('#timeline-list')).toContainText('Signed lease 2025');

  // At least one message body must appear.
  await expect(page.locator('#timeline-list')).toContainText('Please pay by Friday');
});
