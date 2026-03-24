import { describe, expect, it } from 'vitest';
import { createCase } from '../../app/domain/factories.js';
import { detectGaps } from '../../app/domain/gapDetector.js';
import type { Evidence, Message } from '../../app/domain/types.js';

function baseEvidence(overrides: Partial<Evidence>): Evidence {
  return {
    id: 'e1',
    dateTime: new Date('2026-01-01T00:00:00Z'),
    title: 'Document',
    body: 'General case notes',
    requiresUserReview: false,
    provenance: { tier: 'manual', extractedAt: new Date('2026-01-01T00:00:00Z') },
    ...overrides
  };
}

function baseMessage(overrides: Partial<Message>): Message {
  return {
    id: 'm1',
    threadId: 't1',
    dateTime: new Date('2026-01-01T00:00:00Z'),
    sender: 'landlord',
    direction: 'received',
    body: 'Message',
    importSource: 'manual',
    tags: [],
    notes: '',
    ...overrides
  };
}

describe('detectGaps seed rules', () => {
  it('empty case baseline returns no gaps', () => {
    const caseData = createCase({ id: 'c-empty', title: 'Empty' });
    expect(detectGaps(caseData)).toEqual([]);
  });

  it('gap.missingLease triggers without lease and does not trigger with lease evidence', () => {
    const noLease = createCase({ id: 'c1', title: 'No lease' });
    noLease.evidence = [baseEvidence({ title: 'Payment receipt', body: 'rent paid' })];
    noLease.messages = [baseMessage({})];

    const withLease = createCase({ id: 'c2', title: 'With lease' });
    withLease.evidence = [baseEvidence({ title: 'Signed Lease', body: 'Apartment terms' })];

    expect(detectGaps(noLease).map((gap) => gap.id)).toContain('gap.missingLease');
    expect(detectGaps(withLease).map((gap) => gap.id)).not.toContain('gap.missingLease');
  });

  it('gap.missingPaymentRecord triggers without payment and does not trigger with payment evidence', () => {
    const noPayment = createCase({ id: 'c3', title: 'No payment' });
    noPayment.evidence = [baseEvidence({ title: 'Lease', body: 'terms only' })];
    noPayment.messages = [baseMessage({})];

    const withPayment = createCase({ id: 'c4', title: 'With payment' });
    withPayment.evidence = [baseEvidence({ title: 'Bank transfer receipt', body: 'January rent paid' })];

    expect(detectGaps(noPayment).map((gap) => gap.id)).toContain('gap.missingPaymentRecord');
    expect(detectGaps(withPayment).map((gap) => gap.id)).not.toContain('gap.missingPaymentRecord');
  });

  it('gap.missingRentIncreaseNotice triggers without notice and does not trigger with notice evidence', () => {
    const noNotice = createCase({ id: 'c5', title: 'No notice' });
    noNotice.evidence = [baseEvidence({ title: 'Lease', body: 'annual agreement' })];
    noNotice.messages = [baseMessage({})];

    const withNotice = createCase({ id: 'c6', title: 'With notice' });
    withNotice.evidence = [baseEvidence({ title: 'Rent increase notice', body: 'new rent starts May 1' })];

    expect(detectGaps(noNotice).map((gap) => gap.id)).toContain('gap.missingRentIncreaseNotice');
    expect(detectGaps(withNotice).map((gap) => gap.id)).not.toContain('gap.missingRentIncreaseNotice');
  });

  it('gap.noConfirmedDates triggers when no valid dates and does not trigger with confirmed date', () => {
    const noDates = createCase({ id: 'c7', title: 'No dates' });
    noDates.evidence = [baseEvidence({ dateTime: new Date('invalid') })];
    noDates.messages = [baseMessage({ dateTime: new Date('invalid') })];

    const withDate = createCase({ id: 'c8', title: 'With dates' });
    withDate.messages = [baseMessage({ dateTime: new Date('2026-01-05T00:00:00Z') })];

    expect(detectGaps(noDates).map((gap) => gap.id)).toContain('gap.noConfirmedDates');
    expect(detectGaps(withDate).map((gap) => gap.id)).not.toContain('gap.noConfirmedDates');
  });
});
