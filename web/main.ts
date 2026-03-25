/**
 * main.ts — v2 UI for Case Organizer
 *
 * Screens: Home, Brief, Library, Settings
 * Plus: Consultation overlay
 */

import { autoProcess, classifyFromContent } from '../app/application/autoProcess.js';
import { extractExifDate } from '../app/application/extractExifDate.js';
import { extractKeyFacts } from '../app/application/filterKeyFacts.js';
import { preprocessImageForOcr } from '../app/application/preprocessImageForOcr.js';
import { exportCaseMarkdown } from '../app/application/exportCase.js';
import { importScreenshotOcr } from '../app/application/importScreenshotOcr.js';
import { createCase } from '../app/domain/factories.js';
import { buildTimeline } from '../app/domain/timeline.js';
import { detectGaps } from '../app/domain/gapDetector.js';
import { parseImazingCsv } from '../app/messages/parsers/imazingCsv.js';
import { parseSmsXml } from '../app/messages/parsers/smsXml.js';
import { IndexedDbCaseRepository } from '../app/storage/IndexedDbCaseRepository.js';
import { TieredOcrService } from '../app/ocr/tiered/index.js';
import { TesseractOcrService } from '../app/ocr/tesseract/index.js';
import { createWorker } from 'tesseract.js';
import type { Case, Evidence, EvidenceCategory, Gap, TimelineItem } from '../app/domain/types.js';

// ── Real Tesseract engine (lazy-initialized, shared across calls) ──────────────

let _tesseractWorker: Awaited<ReturnType<typeof createWorker>> | null = null;
async function getTesseractWorker() {
  if (!_tesseractWorker) {
    _tesseractWorker = await createWorker('eng');
  }
  return _tesseractWorker;
}

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

// ── State ──────────────────────────────────────────────────────────────────────

const repo = new IndexedDbCaseRepository();
let allCases: Case[] = [];
let currentCase: Case | null = null;
let consultSlide = 0;
let _multiselect = false;
let _deleteMode = false;
let _selectedCaseIds: Set<string> = new Set();

// ── Library state (localStorage) ──────────────────────────────────────────────

interface LibraryItem {
  id: string;
  name: string;
  type: string;
  assignedCaseId?: string;
  url?: string;           // external URL
  content?: string;       // text content
  snapshot?: string;      // cached text excerpt from URL (first 3000 chars)
  snapshotAt?: string;    // ISO date when snapshot was taken
}

const LIB_KEY = 'caseOrg.library';
const JURISDICTION_KEY = 'caseOrg.jurisdiction';
const TENANT_NAME_KEY = 'caseOrg.tenantName';
const EXPORT_PREF_KEY = 'caseOrg.exportPref';
const SETUP_DONE_KEY = 'caseOrg.setupDone';
const SIMULATE_OFFLINE_KEY = 'caseOrg.simulateOffline';
const SYNC_FOLDERS_KEY = 'caseOrg.syncFolders';
const DEFAULT_JURISDICTION = 'Warren, Ohio (Trumbull County)';

interface SyncFolder {
  id: string;
  name: string;
  path: string;
  processedFiles: string[];
}

// Store folder handles temporarily in memory (re-granted each session)
const _syncHandles: Map<string, FileSystemDirectoryHandle> = new Map();

// ── Topic archetypes ────────────────────────────────────────────────────────────

interface TopicArchetype {
  id: string;
  label: string;
  description: string;
  questions: Array<{ id: string; label: string; placeholder: string }>;
  gather: string[];
  statute: string;
}

const TOPIC_ARCHETYPES: TopicArchetype[] = [
  {
    id: 'illegal-late-fees',
    label: 'Illegal late fees',
    description: 'Fees charged beyond what the lease allows, or applied unfairly.',
    questions: [
      { id: 'fee_amount', label: 'Amount charged', placeholder: 'e.g. $150' },
      { id: 'fee_date', label: 'First charged on', placeholder: 'e.g. Jan 5, 2025' },
      { id: 'lease_clause', label: 'What does your lease say about late fees?', placeholder: 'e.g. $50 after 5-day grace period' },
      { id: 'occurrences', label: 'How many times has this occurred?', placeholder: 'e.g. 3 months in a row' },
    ],
    gather: [
      'Signed lease agreement (late fee clause)',
      'Rent payment receipts or bank records',
      'Late fee notices from landlord',
      'Written communications about fees (texts, emails, letters)',
    ],
    statute: 'Ohio requires late fees to be "reasonable" — no statutory cap, but courts can void excessive fees.',
  },
  {
    id: 'habitability',
    label: 'Habitability issues',
    description: 'Landlord failure to maintain fit, safe, and livable conditions.',
    questions: [
      { id: 'issue_type', label: 'Type of issue', placeholder: 'e.g. no heat, mold, pest infestation, broken plumbing' },
      { id: 'reported_date', label: 'Date first reported to landlord', placeholder: 'e.g. Oct 12, 2024' },
      { id: 'landlord_response', label: "Landlord's response", placeholder: 'e.g. ignored, promised fix, partially repaired' },
      { id: 'current_status', label: 'Current status', placeholder: 'e.g. still unresolved after 3 months' },
    ],
    gather: [
      'Photos of the condition (with timestamps)',
      'Written repair requests (emails, texts, certified letters)',
      "Landlord responses or documentation of non-response",
      'Health/code inspector reports if obtained',
      'Medical records if health was affected',
      'Lease agreement (habitability and repair clauses)',
    ],
    statute: 'ORC 5321.04 — landlord must maintain fit premises. ORC 5321.07 — after 30-day written notice, tenant may withhold rent or repair-and-deduct.',
  },
  {
    id: 'security-deposit',
    label: 'Security deposit dispute',
    description: 'Deposit not returned, or improper deductions made.',
    questions: [
      { id: 'deposit_amount', label: 'Deposit amount paid', placeholder: 'e.g. $1,200' },
      { id: 'move_in', label: 'Move-in date', placeholder: 'e.g. March 1, 2023' },
      { id: 'move_out', label: 'Vacated / tenancy ended', placeholder: 'e.g. Nov 30, 2024' },
      { id: 'deductions', label: 'Deductions claimed by landlord (if any)', placeholder: 'e.g. $800 cleaning, $200 paint' },
    ],
    gather: [
      'Lease agreement (deposit clause)',
      'Proof of deposit payment (check, money order, receipt)',
      'Move-in inspection report or photos',
      'Move-out inspection report or photos',
      'Itemized deduction statement from landlord (if sent)',
      'Documentation of forwarding address given to landlord',
    ],
    statute: 'ORC 5321.16 — landlord must return deposit within 30 days with itemized list. Failure = double deposit + attorney fees.',
  },
  {
    id: 'rent-increase',
    label: 'Rent increase validity',
    description: 'Increase given without proper notice or in violation of lease terms.',
    questions: [
      { id: 'current_rent', label: 'Current rent', placeholder: 'e.g. $850/month' },
      { id: 'new_rent', label: 'New rent demanded', placeholder: 'e.g. $1,100/month' },
      { id: 'notice_date', label: 'Date notice received', placeholder: 'e.g. Dec 1, 2024' },
      { id: 'notice_method', label: 'How was notice delivered?', placeholder: 'e.g. text message, letter taped to door' },
    ],
    gather: [
      'Original lease agreement',
      'Written rent increase notice',
      'Lease renewal document (if applicable)',
      'Payment history showing current rent amount',
    ],
    statute: 'Ohio has no rent control. Increase valid only at end of lease term with proper written notice per lease terms.',
  },
  {
    id: 'wrongful-eviction',
    label: 'Wrongful eviction',
    description: 'Eviction filing without legal grounds, or improper procedure used.',
    questions: [
      { id: 'notice_type', label: 'Type of notice received', placeholder: 'e.g. 3-day, 30-day, no-cause' },
      { id: 'notice_date', label: 'Date notice received', placeholder: 'e.g. Jan 10, 2025' },
      { id: 'grounds', label: 'Stated reason for eviction', placeholder: 'e.g. non-payment, lease violation, retaliation' },
      { id: 'payment_status', label: 'Are you current on rent?', placeholder: 'e.g. yes, paid through Feb with receipts' },
    ],
    gather: [
      'Written eviction notice',
      'Lease agreement',
      'Rent payment receipts (all recent months)',
      'Court summons (if eviction already filed)',
      'Written communications with landlord',
    ],
    statute: 'ORC 1923 — forcible entry and detainer. Landlord must follow exact statutory process. Any procedural defect = dismissal.',
  },
];

// ── Ohio library seeds ──────────────────────────────────────────────────────────

const OHIO_LIBRARY_SEEDS: LibraryItem[] = [
  { id: 'seed-orc-5321-02', name: 'ORC 5321.02 — Retaliatory conduct prohibited', type: 'Statute' },
  { id: 'seed-orc-5321-04', name: 'ORC 5321.04 — Landlord obligations (fit and habitable premises)', type: 'Statute' },
  { id: 'seed-orc-5321-07', name: 'ORC 5321.07 — Tenant remedies for landlord noncompliance (30-day notice)', type: 'Statute' },
  { id: 'seed-orc-5321-16', name: 'ORC 5321.16 — Security deposit rules (30-day return, double damages)', type: 'Statute' },
  { id: 'seed-orc-1923', name: 'ORC 1923 — Forcible entry and detainer (eviction procedure)', type: 'Statute' },
  { id: 'seed-trumbull-court', name: 'Trumbull County Municipal Court — Housing and Eviction Division', type: 'Reference' },
  { id: 'seed-warren-housing', name: 'Warren, OH City Code — Minimum Housing Standards', type: 'Ordinance' },
];

// ── Document templates ──────────────────────────────────────────────────────────

interface DocumentTemplate {
  id: string;
  label: string;
  description: string;
  fields: Array<{ id: string; label: string; placeholder: string; caseField?: string }>;
  generate: (f: Record<string, string>) => string;
}

const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: 'repair-demand',
    label: 'Repair Demand Letter',
    description: 'Certified mail notice required before rent withholding (ORC 5321.07)',
    fields: [
      { id: 'tenant_name', label: 'Your name', placeholder: 'Jane Doe', caseField: 'tenantName' },
      { id: 'tenant_address', label: 'Property address', placeholder: '123 Main St, Apt 2, Warren, OH 44481', caseField: 'address' },
      { id: 'landlord_name', label: 'Landlord name', placeholder: 'John Smith' },
      { id: 'landlord_address', label: 'Landlord mailing address', placeholder: '456 Oak Ave, Warren, OH 44481' },
      { id: 'issue', label: 'Condition(s) needing repair', placeholder: 'No heat since Nov 1; mold in bathroom ceiling' },
      { id: 'reported_date', label: 'Date first reported to landlord', placeholder: 'November 1, 2024' },
      { id: 'letter_date', label: "Today's date", placeholder: 'March 1, 2025' },
    ],
    generate: (f) => `${f.letter_date}

SENT VIA CERTIFIED MAIL — RETURN RECEIPT REQUESTED

${f.landlord_name}
${f.landlord_address}

RE: Notice to Remedy Conditions — ${f.tenant_address}

Dear ${f.landlord_name}:

I am a tenant residing at ${f.tenant_address}. I am writing to formally notify you of the following conditions that violate your obligations under Ohio Revised Code § 5321.04:

${f.issue}

I first reported this issue on ${f.reported_date}. To date, the condition remains unresolved.

Pursuant to ORC § 5321.07, this letter serves as written notice. If the condition is not remedied within thirty (30) days of receipt of this notice, I may exercise my legal remedies, which include depositing rent into court escrow, terminating the rental agreement, or pursuing damages.

Please address this matter immediately.

Sincerely,

${f.tenant_name}
${f.tenant_address}

[KEEP A COPY OF THIS LETTER AND YOUR CERTIFIED MAIL RECEIPT]`,
  },
  {
    id: 'deposit-demand',
    label: 'Security Deposit Demand Letter',
    description: 'Demand for return within 30 days — failure = double damages (ORC 5321.16)',
    fields: [
      { id: 'tenant_name', label: 'Your name', placeholder: 'Jane Doe', caseField: 'tenantName' },
      { id: 'forwarding_address', label: 'Your current (forwarding) address', placeholder: '789 New St, Warren, OH 44481' },
      { id: 'landlord_name', label: 'Landlord name', placeholder: 'John Smith' },
      { id: 'landlord_address', label: 'Landlord mailing address', placeholder: '456 Oak Ave, Warren, OH 44481' },
      { id: 'rental_address', label: 'Former rental address', placeholder: '123 Main St, Apt 2, Warren, OH 44481', caseField: 'address' },
      { id: 'move_out', label: 'Date tenancy ended / you vacated', placeholder: 'January 31, 2025' },
      { id: 'deposit_amount', label: 'Deposit amount paid', placeholder: '$1,200' },
      { id: 'letter_date', label: "Today's date", placeholder: 'March 1, 2025' },
    ],
    generate: (f) => `${f.letter_date}

SENT VIA CERTIFIED MAIL — RETURN RECEIPT REQUESTED

${f.landlord_name}
${f.landlord_address}

RE: Demand for Return of Security Deposit — ${f.rental_address}

Dear ${f.landlord_name}:

I was a tenant at ${f.rental_address}. My tenancy ended on ${f.move_out}, at which time I vacated and surrendered possession of the premises.

I paid a security deposit of ${f.deposit_amount}, which you continue to hold. My forwarding address is:

  ${f.tenant_name}
  ${f.forwarding_address}

Pursuant to Ohio Revised Code § 5321.16, you are required to return my deposit — with an itemized written statement of any deductions — within thirty (30) days of the termination of my tenancy.

Please return my deposit immediately. Be advised that failure to comply with ORC § 5321.16 entitles me to recover the amount wrongfully withheld PLUS damages equal to twice that amount, plus reasonable attorney's fees.

Sincerely,

${f.tenant_name}
${f.forwarding_address}`,
  },
  {
    id: 'habitability-complaint',
    label: 'Habitability Complaint to Inspector',
    description: 'Complaint to Warren code enforcement requesting official inspection',
    fields: [
      { id: 'tenant_name', label: 'Your name', placeholder: 'Jane Doe', caseField: 'tenantName' },
      { id: 'tenant_address', label: 'Property address', placeholder: '123 Main St, Apt 2, Warren, OH 44481', caseField: 'address' },
      { id: 'landlord_name', label: 'Landlord / property owner name', placeholder: 'John Smith' },
      { id: 'issue', label: 'Conditions to be inspected', placeholder: 'No heat since November; visible mold in bathroom; broken window' },
      { id: 'reported_date', label: 'Date reported to landlord', placeholder: 'November 1, 2024' },
      { id: 'letter_date', label: "Today's date", placeholder: 'March 1, 2025' },
    ],
    generate: (f) => `${f.letter_date}

City of Warren — Code Enforcement / Building & Housing Inspection
391 Mahoning Ave NW
Warren, OH 44483

RE: Request for Housing Inspection — ${f.tenant_address}

To Whom It May Concern:

I am a tenant residing at ${f.tenant_address}. I am writing to request an official housing inspection of this property, owned/managed by ${f.landlord_name}.

The following conditions exist which I believe violate Warren's minimum housing standards:

${f.issue}

I reported these conditions to my landlord on ${f.reported_date}. The landlord has failed to remedy the situation.

I respectfully request that an inspector visit the property as soon as possible and issue any applicable orders to the property owner.

Please contact me at the address above to schedule the inspection.

Respectfully,

${f.tenant_name}
${f.tenant_address}`,
  },
  {
    id: 'timeline-log',
    label: 'Case Timeline Log',
    description: 'Signed incident record formatted for court use',
    fields: [
      { id: 'tenant_name', label: 'Your name', placeholder: 'Jane Doe', caseField: 'tenantName' },
      { id: 'address', label: 'Rental address', placeholder: '123 Main St, Apt 2, Warren, OH 44481', caseField: 'address' },
      { id: 'landlord_name', label: 'Landlord name', placeholder: 'John Smith' },
      { id: 'tenancy_start', label: 'Tenancy start date', placeholder: 'March 1, 2023' },
      { id: 'events', label: 'Events (one per line: DATE — WHAT HAPPENED)', placeholder: 'Nov 1, 2024 — Reported broken heat via text\nNov 15, 2024 — No repair; followed up by text\nDec 1, 2024 — Still no heat; temp in unit 48°F' },
    ],
    generate: (f) => `CASE TIMELINE LOG
Prepared by: ${f.tenant_name}
Property: ${f.address}
Landlord: ${f.landlord_name}
Tenancy began: ${f.tenancy_start}
Prepared: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}

═══════════════════════════════════════════════════
CHRONOLOGICAL EVENTS:

${f.events.split('\n').filter((l: string) => l.trim()).map((line: string, i: number) => `${i + 1}. ${line.trim()}`).join('\n')}

═══════════════════════════════════════════════════

I declare under penalty of perjury that the foregoing is true and correct to the best of my knowledge.

Signed: _______________________   Date: ___________
${f.tenant_name}`,
  },
  {
    id: 'rent-escrow',
    label: 'Rent Escrow Notice',
    description: 'Notice of intent to deposit rent into court escrow (ORC 5321.07)',
    fields: [
      { id: 'tenant_name', label: 'Your name', placeholder: 'Jane Doe', caseField: 'tenantName' },
      { id: 'tenant_address', label: 'Property address', placeholder: '123 Main St, Apt 2, Warren, OH 44481', caseField: 'address' },
      { id: 'landlord_name', label: 'Landlord name', placeholder: 'John Smith' },
      { id: 'landlord_address', label: 'Landlord mailing address', placeholder: '456 Oak Ave, Warren, OH 44481' },
      { id: 'issue', label: 'The unresolved condition', placeholder: 'No heat since November 1, 2024' },
      { id: 'notice_date', label: 'Date your 30-day written notice was sent', placeholder: 'February 1, 2025' },
      { id: 'escrow_month', label: "Month's rent being escrowed", placeholder: 'March 2025' },
      { id: 'rent_amount', label: 'Monthly rent amount', placeholder: '$850' },
      { id: 'letter_date', label: "Today's date", placeholder: 'March 1, 2025' },
    ],
    generate: (f) => `${f.letter_date}

SENT VIA CERTIFIED MAIL — RETURN RECEIPT REQUESTED

${f.landlord_name}
${f.landlord_address}

RE: Notice of Rent Deposit into Court Escrow — ${f.tenant_address}

Dear ${f.landlord_name}:

I am a tenant at ${f.tenant_address}. This letter notifies you that I have deposited my ${f.escrow_month} rent of ${f.rent_amount} into the Trumbull County Municipal Court escrow, pursuant to Ohio Revised Code § 5321.07(B).

Background: On ${f.notice_date}, I provided you with written notice of the following unresolved condition at the rental property:

${f.issue}

More than thirty (30) days have elapsed since that notice. You have failed to remedy the condition. I am therefore exercising my right under ORC § 5321.07(B) to deposit rent with the court clerk rather than pay it to you directly.

The court will hold the funds until this matter is resolved. You may petition the court for release of escrowed rent after demonstrating compliance.

Sincerely,

${f.tenant_name}
${f.tenant_address}

[ATTACH: Copy of original repair demand letter and certified mail receipt]`,
  },
];

