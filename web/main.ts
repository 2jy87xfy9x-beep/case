import { exportCaseMarkdown } from '../app/application/exportCase.js';
import { setEvidenceCategory } from '../app/domain/evidenceOps.js';
import { needsExportReminder } from '../app/domain/exportReminder.js';
import { detectGaps } from '../app/domain/gapDetector.js';
import { buildTimeline } from '../app/domain/timeline.js';
import { parseImazingCsv } from '../app/messages/parsers/imazingCsv.js';
import { parseSmsXml } from '../app/messages/parsers/smsXml.js';
import { IndexedDbCaseRepository } from '../app/storage/IndexedDbCaseRepository.js';
import type { Case, Evidence, EvidenceCategory, Message, TimelineItem } from '../app/domain/types.js';

// ── Constants ──────────────────────────────────────────────────────────────

const CASE_ID = 'mvp-local-case';
const CASE_TITLE = 'Local case';
const APP_VERSION = '0.1.0';
const REMINDER_DISMISSED_KEY = 'caseOrg.reminderDismissed';

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '— None —' },
  { value: 'lease', label: 'Lease' },
  { value: 'payment', label: 'Payment record' },
  { value: 'rent-notice', label: 'Rent notice' },
  { value: 'fee-notice', label: 'Fee notice' },
  { value: 'other', label: 'Other' }
];

// ── Types ──────────────────────────────────────────────────────────────────

type Tab = 'inbox' | 'timeline' | 'evidence' | 'gaps' | 'export';

// ── State ──────────────────────────────────────────────────────────────────

const repo = new IndexedDbCaseRepository();
let currentCase: Case | null = null;
let activeTab: Tab = 'inbox';
let selectedEvidenceId: string | null = null;
let reminderDismissed = false;

// ── DOM queries ────────────────────────────────────────────────────────────

const elStatus = document.querySelector<HTMLElement>('#status')!;

// Inbox
const elReminder = document.querySelector<HTMLElement>('#export-reminder')!;
const elReminderText = document.querySelector<HTMLElement>('#export-reminder-text')!;
const btnReminderDismiss = document.querySelector<HTMLButtonElement>('#btn-reminder-dismiss')!;
const formAddEvidence = document.querySelector<HTMLFormElement>('#add-evidence-form')!;
const inpTitle = document.querySelector<HTMLInputElement>('#ev-title')!;
const inpDate = document.querySelector<HTMLInputElement>('#ev-date')!;
const inpBody = document.querySelector<HTMLTextAreaElement>('#ev-body')!;
const inpCsv = document.querySelector<HTMLInputElement>('#import-csv')!;
const inpXml = document.querySelector<HTMLInputElement>('#import-xml')!;
const elImportResult = document.querySelector<HTMLElement>('#import-result')!;
const inpCfgOwn = document.querySelector<HTMLInputElement>('#cfg-own')!;
const inpCfgLandlord = document.querySelector<HTMLInputElement>('#cfg-landlord')!;
const elUnreviewedList = document.querySelector<HTMLUListElement>('#unreviewed-list')!;
const elUnreviewedEmpty = document.querySelector<HTMLElement>('#unreviewed-empty')!;
const elUnreviewedCount = document.querySelector<HTMLElement>('#unreviewed-count')!;

// Timeline
const elTimelineList = document.querySelector<HTMLElement>('#timeline-list')!;
const elTimelineEmpty = document.querySelector<HTMLElement>('#timeline-empty')!;
const elTimelineCount = document.querySelector<HTMLElement>('#timeline-count')!;

// Evidence
const elEvidenceList = document.querySelector<HTMLUListElement>('#evidence-list')!;
const elEvidenceEmpty = document.querySelector<HTMLElement>('#evidence-empty')!;
const elEvidenceCount = document.querySelector<HTMLElement>('#evidence-count')!;
const elDetailEmpty = document.querySelector<HTMLElement>('#detail-empty')!;
const elDetailBody = document.querySelector<HTMLElement>('#detail-body')!;
const elDetailTitle = document.querySelector<HTMLElement>('#detail-title')!;
const elDetailMeta = document.querySelector<HTMLElement>('#detail-meta')!;
const elDetailCategory = document.querySelector<HTMLSelectElement>('#detail-category')!;
const elDetailText = document.querySelector<HTMLElement>('#detail-text')!;
const elOcrWarning = document.querySelector<HTMLElement>('#ocr-warning')!;
const btnConfirmReview = document.querySelector<HTMLButtonElement>('#btn-confirm-review')!;

