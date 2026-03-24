import { randomUUID } from 'node:crypto';
import { prepareImageForOcr } from './prepareImageForOcr.js';
import type { Evidence } from '../domain/types.js';
import type { OcrService } from '../ports/OcrService.js';

export async function uploadToEvidence(input: {
  file: File;
  title: string;
  dateTime: Date;
  ocrService: OcrService;
}): Promise<Evidence> {
  const prepared = await prepareImageForOcr(input.file);
  const ocr = await input.ocrService.extractText(prepared);

  return {
    id: randomUUID(),
    dateTime: input.dateTime,
    title: input.title,
    body: ocr.text,
    requiresUserReview: ocr.requiresUserReview,
    provenance: {
      tier: ocr.tier,
      extractedAt: ocr.extractedAt,
      engineVersion: ocr.engineVersion
    }
  };
}
