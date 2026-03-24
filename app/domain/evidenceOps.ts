import type { Case, EvidenceCategory } from './types.js';

/**
 * Sets or clears `category` on a single evidence row. Returns a new `Case` immutably.
 * If `evidenceId` is not found, returns `caseData` unchanged.
 */
export function setEvidenceCategory(
  caseData: Case,
  evidenceId: string,
  category: EvidenceCategory | undefined
): Case {
  let found = false;
  const evidence = caseData.evidence.map((e) => {
    if (e.id !== evidenceId) return e;
    found = true;
    if (category === undefined) {
      const { category: _removed, ...rest } = e;
      return rest;
    }
    return { ...e, category };
  });
  if (!found) return caseData;
  return { ...caseData, evidence };
}