function loadLibrary(): LibraryItem[] {
  try {
    return JSON.parse(localStorage.getItem(LIB_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveLibrary(items: LibraryItem[]): void {
  localStorage.setItem(LIB_KEY, JSON.stringify(items));
}

function inferType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    pdf: 'PDF',
    docx: 'DOCX',
    doc: 'DOC',
    txt: 'TXT',
    csv: 'CSV',
    xml: 'XML',
    jpg: 'Image',
    jpeg: 'Image',
    png: 'Image',
    heic: 'Image',
    webp: 'Image',
    md: 'Markdown',
  };
  return map[ext] ?? (ext.toUpperCase() || 'File');
}

// ── Navigation ─────────────────────────────────────────────────────────────────

const SCREENS = ['screen-home', 'screen-brief', 'screen-library', 'screen-settings'];

let _prevScreen: string | null = null;
let _undoNavTimer: ReturnType<typeof setTimeout> | null = null;
let _toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(msg: string, duration = 2000): void {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.style.cssText = 'position:fixed;bottom:70px;right:16px;background:#1a1a1a;color:#e8e8e8;font-size:11px;padding:6px 14px;border-radius:3px;z-index:9998;pointer-events:none;opacity:0;transition:opacity 0.15s;border:1px solid #333';
    document.body.appendChild(toast);
  }
  if (_toastTimer) clearTimeout(_toastTimer);
  toast.textContent = msg;
  toast.style.opacity = '1';
  _toastTimer = setTimeout(() => {
    toast!.style.opacity = '0';
  }, duration);
}

function showResumeBadge(): void {
  const badge = document.getElementById('resume-badge')!;
  badge.style.display = '';
  badge.style.opacity = '1';
  setTimeout(() => {
    badge.style.opacity = '0';
    setTimeout(() => { badge.style.display = 'none'; }, 300);
  }, 2500);
}

function showUndoNav(label: string): void {
  let el = document.getElementById('undo-nav-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'undo-nav-toast';
    el.style.cssText = 'position:fixed;bottom:70px;left:50%;transform:translateX(-50%);background:#1a1a1a;color:#e8e8e8;font-size:11px;padding:5px 14px;border-radius:3px;z-index:9997;display:flex;align-items:center;gap:10px;border:1px solid #333;opacity:0;transition:opacity 0.15s';
    document.body.appendChild(el);
  }
  if (_undoNavTimer) clearTimeout(_undoNavTimer);
  el.innerHTML = `${esc(label)} <button id="undo-nav-btn" type="button" style="background:none;border:none;color:#4a90d9;cursor:pointer;font-size:11px;padding:0;font-family:inherit">↩ Undo</button>`;
  el.style.opacity = '1';
  document.getElementById('undo-nav-btn')?.addEventListener('click', () => {
    if (_prevScreen && currentCase) {
      showScreen('screen-brief');
    }
    el!.style.opacity = '0';
  });
  _undoNavTimer = setTimeout(() => { el!.style.opacity = '0'; }, 4000);
}

function showCanvasFilter(filter: string): void {
  document.querySelectorAll('.cf-btn').forEach((btn) => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.filter === filter);
  });
  document.querySelectorAll('.canvas-panel').forEach((panel) => {
    panel.classList.remove('active');
  });
  const panelMap: Record<string, string> = {
    all: 'panel-all',
    timeline: 'panel-timeline',
    review: 'panel-review',
    sources: 'panel-sources',
    gaps: 'panel-gaps',
  };
  const panelId = panelMap[filter] ?? 'panel-all';
  document.getElementById(panelId)?.classList.add('active');
  // Save to sessionStorage for resumability
  if (currentCase) {
    sessionStorage.setItem(`case.${currentCase.id}.filter`, filter);
  }
}

function showScreen(id: string): void {
  const prev = document.querySelector('.screen.active')?.id ?? null;
  for (const sid of SCREENS) {
    const el = document.getElementById(sid)!;
    el.classList.toggle('active', sid === id);
  }

  // Update dock nav active state
  document.querySelectorAll('.dock__item[data-screen]').forEach((btn) => {
    const screen = (btn as HTMLElement).dataset.screen ?? '';
    const targetId = screen === 'home' ? 'screen-home'
      : screen === 'library' ? 'screen-library'
      : screen === 'settings' ? 'screen-settings'
      : '';
    btn.classList.toggle('active', targetId === id);
  });

  // Update contextual tools
  updateDockContext(id);

  // Undo navigation toast
  if (prev && prev !== id && prev === 'screen-brief') {
    _prevScreen = prev;
    showUndoNav('Back to case');
  }
}

function updateDockContext(screenId: string): void {
  const tools = document.getElementById('dock-tools');
  if (!tools) return;

  if (screenId === 'screen-home') {
    tools.innerHTML = `
      <button class="dock__item" id="dock-multiselect" type="button" data-tip="Select multiple cases">☐</button>
      <button class="dock__item" id="dock-delete-mode" type="button" data-tip="Show safely deletable cases">⚠</button>
      <button class="dock__item" id="dock-msg-btn" type="button" data-tip="Import messages">✉</button>
    `;
    document.getElementById('dock-multiselect')?.addEventListener('click', toggleMultiselect);
    document.getElementById('dock-delete-mode')?.addEventListener('click', toggleDeleteMode);
    document.getElementById('dock-msg-btn')?.addEventListener('click', () => {
      const panel = document.getElementById('message-import-panel')!;
      panel.style.display = panel.style.display === 'none' ? '' : 'none';
      const canvas = document.getElementById('home-canvas');
      if (panel.style.display !== 'none') canvas?.scrollTo({ top: canvas.scrollHeight, behavior: 'smooth' });
    });
  } else if (screenId === 'screen-brief') {
    tools.innerHTML = `
      <button class="dock__item" id="dock-consult" type="button" data-tip="Consult mode">▶</button>
      <button class="dock__item" id="dock-export" type="button" data-tip="Export case">⬇</button>
      <button class="dock__item" id="dock-share" type="button" data-tip="Share lawyer summary">⤴</button>
    `;
    document.getElementById('dock-consult')?.addEventListener('click', openConsult);
    document.getElementById('dock-export')?.addEventListener('click', () => exportCurrentCase('fullCase'));
    document.getElementById('dock-share')?.addEventListener('click', () => exportCurrentCase('lawyerSummary'));
  } else if (screenId === 'screen-library') {
    tools.innerHTML = `
      <button class="dock__item" id="dock-add-link" type="button" data-tip="Add link to library">🔗</button>
      <label class="dock__item" data-tip="Add document to library" style="display:flex;align-items:center;justify-content:center;cursor:pointer">
        +
        <input type="file" id="dock-lib-input" multiple hidden />
      </label>
    `;
    document.getElementById('dock-add-link')?.addEventListener('click', showAddLinkModal);
    document.getElementById('dock-lib-input')?.addEventListener('change', (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;
      const library = loadLibrary();
      Array.from(files).forEach((file) => {
        library.push({ id: crypto.randomUUID(), name: file.name, type: inferType(file.name) });
      });
      saveLibrary(library);
      renderLibrary();
      updateLibraryMeta();
      (e.target as HTMLInputElement).value = '';
    });
  } else {
    tools.innerHTML = '';
  }
}

// ── Home screen ────────────────────────────────────────────────────────────────

async function loadHome(): Promise<void> {
  allCases = await repo.listCases();
  renderCaseList();
  updateLibraryMeta();
}

function renderCaseList(): void {
  const list = document.getElementById('case-list')!;
  const empty = document.getElementById('case-list-empty')!;

  if (allCases.length === 0) {
    list.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';
  list.innerHTML = allCases.map((c) => caseRowHTML(c)).join('');

  // Attach click handlers for row expansion
  list.querySelectorAll('.case-row[data-case-id]').forEach((row) => {
    const header = row.querySelector('.case-row__header');
    header?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      // Don't toggle if clicking a button inside header
      if (target.closest('button')) return;
      const id = (row as HTMLElement).dataset.caseId!;

      if (_multiselect) {
        // In multiselect mode, toggle selection
        if (_selectedCaseIds.has(id)) {
          _selectedCaseIds.delete(id);
          row.classList.remove('selected');
        } else {
          _selectedCaseIds.add(id);
          row.classList.add('selected');
        }
        return;
      }

      if (_deleteMode) {
        // In delete mode, clicking a highlighted row deletes it
        const c = allCases.find((x) => x.id === id);
        const gaps = detectGaps(c!);
        const safeToDelete = c!.evidence.length === 0 || gaps.length === 0;
        if (safeToDelete) {
          showConfirm(`Delete "${c?.title ?? id}"?`, 'All evidence and documents in this case will be removed. This cannot be undone.').then(async (ok) => {
            if (!ok) return;
            await repo.deleteCase(id);
            showToast('Case deleted');
            await loadHome();
          });
        }
        return;
      }

      row.classList.toggle('expanded');
    });
  });

  // Open Full Brief buttons
  list.querySelectorAll('.case-row__action-btn--open').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.caseId!;
      openCase(id);
    });
  });

  // Delete case buttons (in expanded panel)
  list.querySelectorAll('.case-row__action-btn--delete').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.caseId!;
      const c = allCases.find((x) => x.id === id);
      if (!await showConfirm(`Delete "${c?.title ?? id}"?`, 'All evidence and documents in this case will be removed. This cannot be undone.')) return;
      await repo.deleteCase(id);
      showToast('Case deleted');
      await loadHome();
    });
  });

  // Add files to case
  list.querySelectorAll('.case-row__add-files-input').forEach((input) => {
    input.addEventListener('change', async (e) => {
      const caseId = (input as HTMLElement).dataset.caseId!;
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        await routeFilesToCase(Array.from(files), caseId);
      }
      (e.target as HTMLInputElement).value = '';
    });
  });

  // Apply delete mode styling
  if (_deleteMode) {
    list.querySelectorAll('.case-row[data-case-id]').forEach((row) => {
      const id = (row as HTMLElement).dataset.caseId!;
      const c = allCases.find((x) => x.id === id);
      if (!c) return;
      const gaps = detectGaps(c);
      const safeToDelete = c.evidence.length === 0 || gaps.length === 0;
      if (safeToDelete) row.classList.add('case-row--safe-delete');
    });
  }
}

function caseRowHTML(c: Case): string {
  const gaps = detectGaps(c);
  const statusClass = c.status === 'gaps' || gaps.length > 0 ? 'status--gaps' : 'status--ready';
  const statusText = gaps.length > 0 ? `${gaps.length} gap${gaps.length !== 1 ? 's' : ''}` : 'ready';
  const categorySet = new Set(c.evidence.map((e) => e.category).filter(Boolean));
  const cats = Array.from(categorySet).slice(0, 4).join(', ') || '—';
  const meta = `${c.evidence.length} item${c.evidence.length !== 1 ? 's' : ''} · ${cats}`;
  const summary = c.property?.address
    ? `Tenant at ${c.property.address}${c.property.unit ? ', ' + c.property.unit : ''}.`
    : `${c.evidence.length} evidence items · ${c.messages.length} message${c.messages.length !== 1 ? 's' : ''}.`;

  return `<div class="case-row" data-case-id="${esc(c.id)}">
    <div class="case-row__header">
      <span class="case-row__expand-icon">▸</span>
      <div class="case-row__body">
        <div class="case-row__name">${esc(c.title)}</div>
        <div class="case-row__meta">${esc(meta)}</div>
      </div>
      <span class="case-row__gaps-badge ${statusClass}">${esc(statusText)}</span>
    </div>
    <div class="case-row__panel">
      <div class="case-row__summary">${esc(summary)}</div>
      <div class="case-row__actions">
        <label class="case-row__action-btn" data-tip="Add files to this case" style="cursor:pointer">
          Add Files
          <input type="file" class="case-row__add-files-input" data-case-id="${esc(c.id)}" multiple hidden />
        </label>
        <button class="case-row__action-btn case-row__action-btn--open" data-case-id="${esc(c.id)}" type="button">Open Full Brief →</button>
        <button class="case-row__action-btn case-row__action-btn--delete" data-case-id="${esc(c.id)}" type="button" data-tip="Delete case">Delete</button>
      </div>
    </div>
  </div>`;
}

