import { OcrError, type OcrResult, type OcrService } from '../../ports/OcrService.js';

export interface TesseractEngine {
  recognize(file: File): Promise<{ text: string; confidence: number; engineVersion?: string }>;
}

export class TesseractOcrService implements OcrService {
  constructor(
    private readonly engine: TesseractEngine,
    private readonly now: () => Date = () => new Date(),
    private readonly timeoutMs = 5000
  ) {}

  isAvailable(): boolean {
    return true;
  }

  async extractText(file: File): Promise<OcrResult> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new OcrError('error.ocrFailed', 'OCR timed out')), this.timeoutMs);
    });

    const result = await Promise.race([this.engine.recognize(file), timeoutPromise]);

    const confidence =
      result.confidence >= 0.9 ? 'high' : result.confidence >= 0.7 ? 'medium' : result.confidence >= 0 ? 'low' : 'unknown';

    return {
      text: result.text,
      tier: 'tesseract',
      requiresUserReview: true,
      confidence,
      extractedAt: this.now(),
      engineVersion: result.engineVersion ?? 'tesseract-unknown'
    };
  }
}
