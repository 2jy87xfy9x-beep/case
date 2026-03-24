import { describe, expect, it } from 'vitest';
import { CloudOcrService } from '../../../app/ocr/cloud/index.js';
import { OcrError } from '../../../app/ports/OcrService.js';

const file = new File(['x'], 'scan.png', { type: 'image/png' });
const now = () => new Date('2026-03-24T00:00:00Z');

describe('CloudOcrService', () => {
  it('returns tier=cloud with correct fields', async () => {
    const service = new CloudOcrService(
      {
        engineVersion: 'google-vision-v1',
        recognize: async () => ({ text: 'Rent notice text', confidence: 0.92 })
      },
      now
    );

    const result = await service.extractText(file);
    expect(result.tier).toBe('cloud');
    expect(result.text).toBe('Rent notice text');
    expect(result.confidence).toBe('high');
    expect(result.requiresUserReview).toBe(true);
    expect(result.engineVersion).toBe('google-vision-v1');
    expect(result.extractedAt).toEqual(new Date('2026-03-24T00:00:00Z'));
  });

  it('maps confidence 0.8 → medium', async () => {
    const service = new CloudOcrService(
      { engineVersion: 'test', recognize: async () => ({ text: 't', confidence: 0.8 }) },
      now
    );
    expect((await service.extractText(file)).confidence).toBe('medium');
  });

  it('maps confidence 0.5 → low', async () => {
    const service = new CloudOcrService(
      { engineVersion: 'test', recognize: async () => ({ text: 't', confidence: 0.5 }) },
      now
    );
    expect((await service.extractText(file)).confidence).toBe('low');
  });

  it('isAvailable() always returns true (provider is structurally ready)', () => {
    const service = new CloudOcrService(
      { engineVersion: 'test', recognize: async () => ({ text: '', confidence: 1 }) },
      now
    );
    expect(service.isAvailable()).toBe(true);
  });

  it('wraps engine rejection in OcrError', async () => {
    const service = new CloudOcrService(
      {
        engineVersion: 'test',
        recognize: async () => { throw new Error('network error'); }
      },
      now
    );
    await expect(service.extractText(file)).rejects.toBeInstanceOf(OcrError);
  });
});