function updateLibraryMeta(): void {
  const items = loadLibrary();
  const meta = document.getElementById('library-meta');
  const badge = document.getElementById('library-count-badge');
  const count = items.length;
  if (meta) meta.textContent = count === 0
    ? 'Tenant rights, ordinances, templates, correspondence'
    : `${count} document${count !== 1 ? 's' : ''} · tenant rights, ordinances, templates`;
  if (badge) badge.textContent = count > 0 ? String(count) : '─';
}

function toggleMultiselect(): void {
  _multiselect = !_multiselect;
  _selectedCaseIds.clear();
  if (!_multiselect) {
    document.querySelectorAll('.case-row.selected').forEach((r) => r.classList.remove('selected'));
    document.querySelectorAll('.case-row--selectable').forEach((r) => r.classList.remove('case-row--selectable'));
  } else {
    _deleteMode = false;
    document.querySelectorAll('.case-row[data-case-id]').forEach((r) => r.classList.add('case-row--selectable'));
  }
  const btn = document.getElementById('dock-multiselect');
  if (btn) btn.style.background = _multiselect ? '#e8e8e8' : '';
  showToast(_multiselect ? 'Multiselect on — tap cases to select' : 'Multiselect off');
}

function toggleDeleteMode(): void {
  _deleteMode = !_deleteMode;
  _multiselect = false;
  _selectedCaseIds.clear();
  renderCaseList();
  const btn = document.getElementById('dock-delete-mode');
  if (btn) btn.style.background = _deleteMode ? '#ffe0e0' : '';
  if (_deleteMode) showToast('Delete mode — highlighted cases are safely deletable');
  else showToast('Delete mode off');
}

async function routeFilesToCase(files: File[], caseId: string): Promise<void> {
  const csvXml = files.filter(f => /\.(csv|xml)$/i.test(f.name));
  const others = files.filter(f => !/\.(csv|xml)$/i.test(f.name));
  for (const f of csvXml) {
    await handleMessageImport(f);
  }
  if (others.length > 0) {
    // Load the target case, save evidence to it
    const targetCase = await repo.loadCase(caseId);
    if (!targetCase) return;
    const prevCurrent = currentCase;
    currentCase = targetCase;
    await handleFiles(others, 'upload');
    if (!prevCurrent) currentCase = null;
  }
}

function seedLibraryDefaults(): void {
  const existing = loadLibrary();
  const seededIds = new Set(existing.map((i) => i.id));
  const toAdd = OHIO_LIBRARY_SEEDS.filter((s) => !seededIds.has(s.id));
  if (toAdd.length === 0) return;
  saveLibrary([...existing, ...toAdd]);
}

// ── Case Brief ─────────────────────────────────────────────────────────────────

async function openCase(caseId: string): Promise<void> {
  const c = await repo.loadCase(caseId);
  if (!c) return;
  currentCase = c;
  renderBrief(c);
  showScreen('screen-brief');
  // Save current case to sessionStorage for resumability
  sessionStorage.setItem('last.caseId', c.id);
  sessionStorage.setItem('last.screen', 'brief');
}

async function reprocessPhotos(c: Case): Promise<void> {
  const photoItems = c.evidence.filter((ev) => ev.category === 'photo' || ev.requiresUserReview);
  if (photoItems.length === 0) {
    alert('No photos to re-process.');
    return;
  }

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

      const fileBase = file.name.replace(/\.[^.]+$/, '').toLowerCase();
      const fileName = file.name.toLowerCase();
      const filePath = ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name).toLowerCase();
      const ev = photoItems.find((e) => {
        if (e.sourceFile && e.sourceFile.toLowerCase() === filePath) return true;
        const stored = e.title.toLowerCase();
        return stored === fileBase || stored === fileName;
      });
      if (!ev) continue;

      try {
        const ocrService = buildOcrService();
        const ocrResult = await ocrService.extractText(file);
        const reclassified = classifyFromContent(ocrResult.text);
        const exifDate = await extractExifDate(file);
        const thumb = await generateThumbnail(file);
        const sourceName = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;

        const updatedEv = {
          ...ev,
          body: ocrResult.text,
          requiresUserReview: ocrResult.text.trim().length < 50,
          category: reclassified?.category ?? ev.category,
          title: reclassified?.label ?? ev.title,
          dateTime: exifDate ?? ev.dateTime,
          sourceFile: ev.sourceFile ?? sourceName,
          ...(thumb ? { thumbnail: thumb } : {}),
          provenance: { ...ev.provenance, tier: ocrResult.tier, extractedAt: new Date() }
        };

        await repo.saveEvidence(c.id, [updatedEv]);
        updated++;
      } catch {
        // Skip files that fail; continue with others
      }
    }

    statusEl.textContent = `Re-processed ${updated} item${updated !== 1 ? 's' : ''}.`;
    showToast(`Re-processed ${updated} item${updated !== 1 ? 's' : ''}`);
    setTimeout(() => { statusEl.textContent = ''; }, 3000);
    await openCase(c.id);
  };

  input.click();
}

function renderBrief(c: Case): void {
  // Topbar — click title to rename
  const titleEl = document.getElementById('brief-title')!;
  titleEl.textContent = c.title;
  titleEl.title = 'Click to rename';
  titleEl.style.cursor = 'text';
  titleEl.onclick = () => {
    if (titleEl.querySelector('input')) return; // already editing
    const input = document.createElement('input');
    input.value = c.title;
    input.style.cssText = 'background:transparent;border:none;border-bottom:1px solid #4a90d9;color:inherit;font:inherit;width:100%;min-width:80px;outline:none;padding:0';
    titleEl.textContent = '';
    titleEl.appendChild(input);
    input.focus();
    input.select();
    const save = async () => {
      const newTitle = input.value.trim() || c.title;
      c.title = newTitle;
      titleEl.textContent = newTitle;
      await repo.saveCase(c);
      allCases = await repo.listCases();
    };
    input.onblur = save;
    input.onkeydown = (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') { titleEl.textContent = c.title; }
    };
  };
  const gaps = detectGaps(c);
  const statusBadge = document.getElementById('brief-status-badge')!;
  statusBadge.textContent = gaps.length > 0 ? `${gaps.length} gaps` : 'ready';
  statusBadge.className = 'detail-status ' + (gaps.length > 0 ? 'status--gaps' : 'status--ready');

  // Banner — show if case was auto-processed
  const banner = document.getElementById('brief-banner')!;
  banner.style.display = c.source && c.source !== 'manual' ? '' : 'none';

  // Summary
  const summaryEl = document.getElementById('brief-summary-text')!;
  if (c.property?.address) {
    summaryEl.textContent = `Tenant at ${c.property.address}${c.property.unit ? ', ' + c.property.unit : ''} — ${c.evidence.length} evidence items.`;
  } else {
    summaryEl.textContent = `${c.title} — ${c.evidence.length} evidence item${c.evidence.length !== 1 ? 's' : ''}, ${c.messages.length} message${c.messages.length !== 1 ? 's' : ''}.`;
  }

  // Jurisdiction
  const jurInput = document.getElementById('brief-jurisdiction') as HTMLInputElement;
  jurInput.value = c.property?.jurisdiction ?? localStorage.getItem(JURISDICTION_KEY) ?? '';
  jurInput.onchange = () => saveCaseField(c.id, 'jurisdiction', jurInput.value);

  // Claims
  renderBriefClaims(c);

  // Client goal
  const goalEl = document.getElementById('brief-client-goal') as HTMLTextAreaElement;
  goalEl.value = c.clientGoal ?? '';
  goalEl.onchange = () => saveCaseField(c.id, 'clientGoal', goalEl.value);

  // Goal builder
  const goalBuilderBtn = document.getElementById('btn-goal-builder');
  const goalBuilderDiv = document.getElementById('brief-goal-builder')!;
  if (goalBuilderBtn) {
    goalBuilderBtn.onclick = () => {
      const isOpen = goalBuilderDiv.style.display !== 'none';
      if (isOpen) {
        goalBuilderDiv.style.display = 'none';
        goalBuilderBtn.textContent = 'Build ↗';
        return;
      }
      goalBuilderDiv.style.display = '';
      goalBuilderBtn.textContent = 'Close ↙';

      const gaps = detectGaps(c);
      const gapNames = gaps.map(g => g.displayName).join(', ') || 'no specific gaps identified';
      const address = c.property?.address || 'the rental property';
      const tenant = c.parties?.tenant || localStorage.getItem(TENANT_NAME_KEY) || 'the tenant';
      const evCount = c.evidence.length;

      goalBuilderDiv.innerHTML = `
        <div style="background:#f9f9f9;border:1px solid #e0e0e0;padding:12px;margin-top:8px">
          <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#aaa;margin-bottom:8px">Goal Builder</div>
          <div style="font-size:11px;color:#666;margin-bottom:10px;line-height:1.6">Answer these to assemble a goal statement from your case context.</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <div>
              <label style="font-size:10px;color:#888;display:block;margin-bottom:3px">Desired outcome</label>
              <select id="gb-outcome" style="width:100%;font-family:inherit;font-size:12px;border:1px solid #ddd;padding:5px 7px;background:#fff;outline:none;color:#111">
                <option value="resolve the dispute">Resolve the dispute fairly</option>
                <option value="recover security deposit">Recover withheld security deposit</option>
                <option value="stop unlawful eviction">Stop an unlawful eviction</option>
                <option value="reduce rent increase">Challenge an illegal rent increase</option>
                <option value="force repairs">Compel landlord to make required repairs</option>
                <option value="document for court">Document the case for small claims / housing court</option>
              </select>
            </div>
            <div>
              <label style="font-size:10px;color:#888;display:block;margin-bottom:3px">Timeline urgency</label>
              <select id="gb-urgency" style="width:100%;font-family:inherit;font-size:12px;border:1px solid #ddd;padding:5px 7px;background:#fff;outline:none;color:#111">
                <option value="as soon as possible">As soon as possible</option>
                <option value="within 30 days">Within 30 days</option>
                <option value="before next court date">Before next court date</option>
                <option value="before lease expiration">Before lease expiration</option>
              </select>
            </div>
            <div>
              <label style="font-size:10px;color:#888;display:block;margin-bottom:3px">Primary concern in one sentence (optional)</label>
              <input id="gb-concern" type="text" placeholder="e.g. landlord refused repairs for 6 months" style="width:100%;font-family:inherit;font-size:12px;border:1px solid #ddd;padding:5px 7px;background:#fff;outline:none;color:#111;box-sizing:border-box" />
            </div>
            <button id="gb-assemble" type="button" style="font-family:inherit;font-size:11px;background:#111;color:#fff;border:none;padding:8px;cursor:pointer;letter-spacing:0.06em;margin-top:4px">Assemble Goal Statement</button>
          </div>
        </div>`;

      document.getElementById('gb-assemble')?.addEventListener('click', () => {
        const outcome = (document.getElementById('gb-outcome') as HTMLSelectElement).value;
        const urgency = (document.getElementById('gb-urgency') as HTMLSelectElement).value;
        const concern = (document.getElementById('gb-concern') as HTMLInputElement).value.trim();
        const concernClause = concern ? ` The main concern is: ${concern}.` : '';
        const gapClause = gaps.length > 0 ? ` Outstanding issues include: ${gapNames}.` : '';
        const assembled = `${tenant} at ${address} seeks to ${outcome} ${urgency}, with ${evCount} evidence item${evCount !== 1 ? 's' : ''} supporting the case.${concernClause}${gapClause}`;
        goalEl.value = assembled;
        saveCaseField(c.id, 'clientGoal', assembled);
        goalBuilderDiv.style.display = 'none';
        goalBuilderBtn!.textContent = 'Build ↗';
        showToast('Goal statement assembled');
      });
    };
  }

  // Timeline
  renderBriefTimeline(c);

  // Key facts
  renderKeyFacts(c);

  // Gaps
  renderBriefGaps(c, gaps);

  // Library refs
  renderLibraryRefs(c);

  // Source files
  renderSourceFiles(c);
  renderNeedsReview(c);

  // Re-process button
  const reprocessBtn = document.getElementById('btn-reprocess');
  if (reprocessBtn) {
    reprocessBtn.onclick = () => reprocessPhotos(c);
  }

  // Brief statusbar meta
  const exportMeta = document.getElementById('brief-export-meta')!;
  exportMeta.textContent = `${c.evidence.length} item${c.evidence.length !== 1 ? 's' : ''} · ${gaps.length} gap${gaps.length !== 1 ? 's' : ''}`;

  // Consult case label
  const consultLabel = document.getElementById('consult-case-label')!;
  consultLabel.textContent = c.title;

  // Restore saved filter for resumability
  const savedFilter = currentCase ? sessionStorage.getItem(`case.${currentCase.id}.filter`) ?? 'all' : 'all';
  showCanvasFilter(savedFilter);
}

async function saveCaseField(caseId: string, field: string, value: string): Promise<void> {
  const c = await repo.loadCase(caseId);
  if (!c) return;
  if (field === 'clientGoal') {
    c.clientGoal = value;
  } else if (field === 'jurisdiction') {
    if (!c.property) c.property = { address: '', unit: '', jurisdiction: '' };
    c.property.jurisdiction = value;
    localStorage.setItem(JURISDICTION_KEY, value);
  }
  await repo.saveCase(c);
  currentCase = c;
}

