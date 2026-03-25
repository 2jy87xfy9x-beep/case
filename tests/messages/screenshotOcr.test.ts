import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as exifr from 'exifr';
import { importScreenshotOcr } from '../../app/application/importScreenshotOcr.js';
import type { MessageRepository } from '../../app/messages/importMessages.js';
import type { OcrService, OcrResult } from '../../app/ports/OcrService.js';

function makeRepo(): { saved: import('../../app/domain/types.js').Message[]; repo: MessageRepository } {
  const saved: import('../../app/domain/types.js').Message[] = [];
  const repo: MessageRepository = {
    async saveMessages(messages) {
      for (const m of messages) saved.push(m);
    },
    async getDedupHashes() {
      return new Set();
    }
  };
  return { saved, repo };
}

function makeOcrService(text = 'OCR extracted text'): { calls: File[]; service: OcrService } {
  const calls: File[] = [];
  const service: OcrService = {
    isAvailable() {
      return true;
    },
    async extractText(file: File): Promise<OcrResult> {
      calls.push(file);
      return {
        text,
        tier: 'tesseract',
        confidence: 'medium',
        requiresUserReview: true,
        extractedAt: new Date('2026-01-01T00:00:00Z')
      };
    }
  };
  return { calls, service };
}

describe('importScreenshotOcr', () => {
  it('produces a Message with importSource screenshot-ocr', async () => {
    vi.spyOn(exifr, 'rotation').mockResolvedValueOnce(null as never);
    const { saved, repo } = makeRepo();
    const { service } = makeOcrService('Rent is due on the 1st');
    const file = new File(
      [readFileSync('tests/fixtures/images/without-exif-rotation.jpg')],
      'screenshot.jpg',
      { type: 'image/jpeg' }
    );

    const result = await importScreenshotOcr({
      file,
      threadId: 'thread-1',
      ocrService: service,
      repo
    });

    expect(result.message.importSource).toBe('screenshot-ocr');
    expect(saved).toHaveLength(1);
    expect(saved[0].importSource).toBe('screenshot-ocr');
  });

  it('sets requiresUserReview to true on the resulting message', async () => {
    vi.spyOn(exifr, 'rotation').mockResolvedValueOnce(null as never);
    const { saved, repo } = makeRepo();
    const { service } = makeOcrService();
    const file = new File(
      [readFileSync('tests/fixtures/images/without-exif-rotation.jpg')],
      'screenshot.jpg',
      { type: 'image/jpeg' }
    );

    await importScreenshotOcr({ file, threadId: 'thread-1', ocrService: service, repo });

    expect(saved[0].requiresUserReview).toBe(true);
  });

  it('calls the OCR service', async () => {
    vi.spyOn(exifr, 'rotation').mockResolvedValueOnce(null as never);
    const { repo } = makeRepo();
    const { calls, service } = makeOcrService('Hello landlord');
    const file = new File(
      [readFileSync('tests/fixtures/images/without-exif-rotation.jpg')],
      'screenshot.jpg',
      { type: 'image/jpeg' }
    );

    await importScreenshotOcr({ file, threadId: 'thread-1', ocrService: service, repo });

    expect(calls).toHaveLength(1);
  });

  it('uses OCR text as message body', async () => {
    vi.spyOn(exifr, 'rotation').mockResolvedValueOnce(null as never);
    const { saved, repo } = makeRepo();
    const { service } = makeOcrService('Pay your rent on time');
    const file = new File(
      [readFileSync('tests/fixtures/images/without-exif-rotation.jpg')],
      'screenshot.jpg',
      { type: 'image/jpeg' }
    );

    await importScreenshotOcr({ file, threadId: 'thread-1', ocrService: service, repo });

    expect(saved[0].body).toBe('Pay your rent on time');
  });

  it('defaults direction to received and sender to other', async () => {
    vi.spyOn(exifr, 'rotation').mockResolvedValueOnce(null as never);
    const { saved, repo } = makeRepo();
    const { service } = makeOcrService();
    const file = new File(
      [readFileSync('tests/fixtures/images/without-exif-rotation.jpg')],
      'screenshot.jpg',
      { type: 'image/jpeg' }
    );

    await importScreenshotOcr({ file, threadId: 'thread-1', ocrService: service, repo });

    expect(saved[0].direction).toBe('received');
    expect(saved[0].sender).toBe('other');
  });

  it('uses provided dateTime when supplied', async () => {
    vi.spyOn(exifr, 'rotation').mockResolvedValueOnce(null as never);
    const { saved, repo } = makeRepo();
    const { service } = makeOcrService();
    const file = new File(
      [readFileSync('tests/fixtures/images/without-exif-rotation.jpg')],
      'screenshot.jpg',
      { type: 'image/jpeg' }
    );
    const fixedDate = new Date('2025-06-15T10:00:00Z');

    await importScreenshotOcr({
      file,
      threadId: 'thread-1',
      ocrService: service,
      repo,
      dateTime: fixedDate
    });

    expect(saved[0].dateTime).toEqual(fixedDate);
  });
});
