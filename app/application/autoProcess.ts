/**
 * autoProcess.ts — Auto-processing pipeline for batch file ingestion.
 *
 * Classifies files, extracts metadata, assigns to an existing case or
 * creates a new one, then builds timeline, detects gaps, and suggests
 * discussion topics.
 */
import { createCase, createEvidence } from '../domain/factories.js';
import { buildTimeline } from '../domain/timeline.js';
import { detectGaps } from '../domain/gapDetector.js';
import { suggestClaims } from '../domain/claimSuggester.js';
import type { Case, Evidence, EvidenceCategory } from '../domain/types.js';
import type { CaseRepository } from '../ports/CaseRepository.js';
import type { OcrService } from '../ports/OcrService.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface AutoProcessOptions {
  existingCases: Case[];
  repo: CaseRepository;
  ocrService?: OcrService;
  source?: Case['source'];
}

export interface ClassifyResult {
  category: EvidenceCategory;
  label: string;
}

export interface ExtractMetaResult {
  date: Date | null;
  amount: number | null;
  address: string | null;
  parties: { tenant: string | null; landlord: string | null };
}

// ─── classify() ───────────────────────────────────────────────────────────────

// Extension → allowed categories map (ordered: most-specific first)
const PHOTO_EXTS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.webp']);
const MESSAGE_EXTS = new Set(['.csv', '.xml']);

// Keyword patterns per category.
// Filenames often use hyphens as word separators, so we normalise the
// filename to spaces before matching.
const LEASE_KEYWORDS = /\b(lease|rental[ -]?agreement|tenant|landlord)\b/i;
const RENT_NOTICE_KEYWORDS = /\b(rent[ -]increase|notice[ -]of[ -]rent)\b/i;
const PAYMENT_KEYWORDS = /\b(payment|rent[ -]paid|balance|ledger)\b/i;
const FEE_NOTICE_KEYWORDS =
  /\b(late[ -]fee|notice[ -]to[ -]pay|notice[ -]to[ -]quit|unlawful[ -]detainer|eviction)\b/i;
const REPAIR_KEYWORDS = /\b(repair|maintenance|fix|damage)\b/i;
const AMENDMENT_KEYWORDS = /\b(amendment|addendum)\b/i;
const AMENDMENT_LEASE_KEYWORDS = /\b(lease|rental|tenant|landlord)\b/i;

const PDF_DOCX = new Set(['.pdf', '.docx']);
const PDF_ONLY = new Set(['.pdf']);
const PDF_DOCX_MSG = new Set(['.pdf', '.docx', '.msg']);
const PDF_CSV = new Set(['.pdf', '.csv']);

function extOf(filename: string): string {
  const idx = filename.lastIndexOf('.');
  if (idx === -1) return '';
  return filename.slice(idx).toLowerCase();
}

/**
 * Pure classification function.
 * Checks extension first, then keywords in the filename (case-insensitive).
 */
export function classify(filename: string): ClassifyResult {
  const ext = extOf(filename);
  const lower = filename.toLowerCase();

  // photo — extension only
  if (PHOTO_EXTS.has(ext)) {
    return { category: 'photo', label: 'Photo' };
  }

  // message — extension only (.xml always message; .csv only if no payment keyword)
  if (ext === '.xml') {
    return { category: 'message', label: 'Message Export' };
  }

  // amendment — must match amendment keyword AND a lease-family keyword
  if (PDF_DOCX.has(ext) && AMENDMENT_KEYWORDS.test(lower) && AMENDMENT_LEASE_KEYWORDS.test(lower)) {
    return { category: 'amendment', label: 'Amendment / Addendum' };
  }

  // lease
  if (PDF_DOCX.has(ext) && LEASE_KEYWORDS.test(lower)) {
    return { category: 'lease', label: 'Lease / Rental Agreement' };
  }

  // rent-notice
  if (PDF_ONLY.has(ext) && RENT_NOTICE_KEYWORDS.test(lower)) {
    return { category: 'rent-notice', label: 'Rent Increase Notice' };
  }

  // fee-notice
  if (PDF_ONLY.has(ext) && FEE_NOTICE_KEYWORDS.test(lower)) {
    return { category: 'fee-notice', label: 'Fee / Legal Notice' };
  }

  // payment — .pdf or .csv; .csv without matching xml
  if (PDF_CSV.has(ext) && PAYMENT_KEYWORDS.test(lower)) {
    return { category: 'payment', label: 'Payment Record' };
  }

  // .csv with no payment keyword → message
  if (ext === '.csv') {
    return { category: 'message', label: 'Message Export' };
  }

  // repair
  if (PDF_DOCX_MSG.has(ext) && REPAIR_KEYWORDS.test(lower)) {
    return { category: 'repair', label: 'Repair / Maintenance Record' };
  }

  return { category: 'other', label: 'Document' };
}

// ─── extractMeta() ────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
};

const ISO_DATE_RE = /(\d{4})-(\d{2})-(\d{2})/;
const US_DATE_RE = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
const WRITTEN_MONTH_RE =
  /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i;
const DOLLAR_RE = /\$(\d[\d,]*)(\.\d{2})?/;
const ADDRESS_RE = /\d+\s+[A-Za-z][A-Za-z\s]+(?:St|Ave|Blvd|Rd|Dr|Ln|Way|Court|Ct|Place|Pl)\b/;
const TENANT_RE = /tenant:\s*(\S+)/i;
const LANDLORD_RE = /landlord:\s*(\S+)/i;

