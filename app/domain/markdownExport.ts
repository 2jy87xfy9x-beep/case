import { getCombinedQuestions } from './claimsOps.js';
import { detectGaps } from './gapDetector.js';
import type { Case, Claim, Evidence, LegalNote, Message } from './types.js';

export type ExportMarkdownVariant = 'fullCase' | 'lawyerSummary';

export const EXPORT_DISCLAIMER_ORGANIZATIONAL =
  'This document was prepared for organizational purposes only and does not constitute legal advice.';

export const EXPORT_DISCLAIMER_TEXT_ONLY =
  'Original documents remain on your device and are the authoritative source. This export contains extracted or manually entered text only.';

export const EXPORT_OCR_CAVEAT =
  'Some text was extracted automatically and may contain errors. Original images are the authoritative source.';

export interface MarkdownExportOptions {
  variant: ExportMarkdownVariant;
  exportedAt: Date;
  /** Shown in export header; defaults to package unknown if omitted */
  appVersion?: string;
}

function formatIso(d: Date): string {
  return Number.isNaN(d.getTime()) ? '(invalid date)' : d.toISOString();
}

function hasOcrContent(caseData: Case): boolean {
  return caseData.evidence.some((e) => e.provenance.tier === 'tesseract' || e.provenance.tier === 'vision');
}

function categoryLabel(c: Evidence['category']): string {
  if (!c) return '(uncategorized)';
  return c;
}

/** Break `](data:...)` so pasted content cannot become an active markdown image URL. */
function neutralizeDataUrlLinks(text: string): string {
  return text.replace(/\]\(\s*data:/gi, '] (data:');
}

function fencedExtractedText(text: string): string {
  const trimmed = neutralizeDataUrlLinks(text.trim());
  if (!trimmed) return '';
  const fence = trimmed.includes('```') ? '~~~' : '```';
  return `\n\n${fence}\n${trimmed}\n${fence}`;
}

function evidenceMarkdownList(items: Evidence[]): string {
  if (items.length === 0) return '_No documents recorded._\n';
  return items
    .map((e) => {
      const head = `- **${escapeMdCell(e.title)}** · ${formatIso(e.dateTime)} · _${categoryLabel(e.category)}_`;
      const body = e.body.trim() ? fencedExtractedText(e.body) : '';
      return `${head}${body}`;
    })
    .join('\n\n');
}

function messagesMarkdownList(messages: Message[]): string {
  if (messages.length === 0) return '_No messages recorded._\n';
  const sorted = [...messages].sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime() || a.id.localeCompare(b.id));
  return sorted
    .map((m) => {
      const line = `- ${formatIso(m.dateTime)} · **${m.sender}** (${m.direction}): ${escapeMdCell(m.body)}`;
      return line;
    })
    .join('\n');
}

function rentHistorySection(evidence: Evidence[]): string {
  const rows = evidence.filter((e) => e.category === 'rent-notice' || e.category === 'payment');
  if (rows.length === 0) {
    return '_No evidence tagged as payment or rent notice. Use categories on evidence to improve this section._\n';
  }
  return evidenceMarkdownList(rows);
}

function feeHistorySection(evidence: Evidence[]): string {
  const rows = evidence.filter((e) => e.category === 'fee-notice');
  if (rows.length === 0) {
    return '_No evidence tagged as fee notice._\n';
  }
  return evidenceMarkdownList(rows);
}

const STATUS_LABELS: Record<string, string> = {
  'researching': 'Researching',
  'ready-to-discuss': 'Ready to discuss',
  'resolved': 'Resolved',
  'dropped': 'Dropped'
};

const APPLIES_LABELS: Record<string, string> = {
  yes: 'Yes',
  maybe: 'Maybe',
  no: 'No'
};

function claimsSection(claims: Claim[]): string {
  if (claims.length === 0) {
    return '_No topics recorded. Add topics to discuss in the app._\n\n';
  }
  return (
    claims
      .map((c) => {
        const lines: string[] = [
          `### ${escapeMdCell(c.title)}`,
          '',
          `**Status:** ${STATUS_LABELS[c.status] ?? c.status}  `,
          `**Confidence (your estimate):** ${c.confidence}`,
          ''
        ];
        if (c.description) {
          lines.push(escapeMdCell(c.description), '');
        }
        if (c.questions.length > 0) {
          lines.push('**Questions to ask:**');
          for (const q of c.questions) {
            lines.push(`- ${escapeMdCell(q)}`);
          }
          lines.push('');
        }
        return lines.join('\n');
      })
      .join('\n') + '\n'
  );
}