// Gaps
const elGapsList = document.querySelector<HTMLElement>('#gaps-list')!;
const elGapsEmpty = document.querySelector<HTMLElement>('#gaps-empty')!;
const elGapsBadge = document.querySelector<HTMLElement>('#gaps-badge')!;
const elNavGapsBadge = document.querySelector<HTMLElement>('#nav-gaps-badge')!;

// Export
const elExportReminder = document.querySelector<HTMLElement>('#export-reminder-export')!;
const elExportReminderText = document.querySelector<HTMLElement>('#export-reminder-export-text')!;
const elLastExported = document.querySelector<HTMLElement>('#last-exported-label')!;
const btnExportFull = document.querySelector<HTMLButtonElement>('#btn-export-full')!;
const btnExportSummary = document.querySelector<HTMLButtonElement>('#btn-export-summary')!;

// Nav buttons
const navBtns = document.querySelectorAll<HTMLButtonElement>('.nav-btn');

// ── Utilities ──────────────────────────────────────────────────────────────

function setStatus(msg: string): void {
  elStatus.textContent = msg;
}

function setBadge(el: HTMLElement, count: number): void {
  el.textContent = count > 0 ? String(count) : '';
  el.hidden = count === 0;
}

function formatDate(d: Date): string {
  if (!Number.isFinite(d.getTime())) return '(no date)';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(d: Date): string {
  if (!Number.isFinite(d.getTime())) return '(no date)';
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportFilename(variant: 'full' | 'summary'): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return variant === 'full' ? `case-export-${stamp}.md` : `case-lawyer-summary-${stamp}.md`;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });
}

// ── Tab navigation ─────────────────────────────────────────────────────────

function switchTab(tab: Tab): void {
  activeTab = tab;

  document.querySelectorAll<HTMLElement>('.screen').forEach((el) => {
    el.classList.toggle('screen--hidden', el.id !== `screen-${tab}`);
  });

  navBtns.forEach((btn) => {
    btn.classList.toggle('nav-btn--active', btn.dataset['tab'] === tab);
    btn.setAttribute('aria-current', btn.dataset['tab'] === tab ? 'page' : 'false');
  });

  render();
}

// ── Seed / case init ───────────────────────────────────────────────────────

function makeSampleEvidence(): Evidence[] {
  const now = new Date();
  const mk = (title: string, body: string): Evidence => ({
    id: crypto.randomUUID(),
    dateTime: now,
    title,
    body,
    requiresUserReview: false,
    provenance: { tier: 'manual', extractedAt: now }
  });
  return [
    mk('Sample lease excerpt', 'Tenancy term: 12 months commencing 1 January 2024.'),
    mk('Rent increase email', 'Landlord notified rent change effective next month. New rent: $1,850.')
  ];
}

async function ensureCase(): Promise<Case> {
  let c = await repo.loadCase(CASE_ID);
  if (c) return c;
  const shell: Case = { id: CASE_ID, title: CASE_TITLE, lastExportedAt: null, evidence: [], messages: [] };
  await repo.saveCase(shell);
  const evidence = makeSampleEvidence();
  await repo.saveEvidence(CASE_ID, evidence);
  const loaded = await repo.loadCase(CASE_ID);
  if (!loaded) throw new Error('Failed to initialise case');
  return loaded;
}

// ── Render: inbox ──────────────────────────────────────────────────────────

function renderReminder(): void {
  if (!currentCase) return;
  const needs = needsExportReminder(currentCase, new Date()) && !reminderDismissed;
  const msg = currentCase.lastExportedAt
    ? `Your last export was ${formatDate(currentCase.lastExportedAt)}. Consider saving a new backup.`
    : 'You have not exported this case yet. Consider saving a lawyer packet or backup.';

  // Inbox reminder banner
  elReminderText.textContent = msg;
  elReminder.classList.toggle('banner--hidden', !needs);

  // Export screen reminder banner
  elExportReminderText.textContent = msg;
  elExportReminder.classList.toggle('banner--hidden', !needs);
}

function renderUnreviewed(): void {
  if (!currentCase) return;
  const items = currentCase.evidence.filter((e) => e.requiresUserReview);
  setBadge(elUnreviewedCount, items.length);
  elUnreviewedList.innerHTML = '';
  if (items.length === 0) {
    elUnreviewedEmpty.hidden = false;
    return;
  }
  elUnreviewedEmpty.hidden = true;
  for (const ev of items) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'item-btn';
    btn.innerHTML = `<span class="item-btn__title">${escHtml(ev.title)}</span>
      <span class="item-btn__meta">Added ${formatDate(ev.dateTime)} · OCR needs review</span>`;
    btn.addEventListener('click', () => {
      selectedEvidenceId = ev.id;
      switchTab('evidence');
    });
    li.append(btn);
    elUnreviewedList.append(li);
  }
}

