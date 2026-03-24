import type { Case, Claim, Evidence, LegalNote, Message } from '../domain/types.js';

export interface CaseRepository {
  saveCase(caseData: Case): Promise<void>;
  loadCase(caseId: string): Promise<Case | null>;
  saveEvidence(caseId: string, evidence: Evidence[]): Promise<void>;
  listEvidence(caseId: string): Promise<Evidence[]>;
  saveMessages(caseId: string, messages: Message[]): Promise<void>;
  listMessages(caseId: string): Promise<Message[]>;
  saveClaims(caseId: string, claims: Claim[]): Promise<void>;
  listClaims(caseId: string): Promise<Claim[]>;
  saveLegalNotes(caseId: string, legalNotes: LegalNote[]): Promise<void>;
  listLegalNotes(caseId: string): Promise<LegalNote[]>;
}
