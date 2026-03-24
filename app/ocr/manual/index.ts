import type { OcrResult, OcrService } from '../../ports/OcrService.js';

export class ManualOcrService implements OcrService {
  constructor(private readonly inputText: string, private readonly now: () => Date = () => new Date()) {}

  isAvailable(): boolean {
    return true;
  }

  async extractText(_file: File): Promise<OcrResult> {
    return {
      text: this.inputText,
      tier: 'manual',
      requiresUserReview: false,
      confidence: 'high',
      extractedAt: this.now(),
      engineVersion: 'manual-v1'
    };
  }
}
