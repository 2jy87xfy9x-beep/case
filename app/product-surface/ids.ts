/**
 * Stable ids for product copy, analytics, and accessibility labels (plan Phase 5 / 8).
 */

export const GAP_SURFACE_IDS = [
  'gap.missingLease',
  'gap.missingPaymentRecord',
  'gap.missingRentIncreaseNotice',
  'gap.noConfirmedDates',
  'section.caseGaps',
  'item.gap'
] as const;

export type GapSurfaceId = (typeof GAP_SURFACE_IDS)[number];
