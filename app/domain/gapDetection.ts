import type { Evidence, Gap, Message } from './types.js';

export function detectGaps(input: { evidence: Evidence[]; messages: Message[] }): Gap[] {
  const gaps: Gap[] = [];

  const hasLease = input.evidence.some((item) => /lease/i.test(item.title) || /lease/i.test(item.body));
  if (!hasLease) {
    gaps.push({
      id: 'gap.missingLease',
      displayName: 'No original lease found',
      description: 'Add your signed lease so your lawyer can review baseline terms.',
      severity: 'notable'
    });
  }

  const hasPaymentRecord = input.evidence.some((item) => /payment|receipt|rent/i.test(item.title + ' ' + item.body));
  if (!hasPaymentRecord) {
    gaps.push({
      id: 'gap.missingPaymentRecord',
      displayName: 'No payment records yet',
      description: 'Upload rent receipts or bank screenshots to support timeline events.',
      severity: 'suggested'
    });
  }

  const hasLandlordMessages = input.messages.some((m) => m.sender === 'landlord' || m.direction === 'received');
  if (!hasLandlordMessages) {
    gaps.push({
      id: 'gap.missingLandlordMessages',
      displayName: 'No landlord messages found',
      description: 'Import message history to preserve communication context.',
      severity: 'suggested'
    });
  }

  return gaps;
}
