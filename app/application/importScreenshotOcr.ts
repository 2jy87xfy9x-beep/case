import { randomUUID } from 'node:crypto';
import { prepareImageForOcr } from './prepareImageForOcr.js';
import type { Message } from '../domain/types.js';
import type { OcrService } from '../ports/OcrService.js';
import type { MessageRepository } from '../messages/importMessages.js';

export interface ImportScreenshotOcrInput {
  file: File;
  threadId: string;
  ocrService: OcrService;
  repo: MessageRepository;
  /** Override date — defaults to file.lastModified, then current date. */
  dateTime?: Date;
}

export interface ImportScreenshotOcrResult {
  message: Message;
  savedIds: string[];
}

/**
 * Pass an image through the OCR pipeline and persist it as a Message with
 * importSource: 'screenshot-ocr'.
 *
 * - Accepts JPG / PNG / HEIC (prepareImageForOcr handles EXIF rotation).
 * - Sets requiresUserReview: true (OCR text always needs a human check).
 * - Defaults direction to 'received' and sender to 'other'.
 * - dateTime comes from the file's lastModified timestamp, or now() as fallback.
 */
export async function importScreenshotOcr(
  input: ImportScreenshotOcrInput
): Promise<ImportScreenshotOcrResult> {
  const prepared = await prepareImageForOcr(input.file);
  const ocr = await input.ocrService.extractText(prepared);

  const dateTime =
    input.dateTime ??
    (input.file.lastModified ? new Date(input.file.lastModified) : new Date());

  const message: Message = {
    id: randomUUID(),
    threadId: input.threadId,
    dateTime,
    sender: 'other',
    direction: 'received',
    body: ocr.text,
    importSource: 'screenshot-ocr',
    requiresUserReview: true,
    tags: [],
    notes: ''
  };

  await input.repo.saveMessages([message]);

  return {
    message,
    savedIds: [message.id]
  };
}
