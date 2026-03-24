/**
 * Pure domain operations for the Lawyer entity (Phase 1 MVP scope).
 *
 * Lawyers are stored on the Case to support "consultation prep" — the user
 * records contact info, consultation type, and questions before meeting a
 * lawyer.  These ops are intentionally minimal; the full lawyer tracker
 * is post-MVP.
 */
import type { Case, Lawyer } from './types.js';

// ── Mutations (immutable) ────────────────────────────────────────────────────

export function addLawyer(caseData: Case, lawyer: Lawyer): Case {
  return { ...caseData, lawyers: [...caseData.lawyers, lawyer] };
}

export function updateLawyer(
  caseData: Case,
  lawyerId: string,
  updates: Partial<Omit<Lawyer, 'id'>>
): Case {
  const lawyers = caseData.lawyers.map((l) => (l.id === lawyerId ? { ...l, ...updates } : l));
  return { ...caseData, lawyers };
}

export function removeLawyer(caseData: Case, lawyerId: string): Case {
  return { ...caseData, lawyers: caseData.lawyers.filter((l) => l.id !== lawyerId) };
}

export function markLawyerContacted(caseData: Case, lawyerId: string): Case {
  return updateLawyer(caseData, lawyerId, { contacted: true });
}

export function addQuestionToLawyer(caseData: Case, lawyerId: string, question: string): Case {
  const lawyer = caseData.lawyers.find((l) => l.id === lawyerId);
  if (!lawyer) return caseData;
  return updateLawyer(caseData, lawyerId, { questions: [...lawyer.questions, question] });
}

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * All questions gathered from all lawyers — used in the
 * "Questions for lawyer" export section when multiple lawyers are tracked.
 */
export function getAllLawyerQuestions(caseData: Case): string[] {
  return caseData.lawyers.flatMap((l) => l.questions);
}
