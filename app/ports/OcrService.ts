export type OcrTier = 'vision' | 'tesseract' | 'manual' | 'cloud';

export interface OcrResult {
  text: string;
  tier: OcrTier;
  requiresUserReview: boolean;
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  extractedAt: Date;
  engineVersion?: string;
}

export interface OcrService {
  extractText(file: File): Promise<OcrResult>;
  isAvailable(): boolean;
}

export class OcrError extends Error {
  constructor(public readonly userMessage: 'error.ocrFailed', message: string) {
    super(message);
    this.name = 'OcrError';
  }
}
