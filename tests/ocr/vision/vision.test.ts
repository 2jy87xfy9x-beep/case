import { describe, expect, it } from 'vitest';
import { VisionOcrService } from '../../../app/ocr/vision/index.js';
import { OcrError } from '../../../app/ports/OcrService.js';

const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
const now = () => new Date('2026-03-24T00:00:00Z');

describe('VisionOcrService', () => {
  it('returns tier=vision with correct confidence mapping for high score', async () => {
    const service = new VisionOcrService(
      {
        isAvailable: () => true,
        recognize: async () => ({ text: 'Lease text', confidence: 0.95, engineVersion: 'vision-v2' })
      },
      now
    );

    const result = await service.extractText(file);
    expect(result.tier).toBe('vision');
    expect(result.confidence).toBe('high');
    expect(result.requiresUserReview).toBe(true);
    expect(result.text).toBe('Lease text');
    expect(result.engineVersion).toBe('vision-v2');
    expect(result.extractedAt).toEqual(new Date('2026-03-24T00:00:00Z'));
  });

  it('maps confidence 0.75 → medium', async () => {
    const service = new VisionOcrService(
      { isAvailable: () => true, recognize: async () => ({ text: 't', confidence: 0.75 }) },
      now
    );
    const result = await service.extractText(file);
    expect(result.confidence).toBe('medium');
  });

  it('maps confidence 0.3 → low', async () => {
    const service = new VisionOcrService(
      { isAvailable: () => true, recognize: async () => ({ text: 't', confidence: 0.3 }) },
      now
    );
    const result = await service.extractText(file);
    expect(result.confidence).toBe('low');
  });

  it('isAvailable() delegates to engine', () => {
    const available = new VisionOcrService({ isAvailable: () => true, recognize: async () => ({ text: '', confidence: 1 }) }, now);
    const unavailable = new VisionOcrService({ isAvailable: () => false, recognize: async () => ({ text: '', confidence: 1 }) }, now);
    expect(available.isAvailable()).toBe(true);
    expect(unavailable.isAvailable()).toBe(false);
  });

  it('throws OcrError when engine is unavailable at call time', async () => {
    const service = new VisionOcrService(
      { isAvailable: () => false, recognize: async () => ({ text: '', confidence: 1 }) },
      now
    );
    await expect(service.extractText(file)).rejects.toBeInstanceOf(OcrError);
  });

  it('wraps engine rejection in OcrError', async () => {
    const service = new VisionOcrService(
      {
        isAvailable: () => true,
        recognize: async () => { throw new Error('native crash'); }
      },
      now
    );
    await expect(service.extractText(file)).rejects.toBeInstanceOf(OcrError);
  });

  it('falls back to vision-unknown when no engineVersion provided', async () => {
    const service = new VisionOcrService(
      { isAvailable: () => true, recognize: async () => ({ text: 't', confidence: 0.9 }) },
      now
    );
    const result = await service.extractText(file);
    expect(result.engineVersion).toBe('vision-unknown');
  });
});
