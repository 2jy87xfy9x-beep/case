import { describe, expect, it } from 'vitest';
import { createCase } from '../../app/domain/factories.js';
import { buildMarkdownExport } from '../../app/domain/markdownExport.js';
import type { Evidence } from '../../app/domain/types.js';

const at = new Date('2026-03-24T12:00:00Z');

function baseEvidence(overrides: Partial<Evidence> & Pick<Evidence, 'id'>): Evidence {
  return {
    dateTime: new Date('2026-01-01T00:00:00Z'),
    title: 'Doc',
    body: 'Body text',
    requiresUserReview: false,
    provenance: { tier: 'manual', extractedAt: new Date('2026-01-01T00:00:00Z') },
    ...overrides
  };
}

describe('buildMarkdownExport (Phase 7)', () => {
  it('includes required disclaimer strings and text-only notice', () => {
    const c = createCase({ id: 'c1', title: 'My case' });
    const md = buildMarkdownExport(c, { variant: 'fullCase', exportedAt: at, appVersion: '0.1.0' });
    expect(md).toContain(
      'This document was prepared for organizational purposes only and does not constitute legal advice.'
    );
    expect(md).toContain(
      'Original documents remain on your device and are the authoritative source. This export contains extracted or manually entered text only.'
    );
    expect(md).toContain('Exported: 2026-03-24T12:00:00.000Z');
    expect(md).toContain('App version: 0.1.0');
  });

  it('includes OCR caveat when any evidence used tesseract or vision', () => {
    const c = createCase({ id: 'c1', title: 'Case' });
    c.evidence = [
      baseEvidence({
        id: 'e1',
        provenance: { tier: 'tesseract', extractedAt: new Date('2026-01-01T00:00:00Z') }
      })
    ];
    const md = buildMarkdownExport(c, { variant: 'fullCase', exportedAt: at });
    expect(md).toContain(
      'Some text was extracted automatically and may contain errors. Original images are the authoritative source.'
    );
  });

  it('does not emit data-URL links (text bodies are fenced so image markdown is not active)', () => {
    const c = createCase({ id: 'c1', title: 'Case' });
    c.evidence = [baseEvidence({ id: 'e1', body: 'User wrote ![note](data:image/png;base64,xx)' })];
    const md = buildMarkdownExport(c, { variant: 'fullCase', exportedAt: at });
    expect(md).toContain('```');
    expect(md).not.toMatch(/\]\(data:image/i);
  });

  it('adds Gaps section only when detectGaps is non-empty', () => {
    const empty = createCase({ id: 'c1', title: 'Empty' });
    const mdEmpty = buildMarkdownExport(empty, { variant: 'fullCase', exportedAt: at });
    expect(mdEmpty).not.toContain('## Gaps');

    const withGap = createCase({ id: 'c2', title: 'No lease' });
    withGap.evidence = [
      baseEvidence({
        id: 'e1',
        category: 'rent-notice',
        title: 'Notice',
        body: 'Rent goes up'
      })
    ];
    const mdGap = buildMarkdownExport(withGap, { variant: 'fullCase', exportedAt: at });
    expect(mdGap).toContain('## Gaps');
    expect(mdGap).toMatch(/missing|lease|original/i);
  });

  it('lawyerSummary omits full evidence list and communication log headings', () => {
    const c = createCase({ id: 'c1', title: 'X' });
    c.evidence = [baseEvidence({ id: 'e1', title: 'Lease', body: 'x' })];
    c.messages = [
      {
        id: 'm1',
        threadId: 't',
        dateTime: new Date('2026-01-02T00:00:00Z'),
        sender: 'landlord',
        direction: 'received',
        body: 'hi',
        importSource: 'sms-xml',
        tags: [],
        notes: ''
      }
    ];
    const md = buildMarkdownExport(c, { variant: 'lawyerSummary', exportedAt: at });
    expect(md).not.toContain('## Evidence list');
    expect(md).not.toContain('## Communication log');
    expect(md).toContain('## Key evidence');
  });

  it('lawyerSummary still includes Gaps when present', () => {
    const c = createCase({ id: 'c1', title: 'Y' });
    c.evidence = [
      baseEvidence({
        id: 'e1',
        category: 'rent-notice',
        title: 'N',
        body: 'Increase rent to 900'
      })
    ];
    const md = buildMarkdownExport(c, { variant: 'lawyerSummary', exportedAt: at });
    expect(md).toContain('## Gaps');
  });
});