export function extractMeta(filename: string, text: string): ExtractMetaResult {
  const combined = `${filename} ${text}`;

  // Date: try ISO first, then US, then written month
  let date: Date | null = null;
  const isoMatch = combined.match(ISO_DATE_RE);
  if (isoMatch) {
    // Use local date constructor so getDate()/getMonth() return the parsed values
    date = new Date(
      parseInt(isoMatch[1], 10),
      parseInt(isoMatch[2], 10) - 1,
      parseInt(isoMatch[3], 10)
    );
  } else {
    const usMatch = combined.match(US_DATE_RE);
    if (usMatch) {
      date = new Date(
        parseInt(usMatch[3], 10),
        parseInt(usMatch[1], 10) - 1,
        parseInt(usMatch[2], 10)
      );
    } else {
      const wmMatch = combined.match(WRITTEN_MONTH_RE);
      if (wmMatch) {
        const monthIndex = MONTHS[wmMatch[1].toLowerCase()];
        const year = parseInt(wmMatch[2], 10);
        date = new Date(year, monthIndex, 1);
      }
    }
  }

  // Dollar amount
  let amount: number | null = null;
  const dollarMatch = combined.match(DOLLAR_RE);
  if (dollarMatch) {
    const raw = dollarMatch[1].replace(/,/g, '') + (dollarMatch[2] ?? '');
    amount = parseFloat(raw);
  }

  // Address
  let address: string | null = null;
  const addrMatch = combined.match(ADDRESS_RE);
  if (addrMatch) {
    address = addrMatch[0].trim();
  }

  // Parties
  let tenant: string | null = null;
  let landlord: string | null = null;
  const tenantMatch = combined.match(TENANT_RE);
  if (tenantMatch) tenant = tenantMatch[1];
  const landlordMatch = combined.match(LANDLORD_RE);
  if (landlordMatch) landlord = landlordMatch[1];

  return { date, amount, address, parties: { tenant, landlord } };
}

// ─── assignToCase() ───────────────────────────────────────────────────────────

export function assignToCase(meta: ExtractMetaResult, existingCases: Case[]): Case | null {
  for (const c of existingCases) {
    if (
      meta.address &&
      c.property?.address &&
      meta.address.trim().toLowerCase() === c.property.address.trim().toLowerCase()
    ) {
      return c;
    }
    if (
      meta.parties.tenant &&
      c.parties?.tenant &&
      meta.parties.tenant.trim().toLowerCase() === c.parties.tenant.trim().toLowerCase()
    ) {
      return c;
    }
  }
  return null;
}

// ─── autoProcess() ────────────────────────────────────────────────────────────

export async function autoProcess(
  files: File[],
  options: AutoProcessOptions
): Promise<Case> {
  const { existingCases, repo, ocrService, source = 'upload' } = options;

  const SKIP_OCR_CATEGORIES: EvidenceCategory[] = ['photo', 'message'];

  // Step 1-4: Classify each file, optionally OCR, extract meta, create evidence
  const evidenceItems: Evidence[] = [];
  const allMetas: ExtractMetaResult[] = [];

  for (const file of files) {
    const { category, label } = classify(file.name);

    let body = '';
    let requiresUserReview = false;
    let ocrTier: Evidence['provenance']['tier'] = 'manual';
    const extractedAt = new Date();

    if (ocrService && !SKIP_OCR_CATEGORIES.includes(category)) {
      const ocrResult = await ocrService.extractText(file);
      body = ocrResult.text;
      requiresUserReview = ocrResult.requiresUserReview;
      ocrTier = ocrResult.tier;
    }

    const meta = extractMeta(file.name, body);
    allMetas.push(meta);

    const ev = createEvidence({
      title: label,
      body,
      dateTime: meta.date ?? new Date(NaN),
      category,
      requiresUserReview,
      provenance: { tier: ocrTier, extractedAt }
    });
    evidenceItems.push(ev);
  }

  // Step 5: Combine meta — first non-null address, first non-null tenant/landlord
  const combinedMeta: ExtractMetaResult = {
    date: allMetas.find((m) => m.date !== null)?.date ?? null,
    amount: allMetas.find((m) => m.amount !== null)?.amount ?? null,
    address: allMetas.find((m) => m.address !== null)?.address ?? null,
    parties: {
      tenant: allMetas.find((m) => m.parties.tenant !== null)?.parties.tenant ?? null,
      landlord: allMetas.find((m) => m.parties.landlord !== null)?.parties.landlord ?? null
    }
  };

  // Step 5: Find or create case
  let caseData = assignToCase(combinedMeta, existingCases);
  if (!caseData) {
    const address = combinedMeta.address ?? 'New Case';
    const tenant = combinedMeta.parties.tenant;
    const title = tenant ? `${tenant} — ${address}` : address;
    caseData = createCase({ title });
  }

  // Step 6: Add evidence to case
  caseData = { ...caseData, evidence: [...caseData.evidence, ...evidenceItems] };

  // Step 7: Build timeline
  caseData = { ...caseData, timeline: buildTimeline(caseData.evidence, caseData.messages) };

  // Step 8: Detect gaps
  const gaps = detectGaps(caseData);
  caseData = { ...caseData, gaps };

  // Step 9: Suggest claims
  const claims = suggestClaims(caseData);
  caseData = { ...caseData, claims };

  // Step 10: Set status
  caseData = { ...caseData, status: gaps.length > 0 ? 'gaps' : 'ready' };

  // Step 11: Set source
  caseData = { ...caseData, source };

  // Step 12: Save
  await repo.saveCase(caseData);
  await repo.saveEvidence(caseData.id, evidenceItems);

  return caseData;
}
