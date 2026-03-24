import type { Case, Evidence, Gap } from './types.js';

const RENT_INCREASE_KEYWORDS = /\b(rent increase|increase notice|new rent|raised rent)\b/i;

function hasConfirmedDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

function itemText(e: Evidence): string {
  return `${e.title} ${e.body}`;
}

function hasCategory(caseData: Case, category: Evidence['category']): boolean {
  return caseData.evidence.some((e) => e.category === category);
}

function hasRentOrFeeNotice(caseData: Case): boolean {
  return hasCategory(caseData, 'rent-notice') || hasCategory(caseData, 'fee-notice');
}

function hasRentIncreaseText(caseData: Case): boolean {
  return caseData.evidence.some((e) => RENT_INCREASE_KEYWORDS.test(itemText(e)));
}

/**
 * Positive-evidence-only gap detection: only flags when existing evidence
 * implies something else should exist (see plan Phase 5).
 */
export function detectGaps(caseData: Case): Gap[] {
  if (caseData.evidence.length === 0) {
    return [];
  }

  const gaps: Gap[] = [];

  if (hasRentOrFeeNotice(caseData) && !hasCategory(caseData, 'lease')) {
    gaps.push({
      id: 'gap.missingLease',
      displayName: 'No lease or rental agreement found',
      description:
        'You added a rent-related or fee notice. Adding the lease or rental agreement helps tie those items together.',
      severity: 'notable'
    });
  }

  if (hasCategory(caseData, 'fee-notice') && !hasCategory(caseData, 'payment')) {
    gaps.push({
      id: 'gap.missingPaymentRecord',
      displayName: 'No payment records found',
      description:
        'A fee notice is on file. Payment receipts or transfer records help show what was paid.',
      severity: 'suggested'
    });
  }

  if (hasRentIncreaseText(caseData) && !hasCategory(caseData, 'rent-notice')) {
    gaps.push({
      id: 'gap.missingRentIncreaseNotice',
      displayName: 'Possible rent increase — no formal notice found',
      description:
        'Something mentions a rent increase, but nothing is marked as a formal rent-increase notice.',
      severity: 'suggested'
    });
  }

  const { evidence } = caseData;
  if (evidence.length >= 3) {
    const withoutConfirmedDate = evidence.filter((e) => !hasConfirmedDate(e.dateTime)).length;
    if (withoutConfirmedDate * 2 > evidence.length) {
      gaps.push({
        id: 'gap.noConfirmedDates',
        displayName: 'Most documents have no confirmed date — adding dates helps build your timeline',
        description: 'More than half of your evidence items need a confirmed date for a clearer timeline.',
        severity: 'notable'
      });
    }
  }

  return gaps;
}
