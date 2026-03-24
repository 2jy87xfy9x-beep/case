import { exportCaseMarkdown } from '../app/application/exportCase.js';
import {
  addClaim,
  addLegalNote,
  createClaim,
  createLegalNote,
  removeClaim,
  removeLegalNote,
  updateClaim
} from '../app/domain/claimsOps.js';
import { setEvidenceCategory } from '../app/domain/evidenceOps.js';
import { needsExportReminder } from '../app/domain/exportReminder.js';
import { detectGaps } from '../app/domain/gapDetector.js';
import { buildTimeline } from '../app/domain/timeline.js';
import { parseImazingCsv } from '../app/messages/parsers/imazingCsv.js';
import { parseSmsXml } from '../app/messages/parsers/smsXml.js';
import { IndexedDbCaseRepository } from '../app/storage/IndexedDbCaseRepository.js';
import type { Case, Claim, Evidence, EvidenceCategory, LegalNote, Message, TimelineItem } from '../app/domain/types.js';

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

type Tab = 'inbox' | 'timeline' | 'evidence' | 'gaps' | 'law' | 'export';

// ── State ──────────────────────────────────────────────────────────────────

const repo = new IndexedDbCaseRepository();
let currentCase: Case | null = null;
let activeTab: Tab = 'inbox';
let selectedEvidenceId: string | null = null;
let reminderDismissed = false;
let selectedClaimId: string | null = null;
let selectedNoteId: string | null = null;

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
const inpImage = document.querySelector<HTMLInputElement>('#ev-image')!;
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
const elClaimsCount = document.querySelector<HTMLElement>('#claims-count')!;
const elNotesCount = document.querySelector<HTMLElement>('#notes-count')!;
const elNavGapsBadge = document.querySelector<HTMLElement>('#nav-gaps-badge')!;

// Export
const elExportReminder = document.querySelector<HTMLElement>('#export-reminder-export')!;
const elExportReminderText = document.querySelector<HTMLElement>('#export-reminder-export-text')!;
const elLastExported = document.querySelector<HTMLElement>('#last-exported-label')!;
const btnExportFull = document.querySelector<HTMLButtonElement>('#btn-export-full')!;
const btnExportSummary = document.querySelector<HTMLButtonElement>('#btn-export-summary')!;
const btnBackupDownload = document.querySelector<HTMLButtonElement>('#btn-backup-download')!;
const inpBackupRestore = document.querySelector<HTMLInputElement>('#inp-backup-restore')!;
const elBackupRestoreStatus = document.querySelector<HTMLElement>('#backup-restore-status')!;

// Law tab
const formAddClaim = document.querySelector<HTMLFormElement>('#add-claim-form')!;
const inpClaimTitle = document.querySelector<HTMLInputElement>('#claim-title')!;
const inpClaimDesc = document.querySelector<HTMLTextAreaElement>('#claim-desc')!;
const inpClaimStatus = document.querySelector<HTMLSelectElement>('#claim-status')!;
const elClaimsList = document.querySelector<HTMLElement>('#claims-list')!;
const elClaimsEmpty = document.querySelector<HTMLElement>('#claims-empty')!;
const elClaimDetail = document.querySelector<HTMLElement>('#claim-detail')!;
const elClaimDetailBody = document.querySelector<HTMLElement>('#claim-detail-body')!;
const inpClaimQuestion = document.querySelector<HTMLInputElement>('#claim-question-input')!;
const btnAddClaimQuestion = document.querySelector<HTMLButtonElement>('#btn-add-claim-question')!;
const formAddNote = document.querySelector<HTMLFormElement>('#add-note-form')!;
const inpNoteTopic = document.querySelector<HTMLInputElement>('#note-topic')!;
const inpNoteSummary = document.querySelector<HTMLTextAreaElement>('#note-summary')!;
const inpNoteSource = document.querySelector<HTMLInputElement>('#note-source')!;
const inpNoteApplies = document.querySelector<HTMLSelectElement>('#note-applies')!;
const elNotesList = document.querySelector<HTMLElement>('#notes-list')!;
const elNotesEmpty = document.querySelector<HTMLElement>('#notes-empty')!;

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
  const shell: Case = { id: CASE_ID, title: CASE_TITLE, lastExportedAt: null, evidence: [], messages: [], claims: [], legalNotes: [] };
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

// ── Render: law tab ────────────────────────────────────────────────────────

