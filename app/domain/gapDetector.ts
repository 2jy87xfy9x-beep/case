import type { Case, Gap } from './types.js';

const POSITIVE_EVIDENCE_PATTERNS = {
  lease: /\blease\b/i,
  payment: /\b(payment|receipt|rent paid|bank transfer)\b/i,
  rentIncrease: /\b(rent increase|increase notice|new rent|raised rent)\b/i
};

function hasConfirmedDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

export function detectGaps(caseData: Case): Gap[] {
  const hasAnyData = caseData.evidence.length > 0 || caseData.messages.length > 0;
  if (!hasAnyData) {
    return [];
  }

  const gaps: Gap[] = [];

  const evidenceText = caseData.evidence.map((item) => `${item.title} ${item.body}`);

  if (!evidenceText.some((text) => POSITIVE_EVIDENCE_PATTERNS.lease.test(text))) {
    gaps.push({
      id: 'gap.missingLease',
      displayName: 'Missing lease document',
      description: 'Add a lease copy or photos so baseline terms are available.',
      severity: 'notable'
    });
  }

  if (!evidenceText.some((text) => POSITIVE_EVIDENCE_PATTERNS.payment.test(text))) {
    gaps.push({
      id: 'gap.missingPaymentRecord',
      displayName: 'Missing payment record',
      description: 'Add a rent receipt, bank transfer, or payment confirmation.',
      severity: 'suggested'
    });
  }

  if (!evidenceText.some((text) => POSITIVE_EVIDENCE_PATTERNS.rentIncrease.test(text))) {
    gaps.push({
      id: 'gap.missingRentIncreaseNotice',
      displayName: 'Missing rent increase notice',
      description: 'Add written notice showing when and how rent changed.',
      severity: 'suggested'
    });
  }

  const hasDateEvidence = caseData.evidence.some((item) => hasConfirmedDate(item.dateTime));
  const hasDateMessages = caseData.messages.some((item) => hasConfirmedDate(item.dateTime));
  if (!hasDateEvidence && !hasDateMessages) {
    gaps.push({
      id: 'gap.noConfirmedDates',
      displayName: 'No confirmed dates',
      description: 'Add at least one message or document with a concrete date.',
      severity: 'notable'
    });
  }

  return gaps;
}
