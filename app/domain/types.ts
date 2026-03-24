export type MessageSender = 'you' | 'landlord' | 'other';
export type MessageDirection = 'sent' | 'received';
export type MessageImportSource = 'imazing-csv' | 'sms-xml' | 'screenshot-ocr' | 'manual';

export interface Message {
  id: string;
  threadId: string;
  dateTime: Date;
  sender: MessageSender;
  direction: MessageDirection;
  body: string;
  importSource: MessageImportSource;
  tags: string[];
  notes: string;
}

export type OcrMethod = 'vision' | 'tesseract' | 'manual' | 'cloud';

/** User- or review-assigned bucket for gap detection and export (Phase 5). */
export type EvidenceCategory =
  | 'lease' | 'payment' | 'rent-notice' | 'fee-notice' | 'other'  // v1 — unchanged
  | 'repair' | 'photo' | 'message' | 'amendment';                  // v2 additions

export interface Evidence {
  id: string;
  dateTime: Date;
  title: string;
  body: string;
  requiresUserReview: boolean;
  /** When unset, the item is treated as uncategorized for gap rules. */
  category?: EvidenceCategory;
  provenance: {
    tier: OcrMethod;
    extractedAt: Date;
    engineVersion?: string;
  };
}

/** Conservative status labels — sound like a notebook, not a legal assessment. */
export type ClaimStatus = 'researching' | 'ready-to-discuss' | 'resolved' | 'dropped';
export type ConfidenceLevel = 'low' | 'medium' | 'high';
export type NoteApplies = 'yes' | 'maybe' | 'no';

/**
 * A topic the user wants to discuss with their lawyer.
 * Framed as an organisational record — not a legal conclusion.
 * All UI copy must pass the conservative framing rule (see plan gate.claimsModuleLegalReview).
 */
export interface Claim {
  id: string;
  title: string;
  description: string;
  status: ClaimStatus;
  confidence: ConfidenceLevel;
  relatedEvidenceIds: string[];
  relatedLegalNoteIds: string[];
  questions: string[];
}

/**
 * A note the user has taken about something they read or researched.
 * The app does not generate these — the user records what *they* have learned.
 */
export interface LegalNote {
  id: string;
  topic: string;
  summary: string;
  source: string;
  appliesToCase: NoteApplies;
  confidence: ConfidenceLevel;
  relatedClaimIds: string[];
  relatedEvidenceIds: string[];
  questions: string[];
}

export interface Case {
  id: string;
  title: string;
  lastExportedAt: Date | null;
  evidence: Evidence[];
  messages: Message[];
  claims: Claim[];
  legalNotes: LegalNote[];
  lawyers: Lawyer[];
  // v2 additions — all optional so existing stored records remain valid
  parties?: { tenant: string; landlord: string };
  property?: { address: string; unit: string; jurisdiction: string };
  tenancy?: { startDate: Date | null; monthlyRentOriginal: number | null; monthlyRentCurrent: number | null };
  clientGoal?: string;
  status?: 'ready' | 'gaps' | 'processing';
  source?: 'drop-folder' | 'upload' | 'manual' | 'mixed';
  timeline?: TimelineItem[];
  gaps?: Gap[];
  libraryRefs?: string[];
}

export interface Gap {
  id: 'gap.missingLease' | 'gap.missingPaymentRecord' | 'gap.missingRentIncreaseNotice' | 'gap.noConfirmedDates';
  displayName: string;
  description: string;
  severity: 'suggested' | 'notable';
}

export interface Lawyer {
  id: string;
  name: string;
  firm: string;
  phoneOrEmail: string;
  contacted: boolean;
  consultationType: 'free' | 'paid' | 'legal-aid' | 'contingency' | 'unknown';
  notes: string;
  status: string;
  questions: string[];
}

export type TimelineItem =
  | ({ kind: 'evidence' } & Evidence)
  | ({ kind: 'message' } & Message);