// ── Render: timeline ───────────────────────────────────────────────────────

function renderTimeline(): void {
  if (!currentCase) return;
  const items: TimelineItem[] = buildTimeline(currentCase.evidence, currentCase.messages);
  setBadge(elTimelineCount, items.length);
  elTimelineList.innerHTML = '';

  if (items.length === 0) {
    elTimelineEmpty.hidden = false;
    return;
  }
  elTimelineEmpty.hidden = true;

  for (const item of items) {
    const li = document.createElement('li');
    li.className = `timeline-item timeline-item--${item.kind}`;

    if (item.kind === 'evidence') {
      const ev = item as Evidence & { kind: 'evidence' };
      li.innerHTML = `
        <span class="tl-kind tl-kind--evidence" aria-hidden="true">📄</span>
        <div class="tl-content">
          <span class="tl-title">${escHtml(ev.title)}</span>
          ${ev.category ? `<span class="tl-tag">${escHtml(ev.category)}</span>` : ''}
          ${ev.requiresUserReview ? '<span class="tl-tag tl-tag--warn">needs review</span>' : ''}
          <span class="tl-date">${formatDate(ev.dateTime)}</span>
        </div>`;
    } else {
      const msg = item as Message & { kind: 'message' };
      li.innerHTML = `
        <span class="tl-kind tl-kind--message tl-kind--${msg.direction}" aria-hidden="true">${msg.direction === 'sent' ? '💬' : '📨'}</span>
        <div class="tl-content">
          <span class="tl-title">${escHtml(msg.body.slice(0, 120))}${msg.body.length > 120 ? '…' : ''}</span>
          <span class="tl-tag tl-tag--sender">${escHtml(msg.sender)} · ${msg.direction}</span>
          <span class="tl-date">${formatDateTime(msg.dateTime)}</span>
        </div>`;
    }
    elTimelineList.append(li);
  }
}

// ── Render: evidence list ──────────────────────────────────────────────────

function renderEvidenceList(): void {
  if (!currentCase) return;
  const { evidence } = currentCase;
  setBadge(elEvidenceCount, evidence.length);
  elEvidenceList.innerHTML = '';

  if (evidence.length === 0) {
    elEvidenceEmpty.hidden = false;
    return;
  }
  elEvidenceEmpty.hidden = true;

  for (const ev of evidence) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'item-btn';
    btn.setAttribute('aria-current', ev.id === selectedEvidenceId ? 'true' : 'false');
    btn.innerHTML = `
      <span class="item-btn__title">${escHtml(ev.title)}</span>
      <span class="item-btn__meta">
        ${ev.category ? `<span class="tag">${escHtml(ev.category)}</span>` : '<span class="tag tag--none">uncategorized</span>'}
        ${ev.requiresUserReview ? ' <span class="tag tag--warn">review</span>' : ''}
      </span>`;
    btn.addEventListener('click', () => {
      selectedEvidenceId = ev.id;
      renderEvidenceDetail();
      renderEvidenceList(); // update aria-current
    });
    li.append(btn);
    elEvidenceList.append(li);
  }
}

function fillCategorySelect(value: EvidenceCategory | undefined): void {
  elDetailCategory.innerHTML = '';
  for (const opt of CATEGORY_OPTIONS) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    elDetailCategory.append(o);
  }
  elDetailCategory.value = value ?? '';
}

function renderEvidenceDetail(): void {
  if (!currentCase || !selectedEvidenceId) {
    elDetailEmpty.hidden = false;
    elDetailBody.classList.add('detail-body--hidden');
    return;
  }
  const ev = currentCase.evidence.find((e) => e.id === selectedEvidenceId);
  if (!ev) {
    elDetailEmpty.hidden = false;
    elDetailBody.classList.add('detail-body--hidden');
    return;
  }

  elDetailEmpty.hidden = true;
  elDetailBody.classList.remove('detail-body--hidden');
  elDetailTitle.textContent = ev.title;
  elDetailMeta.textContent = `${formatDate(ev.dateTime)} · ${ev.provenance.tier} · ${ev.provenance.engineVersion ?? ''}`;
  fillCategorySelect(ev.category);
  elDetailText.textContent = ev.body;

  const needsReview = ev.requiresUserReview;
  elOcrWarning.classList.toggle('inline-warning--hidden', !needsReview);
  btnConfirmReview.hidden = !needsReview;
}

// ── Render: gaps ───────────────────────────────────────────────────────────

