import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as exifr from 'exifr';
import { prepareImageForOcr } from '../../app/application/prepareImageForOcr.js';
import { uploadToEvidence } from '../../app/application/uploadPipeline.js';

describe('prepareImageForOcr', () => {
  it('returns file unchanged when image has no EXIF rotation', async () => {
    const original = new File([readFileSync('tests/fixtures/images/without-exif-rotation.jpg')], 'without.jpg', {
      type: 'image/jpeg'
    });

    vi.spyOn(exifr, 'rotation').mockResolvedValueOnce(null as never);
    const prepared = await prepareImageForOcr(original);

    expect(prepared).toBe(original);
  });

  it('returns rotated file when EXIF rotation is present', async () => {
    const original = new File([readFileSync('tests/fixtures/images/with-exif-rotation.jpg')], 'with.jpg', {
      type: 'image/jpeg'
    });

    vi.spyOn(exifr, 'rotation').mockResolvedValueOnce({ deg: 90 } as never);

    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 10, height: 20 })));

    const ctx = {
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn()
    };

    class MockOffscreenCanvas {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
      getContext() {
        return ctx;
      }
      async convertToBlob() {
        return new Blob(['rotated'], { type: 'image/jpeg' });
      }
    }

    vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);

    const prepared = await prepareImageForOcr(original);

    expect(prepared).not.toBe(original);
    expect(await prepared.text()).toContain('rotated');
  });

  it('upload pipeline calls preprocess before OCR extraction', async () => {
    const callOrder: string[] = [];
    vi.spyOn(exifr, 'rotation').mockImplementation(async () => {
      callOrder.push('prepare');
      return null as never;
    });

    await uploadToEvidence({
      file: new File(['raw'], 'a.jpg', { type: 'image/jpeg' }),
      title: 'doc',
      dateTime: new Date('2026-01-01T00:00:00Z'),
      ocrService: {
        async extractText() {
          callOrder.push('ocr');
          return {
            text: 'ok',
            tier: 'manual',
            confidence: 'high',
            requiresUserReview: false,
            extractedAt: new Date('2026-01-01T00:00:00Z')
          };
        }
      }
    });

    expect(callOrder).toEqual(['prepare', 'ocr']);
  });
});
