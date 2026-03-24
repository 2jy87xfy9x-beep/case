/**
 * Stable ids for product copy, analytics, and accessibility labels (plan Phase 5 / 6 / 8).
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

/** Phase 6 — Claims and Legal Notes (conservative framing throughout) */
export const CLAIMS_SURFACE_IDS = [
  'screen.claims',
  'screen.lawNotes',
  'action.addClaim',
  'action.updateClaim',
  'action.removeClaim',
  'action.addLegalNote',
  'action.updateLegalNote',
  'action.removeLegalNote',
  'action.addQuestionToClaim',
  'section.topicsToDiscuss',
  'section.researchNotes',
  'section.questionsForLawyer',
  'item.claim',
  'item.legalNote',
  'copy.claimsDisclaimer'
] as const;

export type ClaimsSurfaceId = (typeof CLAIMS_SURFACE_IDS)[number];
