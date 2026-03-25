/**
 * Phase 15 — Playwright E2E tests for the v2 UI.
 *
 * Covers the five screens of the v2 Case Organizer:
 *   - Home / Canvas (case list, intake toggle, intake options)
 *   - Case Brief (sections, consult mode)
 *   - Consultation overlay (slides, navigation, ESC)
 *   - Library screen
 *   - Settings screen
 *
 * The v2 UI is served at / (root).
 */
import { expect, Page, test } from '@playwright/test';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Navigate to the v2 app and clear all stored state so each test
 * starts from a blank slate.
 */
async function freshV2(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => {
    indexedDB.deleteDatabase('case-organizer');
    localStorage.clear();
  });
  await page.reload();
  // Wait for the home screen to become active (JS sets class="screen active")
  await page.waitForSelector('#screen-home.active', { state: 'visible', timeout: 10_000 });
}

test.beforeEach(async ({ page }) => {
  await freshV2(page);
});

// ── Home / Canvas tests ──────────────────────────────────────────────────────

test('v2: fresh app shows home screen and intake toggle', async ({ page }) => {
  await expect(page.locator('#screen-home')).toBeVisible();
  await expect(page.locator('#intake-toggle')).toBeVisible();
});

test('v2: intake toggle expands intake panel with options', async ({ page }) => {
  // Panel starts closed (no "open" class)
  await expect(page.locator('#intake-panel')).not.toHaveClass(/\bopen\b/);

  await page.click('#intake-toggle');

  // Panel should now have class "open"
  await expect(page.locator('#intake-panel')).toHaveClass(/\bopen\b/);

  // Multiple intake options visible
  const options = page.locator('.intake-option');
  await expect(options).toHaveCount(6);
});

test('v2: Sync Folder intake option is disabled', async ({ page }) => {
  await page.click('#intake-toggle');
  await expect(page.locator('#intake-panel')).toHaveClass(/\bopen\b/);

  // The Sync Folder button has the --disabled modifier class
  const syncBtn = page.locator('.intake-option--disabled');
  await expect(syncBtn).toBeVisible();
  await expect(syncBtn).toContainText('Sync Folder');
});

// ── Case Brief tests ─────────────────────────────────────────────────────────

/**
 * Open the intake panel and upload a small synthetic text file.
 * autoProcess() creates a new case and navigates to screen-brief.
 */
async function uploadFileAndOpenBrief(page: Page): Promise<void> {
  await page.click('#intake-toggle');
  await expect(page.locator('#intake-panel')).toHaveClass(/\bopen\b/);

  // Set a file on the hidden file input directly
  const fileContent = Buffer.from('Sample evidence text for test case.', 'utf-8');
  await page.locator('#intake-upload-files').setInputFiles({
    name: 'test-evidence.txt',
    mimeType: 'text/plain',
    buffer: fileContent,
  });

  // Wait for navigation to the brief screen
  await page.waitForSelector('#screen-brief.active', { state: 'visible', timeout: 15_000 });
}

test('v2: uploading a file navigates to screen-brief', async ({ page }) => {
  await uploadFileAndOpenBrief(page);
  await expect(page.locator('#screen-brief')).toBeVisible();
  await expect(page.locator('#screen-home')).not.toHaveClass(/\bactive\b/);
});

test('v2: case brief has required sections', async ({ page }) => {
  await uploadFileAndOpenBrief(page);

  // Verify the key section headers are present in the brief
  const briefHeaders = page.locator('.brief-section__header span:first-child');
  const allText = await briefHeaders.allTextContents();

  expect(allText.some((t) => t.includes('Case Summary'))).toBe(true);
  expect(allText.some((t) => t.includes('Timeline'))).toBe(true);
  expect(allText.some((t) => t.includes('Gaps'))).toBe(true);
});

// ── Consultation Mode tests ──────────────────────────────────────────────────

test('v2: consult button opens overlay', async ({ page }) => {
  await uploadFileAndOpenBrief(page);

  // Overlay should not have "active" initially
  await expect(page.locator('#consult-overlay')).not.toHaveClass(/\bactive\b/);

  await page.click('#btn-open-consult');

  // Overlay should now be active
  await expect(page.locator('#consult-overlay')).toHaveClass(/\bactive\b/);
});

test('v2: consultation slides are navigable', async ({ page }) => {
  await uploadFileAndOpenBrief(page);
  await page.click('#btn-open-consult');
  await expect(page.locator('#consult-overlay')).toHaveClass(/\bactive\b/);

  // Verify we start on slide 1
  await expect(page.locator('#consult-slide-indicator')).toHaveText('1 / 6');

  // Click Next — the indicator advances (at least past slide 1)
  await page.click('#consult-next-btn');

  // Verify the slide advanced beyond 1
  const indicatorText = await page.locator('#consult-slide-indicator').textContent();
  expect(indicatorText).toMatch(/^[2-6] \/ 6$/);
});

test('v2: ESC key closes consultation overlay', async ({ page }) => {
  await uploadFileAndOpenBrief(page);
  await page.click('#btn-open-consult');
  await expect(page.locator('#consult-overlay')).toHaveClass(/\bactive\b/);

  // Press Escape
  await page.keyboard.press('Escape');

  // Overlay should no longer have "active"
  await expect(page.locator('#consult-overlay')).not.toHaveClass(/\bactive\b/);
});

// ── Library tests ────────────────────────────────────────────────────────────

test('v2: Library screen is accessible from dock', async ({ page }) => {
  await page.click('button[data-screen="library"]');
  await expect(page.locator('#screen-library')).toBeVisible();
  await expect(page.locator('#screen-home')).not.toHaveClass(/\bactive\b/);
});

test('v2: uploading a file to library adds it to unassigned group', async ({ page }) => {
  // Navigate to Library
  await page.click('button[data-screen="library"]');
  await expect(page.locator('#screen-library')).toBeVisible();

  // Upload a file to the library
  const fileContent = Buffer.from('Library document content.', 'utf-8');
  await page.locator('#lib-file-input').setInputFiles({
    name: 'my-library-doc.txt',
    mimeType: 'text/plain',
    buffer: fileContent,
  });

  // The Unassigned group should now contain the file
  // renderLibrary() places it in the group whose label is "Unassigned"
  const unassignedGroup = page.locator('.lib-group').filter({ hasText: 'Unassigned' });
  await expect(unassignedGroup).toBeVisible();
  await expect(unassignedGroup).toContainText('my-library-doc.txt');
});

// ── Settings tests ───────────────────────────────────────────────────────────

test('v2: Settings screen is accessible from dock', async ({ page }) => {
  await page.click('button[data-screen="settings"]');
  await expect(page.locator('#screen-settings')).toBeVisible();
  await expect(page.locator('#screen-home')).not.toHaveClass(/\bactive\b/);
});

test('v2: jurisdiction persists across page reload', async ({ page }) => {
  // Navigate to Settings
  await page.click('button[data-screen="settings"]');
  await expect(page.locator('#screen-settings')).toBeVisible();

  // Type a jurisdiction value and trigger change
  await page.fill('#settings-jurisdiction', 'California, Los Angeles');
  // Trigger the change event (blur)
  await page.locator('#settings-jurisdiction').dispatchEvent('change');

  // Reload and go back to settings
  await page.reload();
  await page.waitForSelector('#screen-home.active', { state: 'visible', timeout: 10_000 });
  await page.click('button[data-screen="settings"]');
  await expect(page.locator('#screen-settings')).toBeVisible();

  // The value should have persisted
  await expect(page.locator('#settings-jurisdiction')).toHaveValue('California, Los Angeles');
});
