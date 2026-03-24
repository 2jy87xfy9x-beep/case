import { describe, expect, it } from 'vitest';
import { ManualOcrService } from '../../app/ocr/manual/index.js';
import { TesseractOcrService } from '../../app/ocr/tesseract/index.js';
import { selectTier } from '../../app/ocr/tiered/selectTier.js';
import { OcrError } from '../../app/ports/OcrService.js';

const file = new File(['x'], 'x.txt');

describe('ocr tier selection and services', () => {
  it('selectTier follows vision -> tesseract -> manual and cloud opt-in only', () => {
    expect(selectTier(['vision', 'tesseract'])).toBe('vision');
    expect(selectTier(['tesseract', 'manual'])).toBe('tesseract');
    expect(selectTier(['manual'])).toBe('manual');
    expect(selectTier(['cloud', 'manual'])).toBe('manual');
    expect(selectTier(['cloud', 'manual'], 'cloud')).toBe('cloud');
  });

  it('manual service returns first-class OcrResult', async () => {
    const service = new ManualOcrService('typed notes', () => new Date('2026-01-01T00:00:00Z'));
    const result = await service.extractText(file);
    expect(result.tier).toBe('manual');
    expect(result.requiresUserReview).toBe(false);
    expect(result.confidence).toBe('high');
  });

  it('tesseract low confidence returns low + review true', async () => {
    const service = new TesseractOcrService(
      {
        recognize: async () => ({ text: 'ocr text', confidence: 0.2, engineVersion: 't-v1' })
      },
      () => new Date('2026-01-01T00:00:00Z')
    );

    const result = await service.extractText(file);
    expect(result.confidence).toBe('low');
    expect(result.requiresUserReview).toBe(true);
    expect(result.engineVersion).toBe('t-v1');
  });

  it('tesseract timeout throws structured error', async () => {
    const service = new TesseractOcrService(
      {
        recognize: async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return { text: 'late', confidence: 0.9 };
        }
      },
      () => new Date('2026-01-01T00:00:00Z'),
      1
    );

    await expect(service.extractText(file)).rejects.toBeInstanceOf(OcrError);
  });
});
