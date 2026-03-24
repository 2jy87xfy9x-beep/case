import { describe, expect, it } from 'vitest';
import { createCase } from '../../app/domain/factories.js';
import { detectGaps } from '../../app/domain/gapDetector.js';
import type { Evidence } from '../../app/domain/types.js';
import { GAP_SURFACE_IDS } from '../../app/product-surface/ids.js';

function evidence(overrides: Partial<Evidence> & Pick<Evidence, 'id'>): Evidence {
  return {
    dateTime: new Date('2026-01-01T00:00:00Z'),
    title: 'Document',
    body: 'Body text',
    requiresUserReview: false,
    provenance: { tier: 'manual', extractedAt: new Date('2026-01-01T00:00:00Z') },
    ...overrides
  };
}

describe('detectGaps (Phase 5 — positive-evidence-only)', () => {
  it('returns empty array when there is no evidence, even if messages exist', () => {
    const caseData = createCase({ id: 'c0', title: 'Messages only' });
    caseData.messages = [
      {
        id: 'm1',
        threadId: 't1',
        dateTime: new Date('2026-01-02T00:00:00Z'),
        sender: 'landlord',
        direction: 'received',
        body: 'Rent due',
        importSource: 'sms-xml',
        tags: [],
        notes: ''
      }
    ];
    expect(detectGaps(caseData)).toEqual([]);
  });

  it('case with rent-notice but no lease-tagged evidence returns gap.missingLease', () => {
    const caseData = createCase({ id: 'c1', title: 'Rent notice only' });
    caseData.evidence = [
      evidence({
        id: 'e1',
        category: 'rent-notice',
        title: 'Rent notice',
        body: 'February rent amount'
      })
    ];
    const gaps = detectGaps(caseData);
    expect(gaps.map((g) => g.id)).toContain('gap.missingLease');
  });

  it('case with lease and rent notice does not return gap.missingLease', () => {
    const caseData = createCase({ id: 'c2', title: 'Complete' });
    caseData.evidence = [
      evidence({ id: 'e1', category: 'lease', title: 'Lease', body: 'Terms' }),
      evidence({ id: 'e2', category: 'rent-notice', title: 'Notice', body: 'Rent' })
    ];
    expect(detectGaps(caseData).map((g) => g.id)).not.toContain('gap.missingLease');
  });

  it('fee notice without payment-tagged evidence returns gap.missingPaymentRecord', () => {
    const caseData = createCase({ id: 'c3', title: 'Fee' });
    caseData.evidence = [
      evidence({ id: 'e1', category: 'fee-notice', title: 'Late fee', body: 'Fee assessed' })
    ];
    expect(detectGaps(caseData).map((g) => g.id)).toContain('gap.missingPaymentRecord');
  });

  it('fee notice with payment-tagged evidence does not return gap.missingPaymentRecord', () => {
    const caseData = createCase({ id: 'c4', title: 'Fee + pay' });
    caseData.evidence = [
      evidence({ id: 'e1', category: 'fee-notice', title: 'Fee', body: 'Due' }),
      evidence({ id: 'e2', category: 'payment', title: 'Receipt', body: 'Paid' })
    ];
    expect(detectGaps(caseData).map((g) => g.id)).not.toContain('gap.missingPaymentRecord');
  });

  it('rent increase keywords in text without rent-notice category returns gap.missingRentIncreaseNotice', () => {
    const caseData = createCase({ id: 'c5', title: 'Informal' });
    caseData.evidence = [
      evidence({
        id: 'e1',
        category: 'other',
        title: 'Email',
        body: 'Landlord said there will be a rent increase next month.'
      })
    ];
    expect(detectGaps(caseData).map((g) => g.id)).toContain('gap.missingRentIncreaseNotice');
  });

  it('rent increase text with rent-notice item does not return gap.missingRentIncreaseNotice', () => {
    const caseData = createCase({ id: 'c6', title: 'Formal' });
    caseData.evidence = [
      evidence({
        id: 'e1',
        category: 'rent-notice',
        title: 'Official notice',
        body: 'Rent increase effective June 1'
      })
    ];
    expect(detectGaps(caseData).map((g) => g.id)).not.toContain('gap.missingRentIncreaseNotice');
  });

  it('gap.noConfirmedDates when more than half of 3+ evidence items lack confirmed dates', () => {
    const caseData = createCase({ id: 'c7', title: 'Dates' });
    caseData.evidence = [
      evidence({ id: 'a', dateTime: new Date('invalid'), category: 'other', body: 'x' }),
      evidence({ id: 'b', dateTime: new Date('invalid'), category: 'other', body: 'y' }),
      evidence({ id: 'c', dateTime: new Date('2026-02-01T00:00:00Z'), category: 'other', body: 'z' })
    ];
    expect(detectGaps(caseData).map((g) => g.id)).toContain('gap.noConfirmedDates');
  });

  it('gap.noConfirmedDates does not fire when at least half of evidence has confirmed dates', () => {
    const caseData = createCase({ id: 'c8', title: 'Ok dates' });
    caseData.evidence = [
      evidence({ id: 'a', dateTime: new Date('2026-01-01T00:00:00Z'), category: 'other', body: 'x' }),
      evidence({ id: 'b', dateTime: new Date('2026-01-02T00:00:00Z'), category: 'other', body: 'y' }),
      evidence({ id: 'c', dateTime: new Date('invalid'), category: 'other', body: 'z' })
    ];
    expect(detectGaps(caseData).map((g) => g.id)).not.toContain('gap.noConfirmedDates');
  });

  it('every returned gap has non-empty id, displayName, and description', () => {
    const caseData = createCase({ id: 'c9', title: 'Many gaps' });
    caseData.evidence = [
      evidence({
        id: 'e1',
        category: 'fee-notice',
        title: 'Fee',
        body: 'rent increase mentioned in fee letter'
      })
    ];
    for (const gap of detectGaps(caseData)) {
      expect(gap.id.length).toBeGreaterThan(0);
      expect(gap.displayName.trim().length).toBeGreaterThan(0);
      expect(gap.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('detectGaps is pure (same input → same output)', () => {
    const caseData = createCase({ id: 'c10', title: 'Pure' });
    caseData.evidence = [
      evidence({ id: 'e1', category: 'rent-notice', title: 'N', body: 'Rent due' })
    ];
    const a = JSON.stringify(detectGaps(caseData));
    const b = JSON.stringify(detectGaps(caseData));
    expect(a).toBe(b);
  });

  it('registers gap-related surface ids from product-surface/ids', () => {
    expect(GAP_SURFACE_IDS).toContain('gap.missingLease');
    expect(GAP_SURFACE_IDS).toContain('section.caseGaps');
  });

  it('evidence with category "repair" does not cause detectGaps to throw', () => {
    const caseData = createCase({ id: 'c11', title: 'Repair category' });
    caseData.evidence = [
      evidence({ id: 'e1', category: 'repair', title: 'Repair request', body: 'Broken heater' })
    ];
    expect(() => detectGaps(caseData)).not.toThrow();
  });
});