const STATUS_DISPLAY: Record<string, string> = {
  'researching': 'Researching',
  'ready-to-discuss': 'Ready to discuss',
  'resolved': 'Resolved',
  'dropped': 'Dropped'
};

function renderClaimsList(): void {
  if (!currentCase) return;
  const { claims } = currentCase;
  setBadge(elClaimsCount, claims.length);
  elClaimsList.innerHTML = '';
  if (claims.length === 0) {
    elClaimsEmpty.hidden = false;
    return;
  }
  elClaimsEmpty.hidden = true;
  for (const claim of claims) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'item-btn';
    btn.setAttribute('aria-current', claim.id === selectedClaimId ? 'true' : 'false');
    btn.innerHTML = `
      <span class="item-btn__title">${escHtml(claim.title)}</span>
      <span class="item-btn__meta">
        <span class="tag">${escHtml(STATUS_DISPLAY[claim.status] ?? claim.status)}</span>
        ${claim.questions.length > 0 ? `<span class="tag">${claim.questions.length} question${claim.questions.length !== 1 ? 's' : ''}</span>` : ''}
      </span>`;
    btn.addEventListener('click', () => {
      selectedClaimId = claim.id;
      renderClaimDetail();
      renderClaimsList();
    });
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn-icon-del';
    delBtn.setAttribute('aria-label', `Remove ${claim.title}`);
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      void onRemoveClaim(claim.id);
    });
    li.append(btn, delBtn);
    elClaimsList.append(li);
  }
}

function renderClaimDetail(): void {
  if (!currentCase || !selectedClaimId) {
    elClaimDetail.hidden = true;
    return;
  }
  const claim = currentCase.claims.find((c) => c.id === selectedClaimId);
  if (!claim) { elClaimDetail.hidden = true; return; }

  elClaimDetail.hidden = false;
  elClaimDetailBody.innerHTML = `
    <p class="detail__title">${escHtml(claim.title)}</p>
    <p class="muted detail__meta">Status: ${escHtml(STATUS_DISPLAY[claim.status] ?? claim.status)} · Confidence: ${escHtml(claim.confidence)}</p>
    ${claim.description ? `<p>${escHtml(claim.description)}</p>` : ''}
    ${claim.questions.length > 0 ? `
      <p class="field__label">Questions to ask</p>
      <ul class="questions-list">${claim.questions.map((q) => `<li>${escHtml(q)}</li>`).join('')}</ul>
    ` : '<p class="muted">No questions yet.</p>'}
    <div class="field add-question-row">
      <label class="field__label" for="claim-question-input">Add a question</label>
    </div>`;
}

function renderNotesList(): void {
  if (!currentCase) return;
  const { legalNotes } = currentCase;
  setBadge(elNotesCount, legalNotes.length);
  elNotesList.innerHTML = '';
  if (legalNotes.length === 0) {
    elNotesEmpty.hidden = false;
    return;
  }
  elNotesEmpty.hidden = true;
  for (const note of legalNotes) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'item-btn';
    btn.setAttribute('aria-current', note.id === selectedNoteId ? 'true' : 'false');
    btn.innerHTML = `
      <span class="item-btn__title">${escHtml(note.topic)}</span>
      <span class="item-btn__meta">
        <span class="tag">Applies: ${escHtml(note.appliesToCase)}</span>
        ${note.source ? `<span class="muted" style="font-size:11px">${escHtml(note.source.slice(0, 40))}</span>` : ''}
      </span>`;
    btn.addEventListener('click', () => { selectedNoteId = note.id; renderNotesList(); });
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn-icon-del';
    delBtn.setAttribute('aria-label', `Remove ${note.topic}`);
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      void onRemoveLegalNote(note.id);
    });
    li.append(btn, delBtn);
    elNotesList.append(li);
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
  } else if (activeTab === 'law') {
    renderClaimsList();
    renderClaimDetail();
    renderNotesList();
  } else if (activeTab === 'export') {
    renderExport();
  }

  // Always keep gaps nav badge current
  const gapCount = detectGaps(currentCase).length;
  setBadge(elNavGapsBadge, gapCount);
}

// ── Action: image selected ─────────────────────────────────────────────────

