import type { Case, Evidence, Message } from '../domain/types.js';

export interface CaseRepository {
  saveCase(caseData: Case): Promise<void>;
  loadCase(caseId: string): Promise<Case | null>;
  saveEvidence(caseId: string, evidence: Evidence[]): Promise<void>;
  listEvidence(caseId: string): Promise<Evidence[]>;
  saveMessages(caseId: string, messages: Message[]): Promise<void>;
  listMessages(caseId: string): Promise<Message[]>;
}