function legalNotesSection(notes: LegalNote[]): string {
  if (notes.length === 0) return '';
  const lines: string[] = ['## Research notes', ''];
  for (const n of notes) {
    lines.push(
      `### ${escapeMdCell(n.topic)}`,
      '',
      `**Applies to case:** ${APPLIES_LABELS[n.appliesToCase] ?? n.appliesToCase}  `,
      `**Confidence:** ${n.confidence}`,
      ''
    );
    if (n.summary) lines.push(escapeMdCell(n.summary), '');
    if (n.source) lines.push(`**Source:** ${escapeMdCell(n.source)}`, '');
  }
  return lines.join('\n') + '\n';
}

function questionsSection(caseData: Case): string {
  const questions = getCombinedQuestions(caseData);
  if (questions.length === 0) return '_No questions recorded._\n\n';
  return questions.map((q) => `- ${escapeMdCell(q)}`).join('\n') + '\n\n';
}

function gapsSection(caseData: Case): string {
  const gaps = detectGaps(caseData);
  if (gaps.length === 0) return '';
  const lines = gaps.map((g) => `- **${escapeMdCell(g.displayName)}** (${g.severity}): ${escapeMdCell(g.description)}`);
  return `## Gaps\n\n${lines.join('\n')}\n\n`;
}

/** Escape minimal markdown-breaking sequences in one-line cells */
function escapeMdCell(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\n/g, ' ').replace(/\|/g, '\\|');
}

function headerBlock(caseData: Case, options: MarkdownExportOptions): string {
  const ver = options.appVersion ?? 'unknown';
  return [
    `# ${escapeMdCell(caseData.title)}`,
    '',
    `- Exported: ${formatIso(options.exportedAt)}`,
    `- App version: ${escapeMdCell(ver)}`,
    '',
    `> ${EXPORT_DISCLAIMER_ORGANIZATIONAL}`,
    '',
    `> ${EXPORT_DISCLAIMER_TEXT_ONLY}`,
    ''
  ].join('\n');
}

function ocrBlock(caseData: Case): string {
  if (!hasOcrContent(caseData)) return '';
  return [`> ${EXPORT_OCR_CAVEAT}`, ''].join('\n');
}

/**
 * Builds Markdown for lawyer packet or backup download. Text only — no images or base64.
 */
export function buildMarkdownExport(caseData: Case, options: MarkdownExportOptions): string {
  const parts: string[] = [];
  parts.push(headerBlock(caseData, options));
  parts.push(ocrBlock(caseData));

  if (options.variant === 'lawyerSummary') {
    parts.push('## Key evidence\n\n');
    parts.push(evidenceMarkdownList(caseData.evidence));
    parts.push('\n');
    parts.push('## Topics to discuss with your lawyer\n\n');
    parts.push('> These are organisational topics — not legal conclusions or predictions.\n\n');
    parts.push(claimsSection(caseData.claims));
    parts.push('## Questions for lawyer\n\n');
    parts.push(questionsSection(caseData));
    if (caseData.legalNotes.length > 0) {
      parts.push(legalNotesSection(caseData.legalNotes));
    }
    parts.push(gapsSection(caseData));
    return parts.join('');
  }

  parts.push('## Property summary\n\n');
  parts.push(`**Case title:** ${escapeMdCell(caseData.title)}\n\n`);
  parts.push('_Address, landlord, lease type, and tenancy dates are not stored as separate fields yet._\n\n');

  parts.push('## Rent history\n\n');
  parts.push(rentHistorySection(caseData.evidence));

  parts.push('\n## Fee history\n\n');
  parts.push(feeHistorySection(caseData.evidence));

  parts.push('\n## Communication log\n\n');
  parts.push(messagesMarkdownList(caseData.messages));

  parts.push('\n## Evidence list\n\n');
  parts.push(evidenceMarkdownList(caseData.evidence));

  parts.push('\n## Topics to discuss with your lawyer\n\n');
  parts.push('> These are organisational topics — not legal conclusions or predictions.\n\n');
  parts.push(claimsSection(caseData.claims));

  parts.push('## Questions for lawyer\n\n');
  parts.push(questionsSection(caseData));

  parts.push(legalNotesSection(caseData.legalNotes));

  parts.push(gapsSection(caseData));

  return parts.join('');
}