function onImageSelected(): void {
  const file = inpImage.files?.[0];
  if (!file) return;

  // Auto-populate title with filename (strip extension)
  if (!inpTitle.value.trim()) {
    inpTitle.value = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
  }

  // Auto-populate date from file last-modified if date not already set
  if (!inpDate.value && file.lastModified) {
    const d = new Date(file.lastModified);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    inpDate.value = `${yyyy}-${mm}-${dd}`;
  }
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
  const hasImage = (inpImage.files?.length ?? 0) > 0;
  const now = new Date();

  const ev: Evidence = {
    id: crypto.randomUUID(),
    dateTime,
    title,
    body,
    requiresUserReview: hasImage && !body,
    provenance: { tier: 'manual', extractedAt: now, engineVersion: 'manual-v1' }
  };

  if (!currentCase) return;
  const updated: Case = { ...currentCase, evidence: [...currentCase.evidence, ev] };
  await repo.saveEvidence(CASE_ID, updated.evidence);
  currentCase = await repo.loadCase(CASE_ID) ?? updated;

  inpTitle.value = '';
  inpDate.value = '';
  inpBody.value = '';
  inpImage.value = '';
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

// ── Action: backup download ─────────────────────────────────────────────────

async function onBackupDownload(): Promise<void> {
  const assembled = await repo.loadCase(CASE_ID);
  if (!assembled) { setStatus('No case to back up.'); return; }

  setStatus('Preparing backup…');
  try {
    // Serialize dates to ISO strings so JSON round-trips cleanly
    const payload = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      case: {
        ...assembled,
        lastExportedAt: assembled.lastExportedAt?.toISOString() ?? null,
        evidence: assembled.evidence.map(ev => ({
          ...ev,
          dateTime: Number.isFinite(ev.dateTime.getTime()) ? ev.dateTime.toISOString() : null,
          provenance: { ...ev.provenance, extractedAt: ev.provenance.extractedAt.toISOString() }
        })),
        messages: assembled.messages.map(m => ({ ...m, dateTime: m.dateTime.toISOString() }))
      }
    }, null, 2);

    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const filename = `case-backup-${stamp}.json`;
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a);
    a.click(); a.remove(); URL.revokeObjectURL(url);
    setStatus(`Backup saved: ${filename}`);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : 'Backup failed.');
  }
}

// ── Action: backup restore ──────────────────────────────────────────────────

