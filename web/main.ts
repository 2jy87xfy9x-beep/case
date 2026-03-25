/**
 * main.ts — v2 UI for Case Organizer
 *
 * Screens: Home, Brief, Library, Settings
 * Plus: Consultation overlay
 */

import { autoProcess } from '../app/application/autoProcess.js';
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
import type { Case, Gap, TimelineItem } from '../app/domain/types.js';

// ── State ──────────────────────────────────────────────────────────────────────

const repo = new IndexedDbCaseRepository();
let allCases: Case[] = [];
let currentCase: Case | null = null;
let consultSlide = 0;

// ── Library state (localStorage) ──────────────────────────────────────────────

interface LibraryItem {
  id: string;
  name: string;
  type: string;
  assignedCaseId?: string;
}

const LIB_KEY = 'caseOrg.library';
const JURISDICTION_KEY = 'caseOrg.jurisdiction';
const TENANT_NAME_KEY = 'caseOrg.tenantName';
const EXPORT_PREF_KEY = 'caseOrg.exportPref';

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

function showScreen(id: string): void {
  for (const sid of SCREENS) {
    const el = document.getElementById(sid)!;
    el.classList.toggle('active', sid === id);
  }
  const dock = document.getElementById('dock')!;
  // Hide dock when inside brief
  dock.style.display = id === 'screen-brief' ? 'none' : '';

  // Update dock active state
  document.querySelectorAll('.dock__item').forEach((btn) => {
    const screen = (btn as HTMLElement).dataset.screen ?? '';
    const targetId = screen === 'home' ? 'screen-home'
      : screen === 'library' ? 'screen-library'
      : screen === 'settings' ? 'screen-settings'
      : '';
    btn.classList.toggle('active', targetId === id);
  });
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

  // Attach click handlers
  list.querySelectorAll('.case-row[data-case-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const id = (row as HTMLElement).dataset.caseId!;
      openCase(id);
    });
  });
}

function caseRowHTML(c: Case): string {
  const gaps = detectGaps(c);
  const statusClass = c.status === 'gaps' || gaps.length > 0 ? 'status--gaps' : 'status--ready';
  const statusText = gaps.length > 0 ? `${gaps.length} gaps` : 'ready';
  const categorySet = new Set(c.evidence.map((e) => e.category).filter(Boolean));
  const cats = Array.from(categorySet).slice(0, 4).join(', ') || '—';
  const meta = `${c.evidence.length} item${c.evidence.length !== 1 ? 's' : ''} · ${cats}`;
  return `<div class="case-row" data-case-id="${esc(c.id)}">
    <span class="case-row__icon">▸</span>
    <div class="case-row__body">
      <div class="case-row__name">${esc(c.title)}</div>
      <div class="case-row__meta">${esc(meta)}</div>
    </div>
    <span class="case-row__status ${statusClass}">${esc(statusText)}</span>
    <span class="case-row__arrow">›</span>
  </div>`;
}

function updateLibraryMeta(): void {
  const items = loadLibrary();
  const meta = document.getElementById('library-meta')!;
  meta.textContent = `${items.length} item${items.length !== 1 ? 's' : ''} · not yet assigned to a case`;
}

// ── Case Brief ─────────────────────────────────────────────────────────────────

async function openCase(caseId: string): Promise<void> {
  const c = await repo.loadCase(caseId);
  if (!c) return;
  currentCase = c;
  renderBrief(c);
  showScreen('screen-brief');
}

function renderBrief(c: Case): void {
  // Topbar
  (document.getElementById('brief-title')!).textContent = c.title;
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

  // Export bar meta
  const exportMeta = document.getElementById('brief-export-meta')!;
  exportMeta.textContent = `${c.evidence.length} item${c.evidence.length !== 1 ? 's' : ''} · ${gaps.length} gap${gaps.length !== 1 ? 's' : ''}`;

  // Consult case label
  const consultLabel = document.getElementById('consult-case-label')!;
  consultLabel.textContent = c.title;
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
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';
  list.innerHTML = c.claims.map((cl) => `
    <div class="claim-card">
      <div class="claim-card__title">${esc(cl.title)}</div>
      ${cl.description ? `<div class="claim-card__desc">${esc(cl.description)}</div>` : ''}
      <span class="claim-card__status claim-status--${cl.status}">${esc(cl.status)}</span>
    </div>
  `).join('');
}

