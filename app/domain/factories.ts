import { randomUUID } from 'node:crypto';
import type {
  Case,
  Evidence,
  EvidenceCategory,
  Lawyer,
  Message,
  MessageDirection,
  MessageImportSource,
  MessageSender,
  OcrMethod
} from './types.js';

export function createEvidence(input: {
  id?: string;
  title: string;
  body?: string;
  dateTime?: Date;
  category?: EvidenceCategory;
  requiresUserReview?: boolean;
  sourceFile?: string;
  thumbnail?: string;
  provenance?: { tier: OcrMethod; extractedAt: Date; engineVersion?: string };
}): Evidence {
  const ev: Evidence = {
    id: input.id ?? randomUUID(),
    title: input.title,
    body: input.body ?? '',
    dateTime: input.dateTime ?? new Date(NaN),
    category: input.category,
    requiresUserReview: input.requiresUserReview ?? false,
    provenance: input.provenance ?? { tier: 'manual', extractedAt: new Date() }
  };
  if (input.sourceFile !== undefined) ev.sourceFile = input.sourceFile;
  if (input.thumbnail !== undefined) ev.thumbnail = input.thumbnail;
  return ev;
}

export function createMessage(input: {
  threadId: string;
  dateTime: Date;
  sender: MessageSender;
  direction: MessageDirection;
  body: string;
  importSource: MessageImportSource;
  requiresUserReview?: boolean;
  tags?: string[];
  notes?: string;
  id?: string;
}): Message {
  return {
    id: input.id ?? randomUUID(),
    threadId: input.threadId,
    dateTime: input.dateTime,
    sender: input.sender,
    direction: input.direction,
    body: input.body,
    importSource: input.importSource,
    requiresUserReview: input.requiresUserReview ?? false,
    tags: input.tags ?? [],
    notes: input.notes ?? ''
  };
}

export function createCase(input: { id?: string; title: string }): Case {
  return {
    id: input.id ?? randomUUID(),
    title: input.title,
    lastExportedAt: null,
    evidence: [],
    messages: [],
    claims: [],
    legalNotes: [],
    lawyers: []
  };
}

export function createLawyer(input: {
  name: string;
  firm?: string;
  phoneOrEmail?: string;
  consultationType?: Lawyer['consultationType'];
  notes?: string;
  status?: string;
  id?: string;
}): Lawyer {
  return {
    id: input.id ?? randomUUID(),
    name: input.name,
    firm: input.firm ?? '',
    phoneOrEmail: input.phoneOrEmail ?? '',
    contacted: false,
    consultationType: input.consultationType ?? 'unknown',
    notes: input.notes ?? '',
    status: input.status ?? '',
    questions: []
  };
}