async function onBackupRestore(e: Event): Promise<void> {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  elBackupRestoreStatus.textContent = 'Reading file…';
  try {
    const text = await file.text();
    const payload = JSON.parse(text) as {
      version: number;
      case: {
        id: string;
        title: string;
        lastExportedAt: string | null;
        evidence: Array<Record<string, unknown>>;
        messages: Array<Record<string, unknown>>;
        claims: Array<Record<string, unknown>>;
        legalNotes: Array<Record<string, unknown>>;
        lawyers: Array<Record<string, unknown>>;
      };
    };
    if (payload.version !== 1 || !payload.case?.id) {
      throw new Error('Unrecognised backup format.');
    }
    const c = payload.case;
    // Re-hydrate dates
    const restoredCase = {
      ...c,
      lastExportedAt: c.lastExportedAt ? new Date(c.lastExportedAt) : null,
      evidence: (c.evidence as Array<{
        dateTime: string | null;
        provenance: { extractedAt: string; tier: string; engineVersion?: string };
        [key: string]: unknown;
      }>).map(ev => ({
        ...ev,
        dateTime: ev.dateTime ? new Date(ev.dateTime) : new Date(NaN),
        provenance: { ...ev.provenance, extractedAt: new Date(ev.provenance.extractedAt) }
      })),
      messages: (c.messages as Array<{ dateTime: string; [key: string]: unknown }>).map(m => ({
        ...m,
        dateTime: new Date(m.dateTime)
      })),
      claims: c.claims,
      legalNotes: c.legalNotes,
      lawyers: c.lawyers
    };

    await repo.saveCase(restoredCase as Parameters<typeof repo.saveCase>[0]);
    await repo.saveEvidence(c.id, restoredCase.evidence as Parameters<typeof repo.saveEvidence>[1]);
    await repo.saveMessages(c.id, restoredCase.messages as Parameters<typeof repo.saveMessages>[1]);
    await repo.saveClaims(c.id, restoredCase.claims as Parameters<typeof repo.saveClaims>[1]);
    await repo.saveLegalNotes(c.id, restoredCase.legalNotes as Parameters<typeof repo.saveLegalNotes>[1]);
    await repo.saveLawyers(c.id, restoredCase.lawyers as Parameters<typeof repo.saveLawyers>[1]);

    currentCase = await repo.loadCase(CASE_ID);
    elBackupRestoreStatus.textContent = `Restored. ${restoredCase.evidence.length} evidence items, ${restoredCase.messages.length} messages.`;
    setStatus('Backup restored.');
    render();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Restore failed.';
    elBackupRestoreStatus.textContent = `Error: ${msg}`;
    setStatus(msg);
  } finally {
    // Reset input so the same file can be re-selected if needed
    inpBackupRestore.value = '';
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

// ── Action: add claim ──────────────────────────────────────────────────────

async function onAddClaim(e: Event): Promise<void> {
  e.preventDefault();
  const title = inpClaimTitle.value.trim();
  if (!title || !currentCase) { inpClaimTitle.focus(); return; }
  const claim = createClaim({
    title,
    description: inpClaimDesc.value.trim(),
    status: (inpClaimStatus.value as Claim['status']) || 'researching'
  });
  currentCase = addClaim(currentCase, claim);
  await repo.saveClaims(CASE_ID, currentCase.claims);
  selectedClaimId = claim.id;
  inpClaimTitle.value = '';
  inpClaimDesc.value = '';
  inpClaimStatus.value = 'researching';
  setStatus(`Topic added: ${title}`);
  renderClaimsList();
  renderClaimDetail();
}

async function onRemoveClaim(claimId: string): Promise<void> {
  if (!currentCase) return;
  currentCase = removeClaim(currentCase, claimId);
  await repo.saveClaims(CASE_ID, currentCase.claims);
  if (selectedClaimId === claimId) { selectedClaimId = null; }
  setStatus('Topic removed.');
  renderClaimsList();
  renderClaimDetail();
}

async function onAddClaimQuestion(): Promise<void> {
  if (!currentCase || !selectedClaimId) return;
  const question = inpClaimQuestion.value.trim();
  if (!question) return;
  const existing = currentCase.claims.find((c) => c.id === selectedClaimId);
  if (!existing) return;
  currentCase = updateClaim(currentCase, selectedClaimId, {
    questions: [...existing.questions, question]
  });
  await repo.saveClaims(CASE_ID, currentCase.claims);
  inpClaimQuestion.value = '';
  setStatus('Question added.');
  renderClaimDetail();
  renderClaimsList();
}

// ── Action: add legal note ─────────────────────────────────────────────────

async function onAddLegalNote(e: Event): Promise<void> {
  e.preventDefault();
  const topic = inpNoteTopic.value.trim();
  if (!topic || !currentCase) { inpNoteTopic.focus(); return; }
  const note = createLegalNote({
    topic,
    summary: inpNoteSummary.value.trim(),
    source: inpNoteSource.value.trim(),
    appliesToCase: (inpNoteApplies.value as LegalNote['appliesToCase']) || 'maybe'
  });
  currentCase = addLegalNote(currentCase, note);
  await repo.saveLegalNotes(CASE_ID, currentCase.legalNotes);
  selectedNoteId = note.id;
  inpNoteTopic.value = '';
  inpNoteSummary.value = '';
  inpNoteSource.value = '';
  inpNoteApplies.value = 'maybe';
  setStatus(`Note added: ${topic}`);
  renderNotesList();
}

async function onRemoveLegalNote(noteId: string): Promise<void> {
  if (!currentCase) return;
  currentCase = removeLegalNote(currentCase, noteId);
  await repo.saveLegalNotes(CASE_ID, currentCase.legalNotes);
  if (selectedNoteId === noteId) selectedNoteId = null;
  setStatus('Note removed.');
  renderNotesList();
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
  inpImage.addEventListener('change', onImageSelected);
  inpCsv.addEventListener('change', (e) => { void onImportCsv(e); });
  inpXml.addEventListener('change', (e) => { void onImportXml(e); });

  // Evidence detail
  elDetailCategory.addEventListener('change', () => { void onCategoryChange(); });
  btnConfirmReview.addEventListener('click', () => { void onConfirmReview(); });

  // Law tab
  formAddClaim.addEventListener('submit', (e) => { void onAddClaim(e); });
  btnAddClaimQuestion.addEventListener('click', () => { void onAddClaimQuestion(); });
  formAddNote.addEventListener('submit', (e) => { void onAddLegalNote(e); });

  // Export
  btnExportFull.addEventListener('click', () => { void onExport('fullCase'); });
  btnExportSummary.addEventListener('click', () => { void onExport('lawyerSummary'); });
  btnBackupDownload.addEventListener('click', () => { void onBackupDownload(); });
  inpBackupRestore.addEventListener('change', (e) => { void onBackupRestore(e); });

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