function renderBriefClaims(c: Case): void {
  const list = document.getElementById('brief-claims-list')!;
  const empty = document.getElementById('brief-claims-empty')!;

  if (c.claims.length === 0) {
    list.innerHTML = '';
    empty.innerHTML = `
      <strong>Add a discussion topic</strong>
      <p style="margin:4px 0 10px;color:#999;font-size:11px">Select an issue type below to add context and see what to gather, or type a custom topic.</p>
      <div class="archetype-grid" id="archetype-grid">
        ${TOPIC_ARCHETYPES.map((a) => `
          <button class="archetype-chip" data-archetype="${esc(a.id)}" type="button">${esc(a.label)}</button>
        `).join('')}
      </div>
      <div id="archetype-intake-area"></div>
      <div class="claims-add-row" style="margin-top:10px">
        <input class="claims-add-input" id="claims-add-input" type="text" placeholder="Or type a custom topic…" />
        <button class="claims-add-btn" id="claims-add-btn" type="button">Add</button>
      </div>`;
    empty.style.display = '';

    // Wire up archetype chip clicks
    empty.querySelectorAll('.archetype-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const archetypeId = (btn as HTMLElement).dataset.archetype ?? '';
        showArchetypeIntake(archetypeId, c);
        empty.querySelectorAll('.archetype-chip').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Wire up custom add button
    const addInput = document.getElementById('claims-add-input') as HTMLInputElement;
    const addBtn = document.getElementById('claims-add-btn');
    const doAdd = async () => {
      const topic = addInput?.value.trim();
      if (!topic) return;
      await addClaim(c, topic, '');
    };
    addBtn?.addEventListener('click', doAdd);
    addInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = c.claims.map((cl) => `
    <div class="claim-card">
      <div class="claim-card__header">
        <div class="claim-card__title">${esc(cl.title)}</div>
        <button class="claim-card__remove" data-claim-id="${esc(cl.id)}" type="button" title="Remove topic">×</button>
      </div>
      ${cl.description ? `<div class="claim-card__desc">${esc(cl.description)}</div>` : ''}
      <span class="claim-card__status claim-status--${cl.status}">${esc(cl.status)}</span>
    </div>
  `).join('');

  // Wire up remove buttons
  list.querySelectorAll('.claim-card__remove').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const claimId = (btn as HTMLElement).dataset.claimId!;
      const updated = await repo.loadCase(c.id);
      if (!updated) return;
      updated.claims = updated.claims.filter((cl) => cl.id !== claimId);
      await repo.saveCase(updated);
      currentCase = updated;
      renderBriefClaims(updated);
      showToast('Topic removed');
    });
  });

  // Always show add-more row below existing claims
  const addMore = document.createElement('div');
  addMore.style.cssText = 'margin-top:8px';
  addMore.innerHTML = `
    <div class="archetype-grid" id="archetype-grid-more">
      ${TOPIC_ARCHETYPES.map((a) => `
        <button class="archetype-chip" data-archetype="${esc(a.id)}" type="button">${esc(a.label)}</button>
      `).join('')}
    </div>
    <div id="archetype-intake-area"></div>
    <div class="claims-add-row" style="margin-top:8px">
      <input class="claims-add-input" id="claims-add-input" type="text" placeholder="Or type a custom topic…" />
      <button class="claims-add-btn" id="claims-add-btn" type="button">Add</button>
    </div>`;
  list.appendChild(addMore);

  addMore.querySelectorAll('.archetype-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const archetypeId = (btn as HTMLElement).dataset.archetype ?? '';
      showArchetypeIntake(archetypeId, c);
      addMore.querySelectorAll('.archetype-chip').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  const addInput2 = addMore.querySelector('#claims-add-input') as HTMLInputElement;
  const addBtn2 = addMore.querySelector('#claims-add-btn');
  addBtn2?.addEventListener('click', async () => {
    const topic = addInput2?.value.trim();
    if (!topic) return;
    await addClaim(c, topic, '');
  });
  addInput2?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { addBtn2?.dispatchEvent(new Event('click')); } });
}

function showArchetypeIntake(archetypeId: string, c: Case): void {
  const archetype = TOPIC_ARCHETYPES.find((a) => a.id === archetypeId);
  const area = document.getElementById('archetype-intake-area');
  if (!archetype || !area) return;

  area.innerHTML = `
    <div class="archetype-intake">
      <div class="archetype-intake__title">${esc(archetype.label)}</div>
      <div class="archetype-intake__desc">${esc(archetype.description)}</div>
      <div class="archetype-intake__statute">${esc(archetype.statute)}</div>
      <div class="intake-questions">
        ${archetype.questions.map((q) => `
          <div class="intake-question">
            <label class="intake-question__label">${esc(q.label)}</label>
            <input class="intake-question__input" id="iq-${esc(q.id)}" type="text" placeholder="${esc(q.placeholder)}" autocomplete="off" />
          </div>
        `).join('')}
      </div>
      <div class="gather-section">
        <div class="gather-section__title">What to gather for this topic:</div>
        <ul class="gather-list">
          ${archetype.gather.map((item) => `<li class="gather-item"><span class="gather-check">☐</span> ${esc(item)}</li>`).join('')}
        </ul>
      </div>
      <div class="intake-actions">
        <button class="intake-submit-btn" type="button">Add topic</button>
        <button class="intake-cancel-btn" type="button">Cancel</button>
      </div>
    </div>`;

  area.querySelector('.intake-submit-btn')!.addEventListener('click', async () => {
    const answers = archetype.questions.map((q) => {
      const val = (area.querySelector(`#iq-${q.id}`) as HTMLInputElement)?.value.trim();
      return val ? `${q.label}: ${val}` : '';
    }).filter(Boolean);
    const description = answers.join(' · ');
    await addClaim(c, archetype.label, description);
  });

  area.querySelector('.intake-cancel-btn')!.addEventListener('click', () => {
    area.innerHTML = '';
    document.querySelectorAll('.archetype-chip').forEach((b) => b.classList.remove('active'));
  });

  area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function addClaim(c: Case, title: string, description: string): Promise<void> {
  const newClaim = {
    id: crypto.randomUUID(),
    title,
    description,
    status: 'researching' as const,
    confidence: 'low' as const,
    relatedEvidenceIds: [],
    relatedLegalNoteIds: [],
    questions: [],
  };
  const updated = await repo.loadCase(c.id);
  if (!updated) return;
  updated.claims = [...updated.claims, newClaim];
  await repo.saveCase(updated);
  currentCase = updated;
  renderBriefClaims(updated);
  showToast('Topic added');
}

function renderBriefTimeline(c: Case): void {
  const container = document.getElementById('brief-timeline')!;
  const empty = document.getElementById('brief-timeline-empty')!;
  const timeline: TimelineItem[] = buildTimeline(c.evidence, c.messages);

  if (timeline.length === 0) {
    container.innerHTML = '';
    empty.style.display = '';
    empty.textContent = 'No dated items yet. Add dates to evidence to build a timeline.';
    return;
  }
  empty.style.display = 'none';
  container.innerHTML = timeline.slice(0, 20).map((item) => {
    const date = isFinite(item.dateTime.getTime())
      ? item.dateTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—';
    const title = item.kind === 'evidence' ? item.title : `Message: ${item.body.slice(0, 60)}`;
    const tag = item.kind === 'evidence' ? (item.category ?? '—') : 'message';
    return `<div class="timeline-row">
      <div class="timeline-dot"></div>
      <div class="timeline-date">${esc(date)}</div>
      <div class="timeline-event">${esc(title)}</div>
      <div class="timeline-tag">${esc(tag)}</div>
    </div>`;
  }).join('');
}

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
      const ev = c.evidence.find((x) => x.id === evId);
      if (!ev) return;

      // Toggle drawer
      const existing = document.getElementById('fact-source-drawer');
      if (existing && existing.dataset.evId === evId) {
        existing.remove();
        return;
      }
      existing?.remove();

      const date = isFinite(ev.dateTime.getTime())
        ? ev.dateTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'No date';
      const bodyPreview = ev.body.slice(0, 400) + (ev.body.length > 400 ? '…' : '');
      // Highlight the dollar amount in the preview
      const highlighted = bodyPreview.replace(
        /\$[\d,]+(\.\d{2})?/g,
        (m) => `<mark style="background:#fff3b0;padding:0 1px">${m}</mark>`
      );
      const thumbHTML = ev.thumbnail
        ? `<img src="${ev.thumbnail}" style="width:60px;height:60px;object-fit:cover;border:1px solid #ddd;margin-right:10px;flex-shrink:0" alt="" />`
        : '';

      const drawer = document.createElement('div');
      drawer.id = 'fact-source-drawer';
      drawer.dataset.evId = evId;
      drawer.className = 'fact-source-drawer';
      drawer.innerHTML = `
        <div class="fsd-header">
          <div style="display:flex;align-items:center">
            ${thumbHTML}
            <div>
              <div style="font-size:12px;font-weight:500;color:#111">${esc(ev.title)}</div>
              <div style="font-size:10px;color:#888;margin-top:2px">${esc(ev.category ?? '—')} · ${esc(date)}</div>
            </div>
          </div>
          <button class="fsd-close" type="button">×</button>
        </div>
        <div class="fsd-body">${highlighted || '<em style="color:#bbb">No text extracted.</em>'}</div>
        <div class="fsd-footer">
          <button class="fsd-edit" data-ev-id="${esc(evId)}" type="button">Edit ✏</button>
        </div>
      `;

      btn.after(drawer);
      drawer.querySelector('.fsd-close')!.addEventListener('click', () => drawer.remove());
      drawer.querySelector('.fsd-edit')!.addEventListener('click', () => {
        showEvidenceEditForm(ev, c.id);
        drawer.remove();
      });
    });
  });
}

function renderBriefGaps(c: Case, gaps: Gap[]): void {
  const list = document.getElementById('brief-gaps-list')!;
  const empty = document.getElementById('brief-gaps-empty')!;
  if (gaps.length === 0) {
    list.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  const gapDetails: Record<string, { looks: string; found: string }> = {
    'gap.missingLease': {
      looks: 'A file categorized as "lease" or "amendment" — typically a PDF or DOCX with words like "lease", "rental agreement", or "tenant" in the filename or content.',
      found: c.evidence.filter(e => e.category === 'lease' || e.category === 'amendment').length + ' lease/amendment item(s) found'
    },
    'gap.missingPaymentRecord': {
      looks: 'A file categorized as "payment" — typically a PDF or CSV containing words like "payment", "rent paid", "balance", or "ledger".',
      found: c.evidence.filter(e => e.category === 'payment').length + ' payment record(s) found'
    },
    'gap.missingRentIncreaseNotice': {
      looks: 'A file categorized as "rent-notice" — typically a PDF with "rent increase" or "notice of rent" in the filename or content.',
      found: c.evidence.filter(e => e.category === 'rent-notice').length + ' rent notice(s) found'
    },
    'gap.noConfirmedDates': {
      looks: 'At least one evidence item with a confirmed date (from filename, OCR text, or EXIF data).',
      found: c.evidence.filter(e => isFinite(e.dateTime.getTime())).length + ' item(s) with confirmed dates'
    }
  };

  list.innerHTML = gaps.map((g) => {
    const detail = gapDetails[g.id] ?? { looks: g.description, found: '' };
    return `<div class="gap-row" data-gap-id="${esc(g.id)}">
      <span class="gap-row__icon">△</span>
      <div class="gap-row__body">
        <strong>${esc(g.displayName)}</strong>
        <div class="gap-row__expand" id="gap-detail-${esc(g.id)}" style="display:none">
          <div class="gap-detail-looks"><span class="gap-detail-label">What we look for:</span> ${esc(detail.looks)}</div>
          <div class="gap-detail-found"><span class="gap-detail-label">Current status:</span> ${esc(detail.found)}</div>
        </div>
        <button class="gap-row__action" data-gap-id="${esc(g.id)}" type="button">Mark resolved</button>
      </div>
    </div>`;
  }).join('');

  // Expand on click
  list.querySelectorAll('.gap-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('gap-row__action')) return;
      const id = (row as HTMLElement).dataset.gapId!;
      const detail = document.getElementById(`gap-detail-${id}`);
      if (detail) detail.style.display = detail.style.display === 'none' ? '' : 'none';
    });
  });

  list.querySelectorAll('.gap-row__action').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const row = (btn as HTMLElement).closest('.gap-row') as HTMLElement;
      row.style.opacity = '0.4';
      (btn as HTMLElement).textContent = 'Resolved ✓';
      (btn as HTMLButtonElement).disabled = true;
    });
  });
}

function renderLibraryRefs(c: Case): void {
  const container = document.getElementById('brief-library-refs')!;
  const empty = document.getElementById('brief-library-empty')!;
  const refs = c.libraryRefs ?? [];
  const library = loadLibrary();

  if (refs.length === 0) {
    container.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';
  const items = refs.map((id) => library.find((li) => li.id === id)).filter(Boolean);
  container.innerHTML = items.map((li) => `
    <div class="lib-surface">
      <span class="lib-surface__icon">📄</span>
      <div class="lib-surface__body">
        <div class="lib-surface__name">${esc(li!.name)}</div>
        <div class="lib-surface__reason">From library</div>
      </div>
      <span class="lib-surface__cta">view ›</span>
    </div>
  `).join('');
}

function renderSourceFiles(c: Case): void {
  const list = document.getElementById('brief-sources-list')!;
  const label = document.getElementById('brief-sources-label')!;
  label.textContent = `${c.evidence.length} file${c.evidence.length !== 1 ? 's' : ''}`;
  const iconMap: Record<string, string> = {
    photo: '📷', lease: '📄', payment: '💳', 'rent-notice': '📬',
    'fee-notice': '⚠', repair: '🔧', message: '💬', amendment: '📝',
    correspondence: '✉', other: '📄'
  };
  list.innerHTML = c.evidence.map((ev) => {
    const icon = iconMap[ev.category ?? 'other'] ?? '📄';
    const date = isFinite(ev.dateTime.getTime())
      ? ev.dateTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—';
    const previewLines = ev.body
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .slice(0, 3)
      .join('\n');
    const hasPreview = previewLines.length > 0;
    const thumbHTML = ev.thumbnail
      ? `<img src="${ev.thumbnail}" class="ev-thumb" alt="" />`
      : `<span class="evidence-row__icon">${icon}</span>`;
    const sourcePathHTML = ev.sourceFile
      ? `<div style="display:flex;align-items:center;gap:4px">
          <div class="ev-source-path">${esc(ev.sourceFile)}</div>
          <button class="ev-copy-path" data-path="${esc(ev.sourceFile)}" type="button" data-tip="Copy file path" style="background:none;border:none;color:#bbb;cursor:pointer;font-size:10px;padding:0 2px;flex-shrink:0">⎘</button>
        </div>`
      : '';
    const autoExpand = (ev.category === 'other' || ev.category === 'correspondence');
    return `<div class="evidence-row-wrap" data-ev-id="${esc(ev.id)}">
      <div class="evidence-row" style="display:flex;align-items:center;gap:6px">
        ${thumbHTML}
        <div style="flex:1;min-width:0">
          <div class="evidence-row__name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(ev.title)}</div>
          ${sourcePathHTML}
        </div>
        <span class="evidence-row__tag">${esc(ev.category ?? '—')}</span>
        <span style="font-size:10px;color:#bbb;flex-shrink:0">${esc(date)}</span>
        ${hasPreview ? `<button class="ocr-toggle" data-ev-id="${esc(ev.id)}" type="button" data-tip="Show OCR text">text ${autoExpand ? '▾' : '▸'}</button>` : ''}
        <button class="ev-promote-btn" data-ev-id="${esc(ev.id)}" type="button" data-tip="Add to library as shared reference">→ lib</button>
        <button class="ev-edit-btn" data-ev-id="${esc(ev.id)}" type="button" data-tip="Edit" style="background:none;border:none;color:#888;cursor:pointer;font-size:13px;padding:2px 4px;flex-shrink:0">✏</button>
        <button class="ev-delete-btn" data-ev-id="${esc(ev.id)}" type="button" data-tip="Delete" style="background:none;border:none;color:#666;cursor:pointer;font-size:16px;padding:2px 4px;flex-shrink:0">×</button>
      </div>
      ${hasPreview ? `<div class="ocr-preview${autoExpand ? ' visible' : ''}" id="ocr-preview-${esc(ev.id)}">${esc(previewLines)}</div>` : ''}
    </div>`;
  }).join('') || '<p class="lib-empty">No source files.</p>';

  list.querySelectorAll('.ev-copy-path').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const path = (btn as HTMLElement).dataset.path ?? '';
      navigator.clipboard.writeText(path).then(() => {
        showToast('Path copied');
      }).catch(() => {
        showToast('Copy failed');
      });
    });
  });

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

  list.querySelectorAll('.ev-promote-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const evId = (btn as HTMLElement).dataset.evId!;
      const ev = c.evidence.find((x) => x.id === evId);
      if (!ev) return;
      const library = loadLibrary();
      const already = library.some((li) => li.name === ev.title);
      if (already) { showToast('Already in library'); return; }
      library.push({
        id: crypto.randomUUID(),
        name: ev.title,
        type: inferType(ev.sourceFile ?? 'file'),
        content: ev.body,
      });
      saveLibrary(library);
      updateLibraryMeta();
      showToast('Added to library');
    });
  });

  list.querySelectorAll('.ev-edit-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const evId = (btn as HTMLElement).dataset.evId!;
      const ev = c.evidence.find((x) => x.id === evId);
      if (ev) showEvidenceEditForm(ev, c.id);
    });
  });

  list.querySelectorAll('.ev-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const evId = (btn as HTMLElement).dataset.evId!;
      const ev = c.evidence.find((x) => x.id === evId);
      if (!await showConfirm(`Delete "${ev?.title ?? 'this item'}"?`, 'This evidence item will be permanently removed from the case.')) return;
      await repo.deleteEvidence(c.id, evId);
      showToast('Item deleted');
      await openCase(c.id);
    });
  });
}