function renderGaps(): void {
  if (!currentCase) return;
  const gaps = detectGaps(currentCase);
  setBadge(elGapsBadge, gaps.length);
  setBadge(elNavGapsBadge, gaps.length);
  elGapsList.innerHTML = '';

  if (gaps.length === 0) {
    elGapsEmpty.hidden = false;
    return;
  }
  elGapsEmpty.hidden = true;

  for (const gap of gaps) {
    const li = document.createElement('li');
    li.className = `gap-item gap-item--${gap.severity}`;
    li.innerHTML = `
      <span class="gap-item__name">${escHtml(gap.displayName)}</span>
      <span class="gap-item__desc">${escHtml(gap.description)}</span>
      <span class="gap-item__sev">${gap.severity}</span>`;
    elGapsList.append(li);
  }
}

// ── Render: export ─────────────────────────────────────────────────────────

function renderExport(): void {
  if (!currentCase) return;
  const lat = currentCase.lastExportedAt;
  elLastExported.textContent = lat
    ? `Last exported: ${formatDateTime(lat)}`
    : 'Not yet exported.';
}

// ── Main render ────────────────────────────────────────────────────────────

function render(): void {
  if (!currentCase) return;
  renderReminder();

  if (activeTab === 'inbox') {
    renderUnreviewed();
  } else if (activeTab === 'timeline') {
    renderTimeline();
  } else if (activeTab === 'evidence') {
    renderEvidenceList();
    renderEvidenceDetail();
  } else if (activeTab === 'gaps') {
    renderGaps();
  } else if (activeTab === 'export') {
    renderExport();
  }

  // Always keep gaps nav badge current
  const gapCount = detectGaps(currentCase).length;
  setBadge(elNavGapsBadge, gapCount);
}

// ── Action: add evidence ───────────────────────────────────────────────────

async function onAddEvidence(e: Event): Promise<void> {
  e.preventDefault();
  const title = inpTitle.value.trim();
  if (!title) {
    inpTitle.focus();
    return;
  }

  const rawDate = inpDate.value;
  const dateTime = rawDate ? new Date(rawDate + 'T00:00:00') : new Date(NaN);
  const body = inpBody.value.trim();
  const now = new Date();

  const ev: Evidence = {
    id: crypto.randomUUID(),
    dateTime,
    title,
    body,
    requiresUserReview: false,
    provenance: { tier: 'manual', extractedAt: now, engineVersion: 'manual-v1' }
  };

  if (!currentCase) return;
  const updated: Case = { ...currentCase, evidence: [...currentCase.evidence, ev] };
  await repo.saveEvidence(CASE_ID, updated.evidence);
  currentCase = await repo.loadCase(CASE_ID) ?? updated;

  inpTitle.value = '';
  inpDate.value = '';
  inpBody.value = '';
  setStatus(`Added: ${title}`);
  render();
}

// ── Action: import CSV ─────────────────────────────────────────────────────

async function onImportCsv(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ''; // allow re-import of same file
  if (!file || !currentCase) return;

  elImportResult.textContent = 'Parsing…';
  try {
    const csvText = await readFileAsText(file);
    const ownRaw = inpCfgOwn.value.trim();
    const landlordRaw = inpCfgLandlord.value.trim();
    const ownIdentifiers = ownRaw ? ownRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const landlordIdentifiers = landlordRaw ? landlordRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];

    const parsed = parseImazingCsv(csvText, {
      ownIdentifiers,
      landlordIdentifiers,
      logger: (msg) => console.warn('[iMazing CSV]', msg)
    });

    const { imported, skipped } = await persistMessages(parsed);
    elImportResult.textContent = `Imported ${imported} message${imported !== 1 ? 's' : ''}${skipped > 0 ? ` (${skipped} duplicate${skipped !== 1 ? 's' : ''} skipped)` : ''}.`;
    setStatus(`Imported ${imported} messages from ${file.name}`);
    render();
  } catch (err) {
    elImportResult.textContent = err instanceof Error ? err.message : 'Import failed.';
  }
}

// ── Action: import XML ─────────────────────────────────────────────────────

async function onImportXml(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !currentCase) return;

  elImportResult.textContent = 'Parsing…';
  try {
    const xmlText = await readFileAsText(file);
    const parsed = parseSmsXml(xmlText);
    const { imported, skipped } = await persistMessages(parsed);
    elImportResult.textContent = `Imported ${imported} message${imported !== 1 ? 's' : ''}${skipped > 0 ? ` (${skipped} duplicate${skipped !== 1 ? 's' : ''} skipped)` : ''}.`;
    setStatus(`Imported ${imported} messages from ${file.name}`);
    render();
  } catch (err) {
    elImportResult.textContent = err instanceof Error ? err.message : 'Import failed.';
  }
}

