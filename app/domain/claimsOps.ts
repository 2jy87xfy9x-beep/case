/**
 * Pure domain operations for Claim and LegalNote entities (Phase 6).
 *
 * Conservative framing rule (plan gate.claimsModuleLegalReview):
 * All display strings must sound like a filing system or notebook —
 * not a legal assessment. See plan for full rule text.
 */
import { randomUUID } from 'node:crypto';
import type { Case, Claim, ConfidenceLevel, LegalNote, NoteApplies } from './types.js';

// ── Factories ──────────────────────────────────────────────────────────────

export function createClaim(input: {
  title: string;
  description?: string;
  status?: Claim['status'];
  confidence?: ConfidenceLevel;
}): Claim {
  return {
    id: randomUUID(),
    title: input.title,
    description: input.description ?? '',
    status: input.status ?? 'researching',
    confidence: input.confidence ?? 'low',
    relatedEvidenceIds: [],
    relatedLegalNoteIds: [],
    questions: []
  };
}

export function createLegalNote(input: {
  topic: string;
  summary?: string;
  source?: string;
  appliesToCase?: NoteApplies;
  confidence?: ConfidenceLevel;
}): LegalNote {
  return {
    id: randomUUID(),
    topic: input.topic,
    summary: input.summary ?? '',
    source: input.source ?? '',
    appliesToCase: input.appliesToCase ?? 'maybe',
    confidence: input.confidence ?? 'low',
    relatedClaimIds: [],
    relatedEvidenceIds: [],
    questions: []
  };
}

// ── Claim mutations (immutable) ────────────────────────────────────────────

export function addClaim(caseData: Case, claim: Claim): Case {
  return { ...caseData, claims: [...caseData.claims, claim] };
}

export function updateClaim(
  caseData: Case,
  claimId: string,
  updates: Partial<Omit<Claim, 'id'>>
): Case {
  const claims = caseData.claims.map((c) => (c.id === claimId ? { ...c, ...updates } : c));
  return { ...caseData, claims };
}

export function removeClaim(caseData: Case, claimId: string): Case {
  return { ...caseData, claims: caseData.claims.filter((c) => c.id !== claimId) };
}

export function addQuestionToClaim(caseData: Case, claimId: string, question: string): Case {
  return updateClaim(caseData, claimId, {
    questions: [
      ...(caseData.claims.find((c) => c.id === claimId)?.questions ?? []),
      question
    ]
  });
}

// ── LegalNote mutations (immutable) ────────────────────────────────────────

export function addLegalNote(caseData: Case, note: LegalNote): Case {
  return { ...caseData, legalNotes: [...caseData.legalNotes, note] };
}

export function updateLegalNote(
  caseData: Case,
  noteId: string,
  updates: Partial<Omit<LegalNote, 'id'>>
): Case {
  const legalNotes = caseData.legalNotes.map((n) => (n.id === noteId ? { ...n, ...updates } : n));
  return { ...caseData, legalNotes };
}

export function removeLegalNote(caseData: Case, noteId: string): Case {
  return { ...caseData, legalNotes: caseData.legalNotes.filter((n) => n.id !== noteId) };
}

// ── Combined queries ───────────────────────────────────────────────────────

/**
 * All questions gathered from claims and legal notes — used in the
 * "Questions for lawyer" export section.
 */
export function getCombinedQuestions(caseData: Case): string[] {
  return [
    ...caseData.claims.flatMap((c) => c.questions),
    ...caseData.legalNotes.flatMap((n) => n.questions)
  ];
}