function renderNeedsReview(c: Case): void {
  const section = document.getElementById('brief-review-section')!;
  const list = document.getElementById('brief-review-list')!;
  const badge = document.getElementById('brief-review-badge')!;

  const reviewItems = c.evidence.filter(
    (ev) => ev.requiresUserReview && (ev.body.trim().length < 50 || ev.category === 'photo')
  );

  if (reviewItems.length === 0) {
    section.style.display = 'none';
    // Update review filter button to show 0
    const reviewBtn = document.querySelector('[data-filter="review"]') as HTMLElement | null;
    if (reviewBtn) reviewBtn.textContent = '⚠ Review';
    return;
  }

  section.style.display = '';
  badge.textContent = String(reviewItems.length);
  // Update filter button with count
  const reviewBtn = document.querySelector('[data-filter="review"]') as HTMLElement | null;
  if (reviewBtn) reviewBtn.textContent = `⚠ Review (${reviewItems.length})`;

  list.innerHTML = reviewItems.map((ev) => {
    const reason = ev.body.trim().length < 10
      ? 'No text extracted'
      : ev.body.trim().length < 50
      ? 'Too little text to classify'
      : 'Could not identify document type';
    const thumbHTML = ev.thumbnail
      ? `<img src="${ev.thumbnail}" class="ev-thumb" alt="" style="margin-bottom:8px" />`
      : '';
    const ocrPreview = ev.body.trim().length > 0
      ? `<div class="review-ocr-preview">${esc(ev.body.slice(0, 200))}${ev.body.length > 200 ? '…' : ''}</div>`
      : '<div class="review-ocr-preview" style="color:#bbb;font-style:italic">No text extracted from this file.</div>';
    const pathHTML = ev.sourceFile
      ? `<div class="ev-source-path" style="margin-bottom:8px">${esc(ev.sourceFile)}</div>`
      : '';
    return `<div class="review-item" data-ev-id="${esc(ev.id)}">
      <div class="review-item__header">
        <span class="review-item__label">${esc(ev.title)}</span>
        <span class="review-item__reason">${esc(reason)}</span>
        <button class="review-item__toggle" data-ev-id="${esc(ev.id)}" type="button">▸</button>
      </div>
      <div class="review-item__body" id="review-body-${esc(ev.id)}" style="display:none">
        ${pathHTML}
        ${thumbHTML}
        ${ocrPreview}
        <button class="review-item__edit" data-ev-id="${esc(ev.id)}" type="button">Edit ✏</button>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.review-item__toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const evId = (btn as HTMLElement).dataset.evId!;
      const body = document.getElementById(`review-body-${evId}`);
      if (!body) return;
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : '';
      (btn as HTMLElement).textContent = isOpen ? '▸' : '▾';
    });
  });

  list.querySelectorAll('.review-item__edit').forEach((btn) => {
    btn.addEventListener('click', () => {
      const evId = (btn as HTMLElement).dataset.evId!;
      const ev = c.evidence.find((x) => x.id === evId);
      if (ev) showEvidenceEditForm(ev, c.id);
    });
  });
}

function showEvidenceEditForm(ev: Evidence, caseId: string): void {
  document.getElementById('ev-edit-overlay')?.remove();
  const cats: EvidenceCategory[] = ['lease', 'payment', 'rent-notice', 'fee-notice', 'repair', 'photo', 'message', 'amendment', 'correspondence', 'other'];
  const dateVal = isFinite(ev.dateTime.getTime()) ? ev.dateTime.toISOString().slice(0, 10) : '';
  const catOptions = cats.map((cat) => `<option value="${cat}"${ev.category === cat ? ' selected' : ''}>${cat}</option>`).join('');

  const overlay = document.createElement('div');
  overlay.id = 'ev-edit-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px';
  const thumbSection = ev.thumbnail
    ? `<div style="text-align:center;padding:12px 18px;border-bottom:1px solid #2a2a2a">
        <img src="${ev.thumbnail}" style="max-width:100%;max-height:140px;border:1px solid #333;object-fit:contain" alt="Preview" />
        ${ev.sourceFile ? `<div style="font-size:10px;color:#555;margin-top:4px;word-break:break-all">${esc(ev.sourceFile)}</div>` : ''}
      </div>`
    : ev.sourceFile
      ? `<div style="font-size:10px;color:#555;padding:8px 18px;border-bottom:1px solid #2a2a2a;word-break:break-all">📂 ${esc(ev.sourceFile)}</div>`
      : '';
  overlay.innerHTML = `<div style="background:#1a1a1a;border:1px solid #2a2a2a;padding:0;width:100%;max-width:500px;max-height:88vh;overflow-y:auto;display:flex;flex-direction:column">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #2a2a2a;flex-shrink:0">
      <strong style="color:#e8e8e8;font-size:13px;letter-spacing:0.05em">EDIT EVIDENCE</strong>
      <button id="ev-edit-close" type="button" style="background:none;border:none;color:#666;font-size:20px;cursor:pointer;line-height:1;padding:0">×</button>
    </div>
    ${thumbSection}
    <div style="padding:16px 18px;display:flex;flex-direction:column;gap:14px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div style="grid-column:1/-1">
          <div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#666;margin-bottom:5px">Title</div>
          <input id="ev-edit-title" type="text" value="${esc(ev.title)}" style="width:100%;background:#111;border:1px solid #2a2a2a;color:#e8e8e8;padding:8px 10px;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box" />
        </div>
        <div>
          <div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#666;margin-bottom:5px">Category</div>
          <select id="ev-edit-category" style="width:100%;background:#111;border:1px solid #2a2a2a;color:#e8e8e8;padding:8px 10px;font-size:12px;font-family:inherit;outline:none;box-sizing:border-box">${catOptions}</select>
        </div>
        <div>
          <div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#666;margin-bottom:5px">Date</div>
          <input id="ev-edit-date" type="date" value="${dateVal}" style="width:100%;background:#111;border:1px solid #2a2a2a;color:#e8e8e8;padding:8px 10px;font-size:12px;font-family:inherit;outline:none;box-sizing:border-box" />
        </div>
      </div>
      <div>
        <div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#666;margin-bottom:5px">Extracted / OCR Text <span style="font-size:9px;color:#444;font-weight:normal;letter-spacing:0">(edit to correct OCR errors)</span></div>
        <textarea id="ev-edit-body" style="width:100%;background:#111;border:1px solid #2a2a2a;color:#ccc;padding:8px 10px;font-size:11px;height:120px;resize:vertical;font-family:monospace;line-height:1.5;outline:none;box-sizing:border-box">${esc(ev.body)}</textarea>
        <div style="margin-top:4px;display:flex;gap:6px;align-items:center">
          <button id="ev-range-copy-btn" type="button" style="background:none;border:1px solid #333;color:#888;font-size:10px;padding:3px 8px;cursor:pointer;font-family:inherit;letter-spacing:0.06em">⎘ Range Copy</button>
          <span id="ev-range-hint" style="font-size:10px;color:#444"></span>
        </div>
        <div id="ev-sentence-view" style="display:none;margin-top:6px"></div>
      </div>
      <div style="display:flex;gap:8px;padding-top:4px;border-top:1px solid #2a2a2a">
        <button id="ev-edit-save" type="button" style="flex:1;background:#fff;border:none;color:#111;padding:10px;cursor:pointer;font-size:13px;font-family:inherit;letter-spacing:0.05em">Save</button>
        <button id="ev-edit-cancel" type="button" style="flex:1;background:#111;border:1px solid #2a2a2a;color:#888;padding:10px;cursor:pointer;font-size:13px;font-family:inherit">Cancel</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  document.getElementById('ev-edit-close')!.onclick = close;
  document.getElementById('ev-edit-cancel')!.onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  // Range copy
  let _rangeStart: number | null = null;
  let _rangeEnd: number | null = null;

  const rangeCopyBtn = document.getElementById('ev-range-copy-btn')!;
  const sentenceView = document.getElementById('ev-sentence-view')!;
  const rangeHint = document.getElementById('ev-range-hint')!;

  rangeCopyBtn.addEventListener('click', () => {
    const active = sentenceView.style.display !== 'none';
    if (active) {
      sentenceView.style.display = 'none';
      rangeCopyBtn.textContent = '⎘ Range Copy';
      rangeHint.textContent = '';
      _rangeStart = null; _rangeEnd = null;
      return;
    }
    const bodyText = (document.getElementById('ev-edit-body') as HTMLTextAreaElement).value;
    const sentences = bodyText.match(/[^.!?\n]+[.!?\n]?/g) ?? [bodyText];
    sentenceView.style.display = '';
    rangeCopyBtn.textContent = '✕ Exit Range Mode';
    rangeHint.textContent = 'Click start sentence, then end sentence';
    _rangeStart = null; _rangeEnd = null;

    sentenceView.innerHTML = sentences.map((s, i) =>
      `<span class="sent-unit" data-idx="${i}" style="cursor:pointer;display:inline;border-radius:2px;padding:0 1px">${esc(s)}</span>`
    ).join('');

    sentenceView.querySelectorAll('.sent-unit').forEach((span) => {
      span.addEventListener('click', () => {
        const idx = parseInt((span as HTMLElement).dataset.idx ?? '0', 10);
        if (_rangeStart === null) {
          _rangeStart = idx;
          rangeHint.textContent = 'Now click the end sentence';
          sentenceView.querySelectorAll('.sent-unit').forEach((s, i) => {
            (s as HTMLElement).style.background = i === idx ? '#fff3b0' : '';
          });
        } else {
          _rangeEnd = idx;
          const start = Math.min(_rangeStart, _rangeEnd);
          const end = Math.max(_rangeStart, _rangeEnd);
          const selected = sentences.slice(start, end + 1).join('');
          navigator.clipboard.writeText(selected).then(() => {
            rangeHint.textContent = `Copied ${end - start + 1} sentence${end - start !== 0 ? 's' : ''}`;
            sentenceView.querySelectorAll('.sent-unit').forEach((s, i) => {
              (s as HTMLElement).style.background = (i >= start && i <= end) ? '#d4f0c0' : '';
            });
            _rangeStart = null; _rangeEnd = null;
          });
        }
      });
    });
  });

  document.getElementById('ev-edit-save')!.onclick = async () => {
    const updated: Evidence = {
      ...ev,
      title: (document.getElementById('ev-edit-title') as HTMLInputElement).value.trim() || ev.title,
      category: (document.getElementById('ev-edit-category') as HTMLSelectElement).value as EvidenceCategory,
      dateTime: (document.getElementById('ev-edit-date') as HTMLInputElement).value
        ? new Date((document.getElementById('ev-edit-date') as HTMLInputElement).value)
        : ev.dateTime,
      body: (document.getElementById('ev-edit-body') as HTMLTextAreaElement).value,
    };
    await repo.saveEvidence(caseId, [updated]);
    showToast('Saved');
    close();
    await openCase(caseId);
  };
}

// ── File intake ────────────────────────────────────────────────────────────────

async function generateThumbnail(file: File): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const MAX = 200;
    const ratio = Math.min(MAX / bitmap.width, MAX / bitmap.height);
    const w = Math.round(bitmap.width * ratio);
    const h = Math.round(bitmap.height * ratio);
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp']);

async function handleFiles(files: FileList | File[], _source: Case['source']): Promise<void> {
  const fileArr = Array.from(files);
  if (fileArr.length === 0) return;
  setIntakeStatus(`Reading ${fileArr.length} file${fileArr.length !== 1 ? 's' : ''}… (OCR may take a minute for photos)`);
  try {
    const processed = await autoProcess(fileArr, {
      existingCases: allCases,
      repo,
      ocrService: buildOcrService(),
      source: _source,
    });

    // Generate thumbnails for image files and attach to evidence
    const imageFiles = fileArr.filter(f => {
      const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
      return IMAGE_EXTS.has(ext);
    });
    for (const file of imageFiles) {
      const sourceName = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const ev = processed.evidence.find(e => e.sourceFile === sourceName);
      if (!ev) continue;
      const thumb = await generateThumbnail(file);
      if (thumb) {
        await repo.saveEvidence(processed.id, [{ ...ev, thumbnail: thumb }]);
      }
    }

    await loadHome();
    await openCase(processed.id);
    setIntakeStatus('');
  } catch (err) {
    setIntakeStatus(`Error: ${String(err)}`);
  }
}

function setIntakeStatus(msg: string): void {
  const el = document.getElementById('intake-status');
  if (el) el.textContent = msg;
}

// ── Message import ─────────────────────────────────────────────────────────────

async function handleMessageImport(file: File): Promise<void> {
  const resultEl = document.getElementById('import-result')!;
  try {
    const text = await file.text();
    let messages;
    if (file.name.toLowerCase().endsWith('.xml')) {
      messages = parseSmsXml(text);
    } else {
      messages = parseImazingCsv(text);
    }

    // Save to the current case or create a new one
    let targetCase = currentCase;
    if (!targetCase) {
      targetCase = createCase({ title: 'Imported Messages' });
      await repo.saveCase(targetCase);
    }
    await repo.saveMessages(targetCase.id, messages);
    resultEl.textContent = `Imported ${messages.length} message${messages.length !== 1 ? 's' : ''}.`;
    await loadHome();
  } catch (err) {
    resultEl.textContent = `Import failed: ${String(err)}`;
  }
}

async function handleScreenshotImport(file: File): Promise<void> {
  const resultEl = document.getElementById('import-result')!;
  try {
    // Ensure we have a case to attach the message to
    let targetCase = currentCase;
    if (!targetCase) {
      targetCase = createCase({ title: 'Imported Messages' });
      await repo.saveCase(targetCase);
    }

    const caseId = targetCase.id;

    // Wrap the IndexedDb repo to match the MessageRepository port (no caseId param)
    const messageRepo = {
      async saveMessages(messages: import('../app/domain/types.js').Message[]) {
        await repo.saveMessages(caseId, messages);
      },
      async getDedupHashes() {
        return new Set<string>();
      }
    };

    // Build a tiered OCR service — Tesseract.js tier when available; falls back
    // to a stub that marks the message for user review so the body can be filled in.
    const stubOcr: import('../app/ports/OcrService.js').OcrService = {
      isAvailable() { return true; },
      async extractText(_f: File) {
        return {
          text: '',
          tier: 'tesseract' as const,
          confidence: 'unknown' as const,
          requiresUserReview: true,
          extractedAt: new Date()
        };
      }
    };
    const ocrService = new TieredOcrService({ tesseract: new TesseractOcrService({ recognize: () => stubOcr.extractText(file).then(r => ({ text: r.text, confidence: 0.5 })) }) });

    const { message } = await importScreenshotOcr({
      file,
      threadId: caseId,
      ocrService,
      repo: messageRepo
    });

    resultEl.textContent = `Screenshot imported — message requires review (body: "${message.body.slice(0, 60) || '(empty — edit to add text)'}").`;
    await loadHome();
    await openCase(caseId);
  } catch (err) {
    resultEl.textContent = `Screenshot import failed: ${String(err)}`;
  }
}

// ── Consultation overlay ──────────────────────────────────────────────────────

function openConsult(): void {
  if (!currentCase) return;
  consultSlide = 0;
  renderConsultSlides(currentCase);
  renderConsultSlide();
  document.getElementById('consult-overlay')!.classList.add('active');
}

function closeConsult(): void {
  document.getElementById('consult-overlay')!.classList.remove('active');
}

function nextSlide(): void {
  consultSlide = Math.min(5, consultSlide + 1);
  renderConsultSlide();
}

function prevSlide(): void {
  consultSlide = Math.max(0, consultSlide - 1);
  renderConsultSlide();
}

function renderConsultSlide(): void {
  // Update active slide
  document.querySelectorAll('.consult-slide').forEach((el, i) => {
    el.classList.toggle('active', i === consultSlide);
  });

  // Update dots
  document.querySelectorAll('.nav-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === consultSlide);
  });

  // Update indicator
  document.getElementById('consult-slide-indicator')!.textContent = `${consultSlide + 1} / 6`;

  // Update progress bar
  const fill = document.getElementById('consult-progress-fill')!;
  fill.style.width = `${((consultSlide + 1) / 6) * 100}%`;

  // Update buttons
  const prevBtn = document.getElementById('consult-prev-btn') as HTMLButtonElement;
  const nextBtn = document.getElementById('consult-next-btn') as HTMLButtonElement;
  prevBtn.disabled = consultSlide === 0;

  if (consultSlide === 5) {
    nextBtn.textContent = 'Finish';
    nextBtn.classList.add('c-btn--finish');
    nextBtn.onclick = closeConsult;
  } else {
    nextBtn.textContent = 'Next →';
    nextBtn.classList.remove('c-btn--finish');
    nextBtn.onclick = nextSlide;
  }
}

function renderConsultSlides(c: Case): void {
  const gaps = detectGaps(c);
  const timeline = buildTimeline(c.evidence, c.messages);

  // Slide 1: Orientation grid
  const orientGrid = document.getElementById('consult-orient-grid')!;
  const evidenceCount = c.evidence.length;
  const strengthBars = Math.min(5, Math.ceil(evidenceCount / 3));
  const bars = Array.from({ length: 5 }, (_, i) =>
    `<span class="sp${i < strengthBars ? ' on' : ''}"></span>`
  ).join('');

  orientGrid.innerHTML = `
    <div class="orient-card">
      <div class="orient-card__label">Case Type</div>
      <div class="orient-card__value">Tenant–Landlord Dispute</div>
    </div>
    <div class="orient-card">
      <div class="orient-card__label">Jurisdiction</div>
      <div class="orient-card__value">${esc(c.property?.jurisdiction || 'Not specified')}</div>
    </div>
    <div class="orient-card orient-card--goal orient-card--wide">
      <div class="orient-card__label">Client Goal</div>
      <div class="orient-card__value">${esc(c.clientGoal || 'Not specified')}</div>
    </div>
    <div class="orient-card">
      <div class="orient-card__label">Evidence Strength</div>
      <div class="orient-card__value">${evidenceCount} item${evidenceCount !== 1 ? 's' : ''}
        <div class="strength-bar">${bars}</div>
      </div>
    </div>
    <div class="orient-card">
      <div class="orient-card__label">Parties</div>
      <div class="orient-card__value">
        Tenant: ${esc(c.parties?.tenant || localStorage.getItem(TENANT_NAME_KEY) || '—')}<br>
        Landlord: ${esc(c.parties?.landlord || '—')}
      </div>
    </div>
  `;

  // Slide 2: The Dispute
  const disputeBody = document.getElementById('consult-dispute-body')!;
  const summary = c.property?.address
    ? `Tenant at ${c.property.address}${c.property.unit ? ', ' + c.property.unit : ''}.`
    : c.title;
  disputeBody.innerHTML = `
    <div class="brief-summary">${esc(summary)}</div>
    ${c.claims.length > 0 ? `
      <div style="margin-top:12px">
        ${c.claims.map((cl) => `<div class="claim-card" style="margin-bottom:6px">
          <div class="claim-card__title">${esc(cl.title)}</div>
        </div>`).join('')}
      </div>
    ` : '<p style="font-size:12px;color:#bbb">No discussion topics yet.</p>'}
  `;

  // Slide 3: The Proof
  const proofBody = document.getElementById('consult-proof-body')!;
  if (c.claims.length === 0) {
    proofBody.innerHTML = '<p style="font-size:12px;color:#bbb">No discussion topics to show proof for.</p>';
  } else {
    proofBody.innerHTML = c.claims.map((cl) => `
      <div class="legal-flag">
        <div class="legal-flag__statute">${esc(cl.status)}</div>
        <strong>${esc(cl.title)}</strong><br>
        ${cl.description ? `<span>${esc(cl.description)}</span><br>` : ''}
        ${cl.relatedEvidenceIds.length > 0
          ? `<span style="font-size:10px;color:#888">${cl.relatedEvidenceIds.length} related evidence item${cl.relatedEvidenceIds.length !== 1 ? 's' : ''}</span>`
          : ''}
      </div>
    `).join('');
  }

  // Slide 4: Timeline
  const timelineBody = document.getElementById('consult-timeline-body')!;
  if (timeline.length === 0) {
    timelineBody.innerHTML = '<p style="font-size:12px;color:#bbb">No timeline items yet.</p>';
  } else {
    timelineBody.innerHTML = timeline.slice(0, 15).map((item) => {
      const date = isFinite(item.dateTime.getTime())
        ? item.dateTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '—';
      const title = item.kind === 'evidence' ? item.title : `Message: ${item.body.slice(0, 60)}`;
      return `<div class="ct-row">
        <div class="ct-dot"></div>
        <div class="ct-date">${esc(date)}</div>
        <div class="ct-body"><div class="ct-event">${esc(title)}</div></div>
      </div>`;
    }).join('');
  }

  // Slide 5: Gaps
  const gapsBody = document.getElementById('consult-gaps-body')!;
  if (gaps.length === 0) {
    gapsBody.innerHTML = '<p style="font-size:12px;color:#1a7a3a">No gaps detected — case looks complete.</p>';
  } else {
    gapsBody.innerHTML = gaps.map((g) => `
      <div class="consult-gap">
        <div class="consult-gap__title">${esc(g.displayName)}</div>
        <div class="consult-gap__q">Ask your lawyer: ${esc(g.description)}</div>
      </div>
    `).join('');
  }

  // Slide 6: Ready
  const readyBody = document.getElementById('consult-ready-body')!;
  const hasTimeline = timeline.length > 0;
  const hasEvidence = c.evidence.length > 0;
  const hasGoal = Boolean(c.clientGoal);
  readyBody.innerHTML = `
    <div class="ready-row${hasEvidence ? '' : ' ready-row--warn'}">
      <span class="ready-row__icon">${hasEvidence ? '✓' : '△'}</span>
      <span class="ready-row__text">${hasEvidence ? `${c.evidence.length} evidence items` : 'No evidence added yet'}</span>
    </div>
    <div class="ready-row${hasTimeline ? '' : ' ready-row--warn'}">
      <span class="ready-row__icon">${hasTimeline ? '✓' : '△'}</span>
      <span class="ready-row__text">${hasTimeline ? `Timeline: ${timeline.length} events` : 'No dated items in timeline'}</span>
    </div>
    <div class="ready-row${gaps.length === 0 ? '' : ' ready-row--warn'}">
      <span class="ready-row__icon">${gaps.length === 0 ? '✓' : '△'}</span>
      <span class="ready-row__text">${gaps.length === 0 ? 'No gaps detected' : `${gaps.length} gap${gaps.length !== 1 ? 's' : ''} to address`}</span>
    </div>
    <div class="ready-row${hasGoal ? '' : ' ready-row--warn'}">
      <span class="ready-row__icon">${hasGoal ? '✓' : '△'}</span>
      <span class="ready-row__text">${hasGoal ? 'Client goal set' : 'Client goal not specified'}</span>
    </div>
    <div class="consult-action-btns" style="margin-top:16px">
      <button class="ca-btn ca-btn--primary" id="consult-export-btn" type="button">Export</button>
      <button class="ca-btn" id="consult-share-btn" type="button">Share</button>
    </div>
  `;

  document.getElementById('consult-export-btn')?.addEventListener('click', () => {
    exportCurrentCase('fullCase');
  });
  document.getElementById('consult-share-btn')?.addEventListener('click', () => {
    exportCurrentCase('lawyerSummary');
  });
}

// ── Export ─────────────────────────────────────────────────────────────────────

async function exportCurrentCase(variant: 'fullCase' | 'lawyerSummary'): Promise<void> {
  if (!currentCase) return;
  try {
    const pref = localStorage.getItem(EXPORT_PREF_KEY) ?? 'markdown';

    // Always generate markdown
    const result = await exportCaseMarkdown({
      repo,
      caseData: currentCase,
      variant,
      exportedAt: new Date(),
      appVersion: '2.0.0',
    });
    currentCase = result.case;

    if (pref === 'zip' || pref === 'both') {
      const gaps = detectGaps(currentCase);
      const timeline = buildTimeline(currentCase.evidence, currentCase.messages);
      const facts = extractKeyFacts(currentCase.evidence);

      const htmlReport = buildHtmlReport(currentCase, result.markdown, gaps, timeline, facts);
      const htmlBlob = new Blob([htmlReport], { type: 'text/html' });
      const htmlUrl = URL.createObjectURL(htmlBlob);
      const a2 = document.createElement('a');
      a2.href = htmlUrl;
      a2.download = `${currentCase.title.replace(/[^a-z0-9]/gi, '_')}_report.html`;
      a2.click();
      URL.revokeObjectURL(htmlUrl);
    }

    if (pref === 'markdown' || pref === 'both') {
      const blob = new Blob([result.markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentCase.title.replace(/[^a-z0-9]/gi, '_')}_${variant}.md`;
      a.click();
      URL.revokeObjectURL(url);
    }

    // Also offer JSON raw data download
    const jsonBlob = new Blob([JSON.stringify(currentCase, null, 2)], { type: 'application/json' });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const aj = document.createElement('a');
    aj.href = jsonUrl;
    aj.download = `${currentCase.title.replace(/[^a-z0-9]/gi, '_')}_data.json`;
    aj.click();
    URL.revokeObjectURL(jsonUrl);

    showToast('Exported');
  } catch (err) {
    alert(`Export failed: ${err}`);
  }
}

function buildHtmlReport(c: Case, markdown: string, gaps: Gap[], timeline: TimelineItem[], facts: ReturnType<typeof extractKeyFacts>): string {
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const timelineRows = timeline.slice(0, 30).map(item => {
    const d = isFinite(item.dateTime.getTime())
      ? item.dateTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—';
    const title = item.kind === 'evidence' ? item.title : `Message: ${item.body.slice(0, 80)}`;
    return `<tr><td style="color:#888;font-size:11px;white-space:nowrap;padding:4px 8px 4px 0">${esc(d)}</td><td style="padding:4px 0">${esc(title)}</td><td style="font-size:10px;color:#888;padding:4px 0 4px 8px">${esc(item.kind === 'evidence' ? (item.category ?? '—') : 'message')}</td></tr>`;
  }).join('');
  const gapRows = gaps.map(g => `<li style="margin-bottom:6px;color:#b85c00"><strong>${esc(g.displayName)}</strong> — ${esc(g.description)}</li>`).join('');
  const factRows = facts.map(f => `<li style="margin-bottom:4px">${esc(f.raw)} <span style="color:#888;font-size:11px">— ${esc(f.evidenceTitle)}</span></li>`).join('');
  const evRows = c.evidence.map(ev => {
    const d = isFinite(ev.dateTime.getTime()) ? ev.dateTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    return `<tr><td style="padding:5px 8px 5px 0;font-size:12px">${esc(ev.title)}</td><td style="font-size:11px;color:#888;padding:5px 8px">${esc(ev.category ?? '—')}</td><td style="font-size:11px;color:#888;padding:5px 0">${esc(d)}</td></tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${esc(c.title)} — Case Report</title>
<style>
body{font-family:Georgia,serif;max-width:800px;margin:40px auto;padding:0 20px;color:#111;font-size:14px;line-height:1.65}
h1{font-size:22px;font-weight:400;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:4px}
h2{font-size:14px;letter-spacing:0.12em;text-transform:uppercase;color:#888;margin:28px 0 8px;border-bottom:1px solid #eee;padding-bottom:4px}
table{width:100%;border-collapse:collapse;font-size:13px}
.meta{font-size:12px;color:#888;margin-bottom:24px}
.gap-list{list-style:disc;padding-left:20px}
.fact-list{list-style:disc;padding-left:20px;font-size:13px}
@media print{body{margin:20px}}
</style>
</head>
<body>
<h1>${esc(c.title)}</h1>
<div class="meta">Generated ${esc(date)} · ${c.evidence.length} evidence items · ${gaps.length} gap${gaps.length !== 1 ? 's' : ''}</div>
${c.clientGoal ? `<p><strong>Client goal:</strong> ${esc(c.clientGoal)}</p>` : ''}
${c.property?.address ? `<p><strong>Property:</strong> ${esc(c.property.address)}${c.property.unit ? ', ' + esc(c.property.unit) : ''}</p>` : ''}
${c.parties ? `<p><strong>Parties:</strong> Tenant: ${esc(c.parties.tenant || '—')} · Landlord: ${esc(c.parties.landlord || '—')}</p>` : ''}

<h2>Timeline</h2>
${timeline.length === 0 ? '<p style="color:#bbb">No dated items.</p>' : `<table>${timelineRows}</table>`}

<h2>Key Facts</h2>
${facts.length === 0 ? '<p style="color:#bbb">No key facts extracted.</p>' : `<ul class="fact-list">${factRows}</ul>`}

<h2>Gaps</h2>
${gaps.length === 0 ? '<p style="color:#1a7a3a">No gaps detected.</p>' : `<ul class="gap-list">${gapRows}</ul>`}

<h2>Evidence (${c.evidence.length} items)</h2>
<table><thead><tr><th style="text-align:left;padding:5px 8px 5px 0;border-bottom:1px solid #eee">Title</th><th style="text-align:left;padding:5px 8px;border-bottom:1px solid #eee">Category</th><th style="text-align:left;padding:5px 0;border-bottom:1px solid #eee">Date</th></tr></thead><tbody>${evRows}</tbody></table>

${c.messages.length > 0 ? `<h2>Messages (${c.messages.length})</h2><p style="color:#888;font-size:12px">Message export available in full data JSON.</p>` : ''}

<h2>Discussion Topics</h2>
${c.claims.length === 0 ? '<p style="color:#bbb">None yet.</p>' : c.claims.map(cl => `<p><strong>${esc(cl.title)}</strong>${cl.description ? ` — ${esc(cl.description)}` : ''}</p>`).join('')}
</body>
</html>`;
}

// ── Library screen ─────────────────────────────────────────────────────────────

const LIBRARY_GROUPS = [
  { key: 'tenant-rights', label: 'Tenant Rights' },
  { key: 'ordinances', label: 'Ordinances' },
  { key: 'templates', label: 'Templates' },
  { key: 'correspondence', label: 'Correspondence' },
  { key: 'research', label: 'Research' },
  { key: 'unassigned', label: 'Unassigned' },
];

function inferGroup(_name: string): string {
  const lower = _name.toLowerCase();
  if (/tenant|renter|right/.test(lower)) return 'tenant-rights';
  if (/ordinance|code|statute|law|orc /.test(lower)) return 'ordinances';
  if (/template|form|sample/.test(lower)) return 'templates';
  if (/letter|email|notice|correspondence/.test(lower)) return 'correspondence';
  if (/research|article|study|court|municipal/.test(lower)) return 'research';
  return 'unassigned';
}

function renderLibrary(): void {
  const items = loadLibrary();
  const container = document.getElementById('lib-groups')!;

  const groupsHtml = LIBRARY_GROUPS.map((g) => {
    const groupItems = items.filter((li) => {
      const gKey = inferGroup(li.name);
      if (g.key === 'unassigned') {
        return gKey === 'unassigned' || !LIBRARY_GROUPS.slice(0, -1).some((gg) => inferGroup(li.name) === gg.key);
      }
      return gKey === g.key;
    });
    const isSeeded = (li: LibraryItem) => OHIO_LIBRARY_SEEDS.some((s) => s.id === li.id);
    return `<div class="lib-group">
      <div class="lib-group__label">${esc(g.label)}</div>
      ${groupItems.length === 0
        ? '<p class="lib-empty">No items.</p>'
        : groupItems.map((li) => {
            const stubHtml = isSeeded(li)
              ? `<button class="stub-info" data-tip="Stub — pre-populated from your jurisdiction. No content added yet. Click to fill in or attach the full document." type="button">?</button>`
              : '';
            const icon = li.url ? '🔗' : '📄';
            const extraClass = li.url ? ' lib-item--link' : '';
            return `<div class="lib-item${extraClass}" data-lib-id="${esc(li.id)}">
              <span class="lib-item__icon">${icon}</span>
              <span class="lib-item__name">${esc(li.name)}</span>
              <span class="lib-item__type">${esc(li.type)}${isSeeded(li) ? '' : ''}${stubHtml}</span>
              <button class="lib-item__delete" data-lib-id="${esc(li.id)}" type="button" data-tip="Remove from library">×</button>
            </div>`;
          }).join('')
      }
    </div>`;
  }).join('');

  const templatesHtml = `
    <div class="lib-group lib-group--templates">
      <div class="lib-group__label">Fillable Templates</div>
      <p style="font-size:11px;color:#aaa;margin:0 0 8px;line-height:1.5">Fill in your case details and download a ready-to-send document.</p>
      ${DOCUMENT_TEMPLATES.map((t) => `
        <div class="lib-item lib-item--template">
          <span class="lib-item__icon">✎</span>
          <div class="lib-item__body">
            <span class="lib-item__name">${esc(t.label)}</span>
            <span class="lib-item__desc">${esc(t.description)}</span>
          </div>
          <button class="template-fill-btn" data-template-id="${esc(t.id)}" type="button">Fill ↗</button>
        </div>
      `).join('')}
    </div>`;

  container.innerHTML = groupsHtml + templatesHtml;

  // Wire template fill buttons
  container.querySelectorAll('.template-fill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const templateId = (btn as HTMLElement).dataset.templateId ?? '';
      showTemplateModal(templateId);
    });
  });

  // Wire library item delete buttons
  container.querySelectorAll('.lib-item__delete').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const libId = (btn as HTMLElement).dataset.libId!;
      const library = loadLibrary().filter((li) => li.id !== libId);
      saveLibrary(library);
      renderLibrary();
      updateLibraryMeta();
      showToast('Removed from library');
    });
  });

  // Wire link item clicks
  container.querySelectorAll('.lib-item--link').forEach((item) => {
    item.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      const libId = (item as HTMLElement).dataset.libId!;
      const lib = loadLibrary();
      const li = lib.find((x) => x.id === libId);
      if (!li || !li.url) return;

      const isOffline = localStorage.getItem(SIMULATE_OFFLINE_KEY) === '1' || !navigator.onLine;
      const isSimulating = localStorage.getItem(SIMULATE_OFFLINE_KEY) === '1';

      if (isOffline) {
        showSnapshotModal(li, isSimulating);
      } else {
        window.open(li.url, '_blank');
        // Try to update snapshot in background
        fetchLinkSnapshot(li.url).then((snapshot) => {
          if (!snapshot) return;
          const updated = loadLibrary().map((x) => x.id === libId ? { ...x, snapshot, snapshotAt: new Date().toISOString() } : x);
          saveLibrary(updated);
        }).catch(() => {/* ignore */});
      }
    });
  });
}

function showSnapshotModal(li: LibraryItem, isSimulating: boolean): void {
  document.getElementById('snapshot-modal-backdrop')?.remove();
  const backdrop = document.createElement('div');
  backdrop.id = 'snapshot-modal-backdrop';
  backdrop.className = 'snapshot-modal-backdrop';
  const dateStr = li.snapshotAt ? new Date(li.snapshotAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'unknown date';
  const bannerText = isSimulating ? '⚠ Simulating offline — showing cached snapshot' : `⚠ Offline — showing cached snapshot from ${dateStr}`;
  const contentHtml = li.snapshot
    ? `<div class="snapshot-modal__content">${esc(li.snapshot)}</div>`
    : `<div class="snapshot-modal__content" style="color:#bbb;font-style:italic">Snapshot unavailable (CORS restriction)</div>`;

  backdrop.innerHTML = `
    <div class="snapshot-modal">
      <div class="snapshot-modal__title">${esc(li.name)}</div>
      <div class="snapshot-modal__url">${esc(li.url ?? '')}</div>
      <div class="snapshot-modal__banner">${esc(bannerText)}</div>
      ${contentHtml}
      <button class="snapshot-modal__close" type="button">Close</button>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector('.snapshot-modal__close')!.addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
}

async function fetchLinkSnapshot(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const text = await res.text();
    // Strip HTML tags for plain text
    const plain = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return plain.slice(0, 3000);
  } catch {
    return null;
  }
}

function showAddLinkModal(): void {
  document.getElementById('add-link-modal-backdrop')?.remove();
  const backdrop = document.createElement('div');
  backdrop.id = 'add-link-modal-backdrop';
  backdrop.className = 'add-link-modal-backdrop';
  backdrop.innerHTML = `
    <div class="add-link-modal">
      <div class="add-link-modal__title">Add Link to Library</div>
      <div class="add-link-modal__field">
        <label class="add-link-modal__label">Name</label>
        <input class="add-link-modal__input" id="add-link-name" type="text" placeholder="e.g. Ohio Tenant Rights Guide" autocomplete="off" />
      </div>
      <div class="add-link-modal__field">
        <label class="add-link-modal__label">URL</label>
        <input class="add-link-modal__input" id="add-link-url" type="url" placeholder="https://..." autocomplete="off" />
      </div>
      <div class="add-link-modal__field">
        <label class="add-link-modal__label">Notes (optional)</label>
        <textarea class="add-link-modal__textarea" id="add-link-notes" rows="2" placeholder="Any notes about this link…"></textarea>
      </div>
      <div class="add-link-modal__actions">
        <button class="add-link-modal__save" id="add-link-save" type="button">Save</button>
        <button class="add-link-modal__cancel" type="button">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.querySelector('.add-link-modal__cancel')!.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  backdrop.querySelector('#add-link-save')!.addEventListener('click', async () => {
    const name = (backdrop.querySelector('#add-link-name') as HTMLInputElement).value.trim();
    const url = (backdrop.querySelector('#add-link-url') as HTMLInputElement).value.trim();
    const content = (backdrop.querySelector('#add-link-notes') as HTMLTextAreaElement).value.trim();
    if (!name || !url) { showToast('Name and URL are required'); return; }

    const newItem: LibraryItem = {
      id: crypto.randomUUID(),
      name,
      type: 'Link',
      url,
      content: content || undefined,
    };

    // Try to fetch snapshot
    const snapshot = await fetchLinkSnapshot(url);
    if (snapshot) {
      newItem.snapshot = snapshot;
      newItem.snapshotAt = new Date().toISOString();
    }

    const library = loadLibrary();
    library.push(newItem);
    saveLibrary(library);
    renderLibrary();
    updateLibraryMeta();
    showToast(snapshot ? 'Link added with snapshot' : 'Link added (snapshot unavailable — CORS restriction)');
    close();
  });
}

function showTemplateModal(templateId: string): void {
  const template = DOCUMENT_TEMPLATES.find((t) => t.id === templateId);
  if (!template) return;

  // Pre-fill from current case or settings
  const prefill: Record<string, string> = {};
  const tenantName = localStorage.getItem(TENANT_NAME_KEY) ?? '';
  const address = currentCase?.property?.address
    ? `${currentCase.property.address}${currentCase.property.unit ? ', ' + currentCase.property.unit : ''}`
    : '';
  if (tenantName) prefill['tenant_name'] = tenantName;
  if (address) prefill['address'] = prefill['rental_address'] = prefill['tenant_address'] = address;

  document.getElementById('template-modal-backdrop')?.remove();
  const backdrop = document.createElement('div');
  backdrop.id = 'template-modal-backdrop';
  backdrop.className = 'template-modal-backdrop';
  backdrop.innerHTML = `
    <div class="template-modal">
      <div class="template-modal__header">
        <span class="template-modal__title">${esc(template.label)}</span>
        <button class="template-modal__close" type="button">×</button>
      </div>
      <div class="template-modal__desc">${esc(template.description)}</div>
      <div class="template-modal__fields">
        ${template.fields.map((f) => `
          <div class="template-field">
            <label class="template-field__label">${esc(f.label)}</label>
            ${f.id === 'events' || f.id === 'issue'
              ? `<textarea class="template-field__textarea" id="tf-${esc(f.id)}" placeholder="${esc(f.placeholder)}" rows="3">${esc(prefill[f.id] ?? '')}</textarea>`
              : `<input class="template-field__input" id="tf-${esc(f.id)}" type="text" placeholder="${esc(f.placeholder)}" value="${esc(prefill[f.id] ?? '')}" autocomplete="off" />`
            }
          </div>
        `).join('')}
      </div>
      <div class="template-modal__actions">
        <button class="template-generate-btn" type="button">Generate &amp; Download</button>
        <button class="template-modal__cancel" type="button">Cancel</button>
      </div>
    </div>`;

  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.querySelector('.template-modal__close')!.addEventListener('click', close);
  backdrop.querySelector('.template-modal__cancel')!.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  backdrop.querySelector('.template-generate-btn')!.addEventListener('click', () => {
    const fields: Record<string, string> = {};
    template.fields.forEach((f) => {
      fields[f.id] = (backdrop.querySelector(`#tf-${f.id}`) as HTMLInputElement | HTMLTextAreaElement)?.value ?? '';
    });
    const content = template.generate(fields);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template.id}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Document downloaded');
    close();
  });
}

// ── Settings screen ────────────────────────────────────────────────────────────

function loadSettings(): void {
  const jurEl = document.getElementById('settings-jurisdiction') as HTMLInputElement;
  const tenantEl = document.getElementById('settings-tenant-name') as HTMLInputElement;
  const exportEl = document.getElementById('settings-export-pref') as HTMLSelectElement;
  jurEl.value = localStorage.getItem(JURISDICTION_KEY) ?? '';
  tenantEl.value = localStorage.getItem(TENANT_NAME_KEY) ?? '';
  exportEl.value = localStorage.getItem(EXPORT_PREF_KEY) ?? 'markdown';

  // Feature toggles — defaults: auto-organize, gap-detection, ocr, smart-topics = true; simulate-offline = false
  const featDefaults: Record<string, boolean> = {
    'feat-auto-organize': true,
    'feat-gap-detection': true,
    'feat-ocr': true,
    'feat-smart-topics': true,
    'feat-simulate-offline': false,
  };
  for (const [id, defaultVal] of Object.entries(featDefaults)) {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el) continue;
    const stored = localStorage.getItem(`caseOrg.${id}`);
    el.checked = stored !== null ? stored === '1' : defaultVal;
  }

  // Sync offline simulate flag
  const simEl = document.getElementById('feat-simulate-offline') as HTMLInputElement | null;
  if (simEl) simEl.checked = localStorage.getItem(SIMULATE_OFFLINE_KEY) === '1';

  // Render sync folders
  renderSyncFolders();
}