/** Deduplicate by dateTime+sender+body and persist unique messages. */
async function persistMessages(incoming: Message[]): Promise<{ imported: number; skipped: number }> {
  const existing = await repo.listMessages(CASE_ID);
  const existingKeys = new Set(existing.map((m) => dedupKey(m)));

  const unique = incoming.filter((m) => !existingKeys.has(dedupKey(m)));
  if (unique.length > 0) {
    await repo.saveMessages(CASE_ID, unique);
    currentCase = await repo.loadCase(CASE_ID);
  }
  return { imported: unique.length, skipped: incoming.length - unique.length };
}

function dedupKey(m: Message): string {
  return `${m.dateTime.toISOString()}|${m.sender}|${m.body}`;
}

// ── Action: category change ────────────────────────────────────────────────

async function onCategoryChange(): Promise<void> {
  if (!currentCase || !selectedEvidenceId) return;
  const category = elDetailCategory.value ? (elDetailCategory.value as EvidenceCategory) : undefined;
  const updated = setEvidenceCategory(currentCase, selectedEvidenceId, category);
  if (updated === currentCase) return;
  currentCase = updated;
  await repo.saveEvidence(CASE_ID, currentCase.evidence);
  setStatus('Category saved.');
  renderEvidenceList();
  renderGaps();
  setBadge(elNavGapsBadge, detectGaps(currentCase).length);
}

// ── Action: confirm OCR review ─────────────────────────────────────────────

async function onConfirmReview(): Promise<void> {
  if (!currentCase || !selectedEvidenceId) return;
  const idx = currentCase.evidence.findIndex((e) => e.id === selectedEvidenceId);
  if (idx === -1) return;

  const updated: Evidence[] = currentCase.evidence.map((e, i) =>
    i === idx ? { ...e, requiresUserReview: false } : e
  );
  currentCase = { ...currentCase, evidence: updated };
  await repo.saveEvidence(CASE_ID, updated);
  setStatus('Marked as reviewed.');
  render();
}

// ── Action: export ─────────────────────────────────────────────────────────

async function onExport(variant: 'fullCase' | 'lawyerSummary'): Promise<void> {
  const assembled = await repo.loadCase(CASE_ID);
  if (!assembled) { setStatus('No case to export.'); return; }

  setStatus('Exporting…');
  try {
    const exportedAt = new Date();
    const { markdown, case: afterShell } = await exportCaseMarkdown({
      repo,
      caseData: assembled,
      variant,
      exportedAt,
      appVersion: APP_VERSION
    });
    const filename = exportFilename(variant === 'fullCase' ? 'full' : 'summary');
    downloadMarkdown(filename, markdown);
    currentCase = await repo.loadCase(CASE_ID) ??
      { ...afterShell, evidence: assembled.evidence, messages: assembled.messages };
    reminderDismissed = false; // fresh export clears session dismiss
    setStatus(`Exported ${filename}`);
    render();
  } catch (err) {
    setStatus(err instanceof Error ? err.message : 'Export failed.');
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Init ───────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  // Nav tabs
  navBtns.forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset['tab'] as Tab));
  });

  // Reminder dismiss (session-only)
  btnReminderDismiss.addEventListener('click', () => {
    reminderDismissed = true;
    elReminder.classList.add('banner--hidden');
    sessionStorage.setItem(REMINDER_DISMISSED_KEY, '1');
  });

  // Restore session dismiss state
  if (sessionStorage.getItem(REMINDER_DISMISSED_KEY)) {
    reminderDismissed = true;
  }

  // Inbox form
  formAddEvidence.addEventListener('submit', (e) => { void onAddEvidence(e); });
  inpCsv.addEventListener('change', (e) => { void onImportCsv(e); });
  inpXml.addEventListener('change', (e) => { void onImportXml(e); });

  // Evidence detail
  elDetailCategory.addEventListener('change', () => { void onCategoryChange(); });
  btnConfirmReview.addEventListener('click', () => { void onConfirmReview(); });

  // Export
  btnExportFull.addEventListener('click', () => { void onExport('fullCase'); });
  btnExportSummary.addEventListener('click', () => { void onExport('lawyerSummary'); });

  try {
    currentCase = await ensureCase();
    if (currentCase.evidence.length > 0) {
      selectedEvidenceId = currentCase.evidence[0].id;
    }
    setStatus('Ready.');
    render();
  } catch (err) {
    setStatus(err instanceof Error ? err.message : 'Failed to load storage.');
  }
}

void init();
