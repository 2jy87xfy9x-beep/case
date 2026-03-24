import { exportCaseMarkdown } from '../app/application/exportCase.js';
import { setEvidenceCategory } from '../app/domain/evidenceOps.js';
import { needsExportReminder } from '../app/domain/exportReminder.js';
import type { Case, Evidence, EvidenceCategory } from '../app/domain/types.js';
import { IndexedDbCaseRepository } from '../app/storage/IndexedDbCaseRepository.js';

const CASE_ID = 'mvp-local-case';
const CASE_TITLE = 'Local case';

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '— None —' },
  { value: 'lease', label: 'Lease' },
  { value: 'payment', label: 'Payment' },
  { value: 'rent-notice', label: 'Rent notice' },
  { value: 'fee-notice', label: 'Fee notice' },
  { value: 'other', label: 'Other' }
];

const repo = new IndexedDbCaseRepository();

let currentCase: Case | null = null;
let selectedEvidenceId: string | null = null;

const elStatus = document.querySelector<HTMLElement>('#status')!;
const elReminder = document.querySelector<HTMLElement>('#export-reminder')!;
const elList = document.querySelector<HTMLUListElement>('#evidence-list')!;
const elDetailEmpty = document.querySelector<HTMLElement>('#detail-empty')!;
const elDetailBody = document.querySelector<HTMLElement>('#detail-body')!;
const elDetailTitle = document.querySelector<HTMLElement>('#detail-title')!;
const elDetailMeta = document.querySelector<HTMLElement>('#detail-meta')!;
const elDetailCategory = document.querySelector<HTMLSelectElement>('#detail-category')!;
const elDetailText = document.querySelector<HTMLElement>('#detail-text')!;
const btnExportFull = document.querySelector<HTMLButtonElement>('#btn-export-full')!;
const btnExportSummary = document.querySelector<HTMLButtonElement>('#btn-export-summary')!;

function setStatus(message: string): void {
  elStatus.textContent = message;
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

function formatExportFilename(variant: 'full' | 'summary'): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const base = variant === 'full' ? 'case-export' : 'case-lawyer-summary';
  return `${base}-${y}-${m}-${day}.md`;
}

function seedEvidence(): Evidence[] {
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
    mk('Sample lease excerpt', 'Terms placeholder for category demo.'),
    mk('Rent increase email', 'Landlord notified rent change effective next month.')
  ];
}

async function ensureCase(): Promise<Case> {
  let c = await repo.loadCase(CASE_ID);
  if (c) return c;

  const shell: Case = {
    id: CASE_ID,
    title: CASE_TITLE,
    lastExportedAt: null,
    evidence: [],
    messages: []
  };
  await repo.saveCase(shell);
  const evidence = seedEvidence();
  await repo.saveEvidence(CASE_ID, evidence);
  c = await repo.loadCase(CASE_ID);
  if (!c) throw new Error('Failed to initialize case');
  return c;
}

function selectedEvidence(): Evidence | undefined {
  if (!currentCase || !selectedEvidenceId) return undefined;
  return currentCase.evidence.find((e) => e.id === selectedEvidenceId);
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

function renderReminder(): void {
  if (!currentCase) {
    elReminder.classList.add('banner--hidden');
    return;
  }
  if (needsExportReminder(currentCase, new Date())) {
    elReminder.textContent =
      'You have not exported this case recently. Consider saving a lawyer packet or backup (.md).';
    elReminder.classList.remove('banner--hidden');
  } else {
    elReminder.classList.add('banner--hidden');
  }
}

function renderList(): void {
  elList.innerHTML = '';
  if (!currentCase) return;
  for (const ev of currentCase.evidence) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-current', ev.id === selectedEvidenceId ? 'true' : 'false');
    const t = document.createElement('span');
    t.className = 'ev-item__title';
    t.textContent = ev.title;
    const cat = document.createElement('span');
    cat.className = 'ev-item__cat';
    cat.textContent = ev.category ? `Category: ${ev.category}` : 'Uncategorized';
    btn.append(t, cat);
    btn.addEventListener('click', () => {
      selectedEvidenceId = ev.id;
      render();
    });
    li.append(btn);
    elList.append(li);
  }
}

function renderDetail(): void {
  const ev = selectedEvidence();
  if (!ev) {
    elDetailEmpty.classList.remove('detail-body--hidden');
    elDetailBody.classList.add('detail-body--hidden');
    return;
  }
  elDetailEmpty.classList.add('detail-body--hidden');
  elDetailBody.classList.remove('detail-body--hidden');
  elDetailTitle.textContent = ev.title;
  elDetailMeta.textContent = `Date: ${Number.isNaN(ev.dateTime.getTime()) ? '(not set)' : ev.dateTime.toLocaleString()}`;
  fillCategorySelect(ev.category);
  elDetailText.textContent = ev.body;
}

function render(): void {
  renderReminder();
  renderList();
  renderDetail();
}

function parseCategory(value: string): EvidenceCategory | undefined {
  if (value === '') return undefined;
  return value as EvidenceCategory;
}

async function onCategoryChange(): Promise<void> {
  if (!currentCase || !selectedEvidenceId) return;
  const category = parseCategory(elDetailCategory.value);
  const merged = setEvidenceCategory(currentCase, selectedEvidenceId, category);
  if (merged === currentCase) {
    setStatus('Category unchanged.');
    return;
  }
  currentCase = merged;
  await repo.saveEvidence(currentCase.id, currentCase.evidence);
  setStatus('Category saved.');
  render();
}

async function onExport(variant: 'fullCase' | 'lawyerSummary'): Promise<void> {
  const assembled = await repo.loadCase(CASE_ID);
  if (!assembled) {
    setStatus('No case to export.');
    return;
  }
  setStatus('Exporting…');
  try {
    const exportedAt = new Date();
    const { markdown, case: afterShell } = await exportCaseMarkdown({
      repo,
      caseData: assembled,
      variant,
      exportedAt,
      appVersion: '0.1.0'
    });
    const filename =
      variant === 'fullCase' ? formatExportFilename('full') : formatExportFilename('summary');
    downloadMarkdown(filename, markdown);
    const refreshed = await repo.loadCase(CASE_ID);
    currentCase = refreshed ?? { ...afterShell, evidence: assembled.evidence, messages: assembled.messages };
    setStatus(`Exported ${filename}`);
    render();
  } catch (e) {
    setStatus(e instanceof Error ? e.message : 'Export failed.');
  }
}

async function init(): Promise<void> {
  elDetailCategory.addEventListener('change', () => {
    void onCategoryChange();
  });
  btnExportFull.addEventListener('click', () => {
    void onExport('fullCase');
  });
  btnExportSummary.addEventListener('click', () => {
    void onExport('lawyerSummary');
  });

  try {
    currentCase = await ensureCase();
    if (currentCase.evidence.length > 0) {
      selectedEvidenceId = currentCase.evidence[0].id;
    }
    setStatus('Ready.');
    render();
  } catch (e) {
    setStatus(e instanceof Error ? e.message : 'Failed to load storage.');
  }
}

void init();