// ── Sync folders (Task 6) ────────────────────────────────────────────────────

function loadSyncFolders(): SyncFolder[] {
  try { return JSON.parse(localStorage.getItem(SYNC_FOLDERS_KEY) ?? '[]'); } catch { return []; }
}

function saveSyncFolders(folders: SyncFolder[]): void {
  localStorage.setItem(SYNC_FOLDERS_KEY, JSON.stringify(folders));
}

async function connectSyncFolder(): Promise<void> {
  try {
    const handle = await (window as unknown as { showDirectoryPicker: (opts?: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({ mode: 'read' });
    const id = crypto.randomUUID();
    const name = handle.name;
    _syncHandles.set(id, handle);
    const folders = loadSyncFolders();
    folders.push({ id, name, path: name, processedFiles: [] });
    saveSyncFolders(folders);
    renderSyncFolders();
    showToast(`Syncing ${name}`);
    await processSyncFolder(id, handle);
  } catch (err) {
    if ((err as Error).name !== 'AbortError') showToast('Could not connect folder');
  }
}

async function processSyncFolder(folderId: string, handle: FileSystemDirectoryHandle): Promise<void> {
  const folders = loadSyncFolders();
  const folder = folders.find((f) => f.id === folderId);
  if (!folder) return;

  const files: File[] = [];
  for await (const [name, fileHandle] of (handle as unknown as AsyncIterable<[string, FileSystemFileHandle & { kind: string }]>)) {
    if ((fileHandle as { kind: string }).kind === 'file') {
      if (!folder.processedFiles.includes(name)) {
        const file = await (fileHandle as FileSystemFileHandle).getFile();
        files.push(file);
        folder.processedFiles.push(name);
      }
    }
  }

  if (files.length > 0) {
    saveSyncFolders(folders);
    showToast(`Importing ${files.length} new file${files.length !== 1 ? 's' : ''} from ${folder.name}…`);
    await handleFiles(files, 'upload');
  }
  saveSyncFolders(folders);
}

function renderSyncFolders(): void {
  const container = document.getElementById('sync-folders-list');
  if (!container) return;
  const folders = loadSyncFolders();
  if (folders.length === 0) {
    container.innerHTML = '<p style="font-size:11px;color:#bbb;margin-bottom:8px">No folders connected.</p>';
    return;
  }
  container.innerHTML = folders.map((f) => `
    <div class="sync-folder-row">
      <span class="sync-folder-row__icon">⟳</span>
      <div class="sync-folder-row__body">
        <div class="sync-folder-row__name">${esc(f.name)}</div>
        <div class="sync-folder-row__meta">${f.processedFiles.length} files processed · <button class="sync-reconnect-btn" data-id="${esc(f.id)}" type="button" data-tip="Re-grant folder access to scan for new files">Re-scan ↺</button></div>
      </div>
      <button class="sync-remove-btn" data-id="${esc(f.id)}" type="button" data-tip="Remove sync folder">×</button>
    </div>
  `).join('');

  container.querySelectorAll('.sync-reconnect-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const handle = await (window as unknown as { showDirectoryPicker: (opts?: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({ mode: 'read' });
        const id = (btn as HTMLElement).dataset.id!;
        _syncHandles.set(id, handle);
        await processSyncFolder(id, handle);
        renderSyncFolders();
      } catch { /* ignore */ }
    });
  });

  container.querySelectorAll('.sync-remove-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.id!;
      const folders = loadSyncFolders().filter((f) => f.id !== id);
      saveSyncFolders(folders);
      _syncHandles.delete(id);
      renderSyncFolders();
    });
  });
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showConfirm(message: string, detail: string, confirmLabel = 'Delete', danger = true): Promise<boolean> {
  return new Promise((resolve) => {
    document.getElementById('app-confirm-backdrop')?.remove();
    const backdrop = document.createElement('div');
    backdrop.id = 'app-confirm-backdrop';
    backdrop.className = 'app-confirm-backdrop';
    backdrop.innerHTML = `
      <div class="app-confirm-box">
        <p>${esc(message)}</p>
        <small>${esc(detail)}</small>
        <div class="app-confirm-actions">
          <button class="app-confirm-cancel" type="button">Cancel</button>
          <button class="app-confirm-ok ${danger ? 'danger' : 'neutral'}" type="button">${esc(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    const close = (result: boolean) => { backdrop.remove(); resolve(result); };
    backdrop.querySelector('.app-confirm-cancel')!.addEventListener('click', () => close(false));
    backdrop.querySelector('.app-confirm-ok')!.addEventListener('click', () => close(true));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(false); });
  });
}

// ── Dock drag reorder ─────────────────────────────────────────────────────────

const DOCK_ORDER_KEY = 'caseOrg.dockOrder';

function initDockDragReorder(): void {
  const navEl = document.getElementById('dock-nav');
  if (!navEl) return;

  // Load persisted order
  const savedOrder = (() => {
    try { return JSON.parse(localStorage.getItem(DOCK_ORDER_KEY) ?? 'null'); } catch { return null; }
  })();

  if (savedOrder && Array.isArray(savedOrder)) {
    const buttons = Array.from(navEl.querySelectorAll('.dock__item[data-screen]')) as HTMLElement[];
    const sorted = savedOrder
      .map((screen: string) => buttons.find((b) => b.dataset.screen === screen))
      .filter(Boolean) as HTMLElement[];
    // Re-append in order
    sorted.forEach((b) => navEl.appendChild(b));
  }

  let dragSrc: HTMLElement | null = null;

  navEl.addEventListener('dragstart', (e) => {
    dragSrc = (e.target as HTMLElement).closest('.dock__item[data-screen]') as HTMLElement | null;
    if (dragSrc) {
      e.dataTransfer!.effectAllowed = 'move';
      e.dataTransfer!.setData('text/plain', dragSrc.dataset.screen ?? '');
      setTimeout(() => { dragSrc!.style.opacity = '0.4'; }, 0);
    }
  });

  navEl.addEventListener('dragend', () => {
    if (dragSrc) dragSrc.style.opacity = '';
    dragSrc = null;
  });

  navEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
  });

  navEl.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!dragSrc) return;
    const target = (e.target as HTMLElement).closest('.dock__item[data-screen]') as HTMLElement | null;
    if (!target || target === dragSrc) return;
    navEl.insertBefore(dragSrc, target);
    // Save order
    const order = Array.from(navEl.querySelectorAll('.dock__item[data-screen]')).map((b) => (b as HTMLElement).dataset.screen ?? '');
    localStorage.setItem(DOCK_ORDER_KEY, JSON.stringify(order));
  });
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

  // ── JS Tooltip (replaces broken CSS ::after approach) ─────────────────
  const _tip = document.createElement('div');
  _tip.id = 'js-tip';
  _tip.style.cssText = 'position:fixed;background:#1a1a1a;color:#e8e8e8;font-size:11px;padding:4px 8px;border:1px solid #333;border-radius:3px;pointer-events:none;opacity:0;transition:opacity 0.12s;z-index:9999;white-space:nowrap;max-width:260px;word-break:break-all;white-space:normal';
  document.body.appendChild(_tip);

  document.addEventListener('mouseover', (e) => {
    const el = (e.target as HTMLElement).closest('[data-tip]') as HTMLElement | null;
    // Also reveal truncated text elements
    const truncEl = (e.target as HTMLElement).closest('.detail-title, .evidence-row__name, .ev-source-path, .review-item__label, .case-row__name') as HTMLElement | null;
    const target = el ?? (truncEl && truncEl.scrollWidth > truncEl.clientWidth ? truncEl : null);
    if (!target) return;
    const tipText = el?.dataset.tip ?? target.textContent?.trim() ?? '';
    if (!tipText) return;
    _tip.textContent = tipText;
    _tip.style.opacity = '1';
    const rect = target.getBoundingClientRect();
    const tipW = _tip.offsetWidth || 120;
    let left = rect.left + rect.width / 2 - tipW / 2;
    left = Math.max(6, Math.min(left, window.innerWidth - tipW - 6));
    const top = rect.top - _tip.offsetHeight - 8;
    _tip.style.left = left + 'px';
    _tip.style.top = (top < 6 ? rect.bottom + 8 : top) + 'px';
  });
  document.addEventListener('mouseout', (e) => {
    const el = (e.target as HTMLElement).closest('[data-tip]');
    const truncEl = (e.target as HTMLElement).closest('.detail-title, .evidence-row__name, .ev-source-path, .review-item__label, .case-row__name');
    if (!el && !truncEl) return;
    _tip.style.opacity = '0';
  });
  document.addEventListener('scroll', () => { _tip.style.opacity = '0'; }, true);

  // ── Canvas filter buttons
  document.querySelectorAll('.cf-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      showCanvasFilter((btn as HTMLElement).dataset.filter ?? 'all');
    });
  });

  // ── Dock navigation (nav items with data-screen)
  document.querySelectorAll('.dock__item[data-screen]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const screen = (btn as HTMLElement).dataset.screen ?? 'home';
      if (screen === 'library') {
        renderLibrary();
        showScreen('screen-library');
      } else if (screen === 'settings') {
        loadSettings();
        showScreen('screen-settings');
      } else {
        showScreen('screen-home');
      }
    });
  });

  // ── Dock nav drag-to-reorder
  initDockDragReorder();

  // ── Dock upload button
  const dockUploadBtn = document.getElementById('dock-upload-btn')!;
  const dockUploadMenu = document.getElementById('dock-upload-menu')!;
  dockUploadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dockUploadMenu.style.display = dockUploadMenu.style.display === 'none' ? '' : 'none';
  });
  document.addEventListener('click', () => { dockUploadMenu.style.display = 'none'; });

  document.getElementById('dock-file-input')?.addEventListener('change', (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files && files.length > 0) handleFiles(files, 'upload');
    dockUploadMenu.style.display = 'none';
  });

  document.getElementById('dock-folder-input')?.addEventListener('change', (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files && files.length > 0) handleFiles(files, 'drop-folder');
    dockUploadMenu.style.display = 'none';
  });

  document.getElementById('dock-msg-menu-btn')?.addEventListener('click', () => {
    const panel = document.getElementById('message-import-panel')!;
    panel.style.display = panel.style.display === 'none' ? '' : 'none';
    dockUploadMenu.style.display = 'none';
  });

  // ── Canvas drop zone (home canvas)
  const homeCanvas = document.getElementById('home-canvas');
  if (homeCanvas) {
    document.addEventListener('dragover', (e) => {
      if (!document.getElementById('screen-home')?.classList.contains('active')) return;
      e.preventDefault();
      homeCanvas.classList.add('drag-over');
    });
    document.addEventListener('dragleave', (e) => {
      if (!(e.relatedTarget) || !(homeCanvas.contains(e.relatedTarget as Node))) {
        homeCanvas.classList.remove('drag-over');
      }
    });
    document.addEventListener('drop', async (e) => {
      if (!document.getElementById('screen-home')?.classList.contains('active')) return;
      e.preventDefault();
      homeCanvas.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      const csvXml = files.filter(f => /\.(csv|xml)$/i.test(f.name));
      const others = files.filter(f => !/\.(csv|xml)$/i.test(f.name));
      for (const f of csvXml) await handleMessageImport(f);
      if (others.length > 0) await handleFiles(others, 'upload');
    });
  }

  // ── Back buttons
  document.getElementById('back-from-brief')!.addEventListener('click', () => {
    currentCase = null;
    showScreen('screen-home');
  });
  document.getElementById('back-from-library')!.addEventListener('click', () => {
    showScreen('screen-home');
  });
  document.getElementById('back-from-settings')!.addEventListener('click', () => {
    showScreen('screen-home');
  });

  // ── CSV import
  document.getElementById('import-csv')!.addEventListener('change', (e) => {
    const file = ((e.target as HTMLInputElement).files)?.[0];
    if (file) handleMessageImport(file);
  });

  // ── XML import
  document.getElementById('import-xml')!.addEventListener('change', (e) => {
    const file = ((e.target as HTMLInputElement).files)?.[0];
    if (file) handleMessageImport(file);
  });

  // ── Screenshot import (OCR path)
  document.getElementById('import-screenshot')!.addEventListener('change', (e) => {
    const file = ((e.target as HTMLInputElement).files)?.[0];
    if (file) handleScreenshotImport(file);
  });

  // ── Consult overlay navigation
  document.getElementById('consult-exit-btn')!.addEventListener('click', closeConsult);
  document.getElementById('consult-prev-btn')!.addEventListener('click', prevSlide);
  document.getElementById('consult-next-btn')!.addEventListener('click', nextSlide);

  document.querySelectorAll('.nav-dot').forEach((dot, i) => {
    dot.addEventListener('click', () => {
      consultSlide = i;
      renderConsultSlide();
    });
  });

  // ── Library: file upload (in-screen button)
  document.getElementById('lib-file-input')!.addEventListener('change', (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;
    const library = loadLibrary();
    Array.from(files).forEach((file) => {
      library.push({
        id: crypto.randomUUID(),
        name: file.name,
        type: inferType(file.name),
      });
    });
    saveLibrary(library);
    renderLibrary();
    updateLibraryMeta();
    (e.target as HTMLInputElement).value = '';
  });

  // ── Settings: save on change
  document.getElementById('settings-jurisdiction')!.addEventListener('change', (e) => {
    localStorage.setItem(JURISDICTION_KEY, (e.target as HTMLInputElement).value);
  });
  document.getElementById('settings-tenant-name')!.addEventListener('change', (e) => {
    localStorage.setItem(TENANT_NAME_KEY, (e.target as HTMLInputElement).value);
  });
  document.getElementById('settings-export-pref')!.addEventListener('change', (e) => {
    localStorage.setItem(EXPORT_PREF_KEY, (e.target as HTMLSelectElement).value);
  });

  // ── Feature toggles
  const featIds = ['feat-auto-organize', 'feat-gap-detection', 'feat-ocr', 'feat-smart-topics', 'feat-simulate-offline'];
  featIds.forEach((id) => {
    document.getElementById(id)?.addEventListener('input', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      localStorage.setItem(`caseOrg.${id}`, checked ? '1' : '0');
      // Special case for simulate-offline
      if (id === 'feat-simulate-offline') {
        localStorage.setItem(SIMULATE_OFFLINE_KEY, checked ? '1' : '0');
      }
    });
  });

  // ── Settings: sync folder connect
  document.getElementById('btn-add-sync-folder')?.addEventListener('click', () => {
    connectSyncFolder();
  });

  // ── Settings: reset
  document.getElementById('btn-reset-cache')!.addEventListener('click', async () => {
    if (!await showConfirm('Reset all data?', 'Every case, document, and setting will be permanently deleted. This cannot be undone.', 'Reset everything', true)) return;
    localStorage.clear();
    indexedDB.deleteDatabase('case-organizer');
    window.location.reload();
  });

  // ── Keyboard navigation between canvas filters
  document.addEventListener('keydown', (e) => {
    // Already handles Escape for consult
    if (e.key === 'Escape') closeConsult();

    // Arrow key filter navigation when on brief screen
    const briefActive = document.getElementById('screen-brief')?.classList.contains('active');
    if (!briefActive) return;
    if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
      const focusedTag = (document.activeElement as HTMLElement)?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(focusedTag ?? '')) return;
      const filters = ['all', 'timeline', 'review', 'sources', 'gaps'];
      const activeBtn = document.querySelector('.cf-btn.active') as HTMLElement | null;
      const currentFilter = activeBtn?.dataset.filter ?? 'all';
      const idx = filters.indexOf(currentFilter);
      const nextIdx = e.key === 'ArrowRight'
        ? Math.min(filters.length - 1, idx + 1)
        : Math.max(0, idx - 1);
      showCanvasFilter(filters[nextIdx]);
    }
  });

  // ── First-launch setup defaults
  if (!localStorage.getItem(SETUP_DONE_KEY)) {
    if (!localStorage.getItem(JURISDICTION_KEY)) {
      localStorage.setItem(JURISDICTION_KEY, DEFAULT_JURISDICTION);
    }
    seedLibraryDefaults();
    localStorage.setItem(SETUP_DONE_KEY, '1');
  }

  // ── Initial load
  loadHome().then(async () => {
    showScreen('screen-home');
    // Resumability: restore last case if available
    const lastCaseId = sessionStorage.getItem('last.caseId');
    if (lastCaseId) {
      const lastCase = allCases.find(c => c.id === lastCaseId);
      if (lastCase) {
        await openCase(lastCaseId);
        showResumeBadge();
      }
    }
  });
});
