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

export interface Evidence {
  id: string;
  dateTime: Date;
  title: string;
  body: string;
  requiresUserReview: boolean;
  provenance: {
    tier: OcrMethod;
    extractedAt: Date;
    engineVersion?: string;
  };
}

export interface Case {
  id: string;
  title: string;
  lastExportedAt: Date | null;
}

export interface Gap {
  id: string;
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