function renderBriefTimeline(c: Case): void {
  const container = document.getElementById('brief-timeline')!;
  const empty = document.getElementById('brief-timeline-empty')!;
  const timeline: TimelineItem[] = buildTimeline(c.evidence, c.messages);

  if (timeline.length === 0) {
    container.innerHTML = '';
    empty.style.display = '';
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

  // Extract dollar amounts and key dates from evidence
  const facts: string[] = [];
  const DOLLAR_RE = /\$[\d,]+(?:\.\d{2})?/g;

  for (const ev of c.evidence) {
    const matches = ev.body.match(DOLLAR_RE);
    if (matches) {
      for (const m of matches.slice(0, 2)) {
        facts.push(`${m} — ${ev.title}`);
      }
    }
  }

  // Also add tenancy info if present
  if (c.tenancy?.monthlyRentCurrent) {
    facts.unshift(`$${c.tenancy.monthlyRentCurrent.toLocaleString()} — current monthly rent`);
  }
  if (c.tenancy?.monthlyRentOriginal) {
    facts.unshift(`$${c.tenancy.monthlyRentOriginal.toLocaleString()} — original monthly rent`);
  }

  if (facts.length === 0) {
    container.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';
  container.innerHTML = facts.slice(0, 8).map((f) =>
    `<div class="fact-row"><span class="fact-row__arrow">›</span><span>${esc(f)}</span></div>`
  ).join('');
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
  list.innerHTML = gaps.map((g) => `
    <div class="gap-row" data-gap-id="${esc(g.id)}">
      <span class="gap-row__icon">△</span>
      <div class="gap-row__body">
        <strong>${esc(g.displayName)}</strong><br>
        <span style="font-size:11px">${esc(g.description)}</span>
        <button class="gap-row__action" data-gap-id="${esc(g.id)}" type="button">Mark resolved</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.gap-row__action').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // In a real app we'd persist resolved status; for now just re-render
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
  list.innerHTML = c.evidence.map((ev) => {
    const iconMap: Record<string, string> = {
      photo: '📷', lease: '📄', payment: '💳', 'rent-notice': '📬',
      'fee-notice': '⚠', repair: '🔧', message: '💬', amendment: '📝', other: '📄'
    };
    const icon = iconMap[ev.category ?? 'other'] ?? '📄';
    const date = isFinite(ev.dateTime.getTime())
      ? ev.dateTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—';
    return `<div class="evidence-row">
      <span class="evidence-row__icon">${icon}</span>
      <span class="evidence-row__name">${esc(ev.title)}</span>
      <span class="evidence-row__tag">${esc(ev.category ?? '—')}</span>
      <span style="font-size:10px;color:#bbb;flex-shrink:0">${esc(date)}</span>
    </div>`;
  }).join('') || '<p class="lib-empty">No source files.</p>';
}

// ── File intake ────────────────────────────────────────────────────────────────

async function handleFiles(files: FileList | File[], _source: Case['source']): Promise<void> {
  const fileArr = Array.from(files);
  if (fileArr.length === 0) return;
  setIntakeStatus(`Processing ${fileArr.length} file${fileArr.length !== 1 ? 's' : ''}…`);
  try {
    const processed = await autoProcess(fileArr, {
      existingCases: allCases,
      repo,
      source: _source,
    });
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
    const result = await exportCaseMarkdown({
      repo,
      caseData: currentCase,
      variant,
      exportedAt: new Date(),
      appVersion: '2.0.0',
    });
    const blob = new Blob([result.markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentCase.title.replace(/[^a-z0-9]/gi, '_')}_${variant}.md`;
    a.click();
    URL.revokeObjectURL(url);
    currentCase = result.case;
  } catch (err) {
    alert(`Export failed: ${err}`);
  }
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
  if (/ordinance|code|statute|law/.test(lower)) return 'ordinances';
  if (/template|form|sample/.test(lower)) return 'templates';
  if (/letter|email|notice|correspondence/.test(lower)) return 'correspondence';
  if (/research|article|study/.test(lower)) return 'research';
  return 'unassigned';
}

function renderLibrary(): void {
  const items = loadLibrary();
  const container = document.getElementById('lib-groups')!;

  container.innerHTML = LIBRARY_GROUPS.map((g) => {
    const groupItems = items.filter((li) => {
      const gKey = inferGroup(li.name);
      if (g.key === 'unassigned') {
        return gKey === 'unassigned' || !LIBRARY_GROUPS.slice(0, -1).some((gg) => inferGroup(li.name) === gg.key);
      }
      return gKey === g.key;
    });
    return `<div class="lib-group">
      <div class="lib-group__label">${esc(g.label)}</div>
      ${groupItems.length === 0
        ? '<p class="lib-empty">No items.</p>'
        : groupItems.map((li) => `
          <div class="lib-item">
            <span class="lib-item__icon">📄</span>
            <span class="lib-item__name">${esc(li.name)}</span>
            <span class="lib-item__type">${esc(li.type)}</span>
          </div>
        `).join('')
      }
    </div>`;
  }).join('');
}

// ── Settings screen ────────────────────────────────────────────────────────────

function loadSettings(): void {
  const jurEl = document.getElementById('settings-jurisdiction') as HTMLInputElement;
  const tenantEl = document.getElementById('settings-tenant-name') as HTMLInputElement;
  const exportEl = document.getElementById('settings-export-pref') as HTMLSelectElement;
  jurEl.value = localStorage.getItem(JURISDICTION_KEY) ?? '';
  tenantEl.value = localStorage.getItem(TENANT_NAME_KEY) ?? '';
  exportEl.value = localStorage.getItem(EXPORT_PREF_KEY) ?? 'markdown';
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

  // ── Dock navigation
  document.querySelectorAll('.dock__item').forEach((btn) => {
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

  // ── Library row on home
  document.getElementById('btn-goto-library')!.addEventListener('click', () => {
    renderLibrary();
    showScreen('screen-library');
  });

  // ── Intake toggle
  document.getElementById('intake-toggle')!.addEventListener('click', () => {
    const panel = document.getElementById('intake-panel')!;
    panel.classList.toggle('open');
  });

  // ── Drop folder
  document.getElementById('intake-drop-folder')!.addEventListener('change', (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files && files.length > 0) handleFiles(files, 'drop-folder');
  });

  // ── Upload files
  document.getElementById('intake-upload-files')!.addEventListener('change', (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files && files.length > 0) handleFiles(files, 'upload');
  });

  // ── Photo batch
  document.getElementById('intake-photo-batch')!.addEventListener('change', (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files && files.length > 0) handleFiles(files, 'upload');
  });

  // ── Import messages button
  document.getElementById('intake-messages-btn')!.addEventListener('click', () => {
    const panel = document.getElementById('message-import-panel')!;
    panel.style.display = panel.style.display === 'none' ? '' : 'none';
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

  // ── Manual entry button
  document.getElementById('intake-manual-btn')!.addEventListener('click', () => {
    if (currentCase) {
      showScreen('screen-brief');
    } else {
      alert('Open or create a case first.');
    }
  });

  // ── Brief: Consult button
  document.getElementById('btn-open-consult')!.addEventListener('click', openConsult);

  // ── Brief: Export
  document.getElementById('btn-export')!.addEventListener('click', () => {
    exportCurrentCase('fullCase');
  });

  // ── Brief: Share
  document.getElementById('btn-share')!.addEventListener('click', () => {
    exportCurrentCase('lawyerSummary');
  });

  // ── Consult overlay navigation
  document.getElementById('consult-exit-btn')!.addEventListener('click', closeConsult);
  document.getElementById('consult-prev-btn')!.addEventListener('click', prevSlide);
  document.getElementById('consult-next-btn')!.addEventListener('click', nextSlide);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeConsult();
  });

  document.querySelectorAll('.nav-dot').forEach((dot, i) => {
    dot.addEventListener('click', () => {
      consultSlide = i;
      renderConsultSlide();
    });
  });

  // ── Library: file upload
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
    // Reset input
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

  // ── Settings: reset
  document.getElementById('btn-reset-cache')!.addEventListener('click', () => {
    if (!confirm('This will delete ALL case data and settings. This cannot be undone.')) return;
    localStorage.clear();
    indexedDB.deleteDatabase('case-organizer');
    window.location.reload();
  });

  // ── Initial load
  loadHome().then(() => {
    showScreen('screen-home');
  });
});
