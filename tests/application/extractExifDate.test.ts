import { describe, it, expect, vi } from 'vitest';
import { extractExifDate } from '../../app/application/extractExifDate.js';

// We mock exifr because we can't create real EXIF-embedded files in unit tests
vi.mock('exifr', () => ({
  parse: vi.fn()
}));

import { parse } from 'exifr';
const mockParse = vi.mocked(parse);

describe('extractExifDate', () => {
  it('returns null for non-image files', async () => {
    const file = new File(['data'], 'doc.pdf', { type: 'application/pdf' });
    expect(await extractExifDate(file)).toBeNull();
  });

  it('returns DateTimeOriginal when present', async () => {
    mockParse.mockResolvedValueOnce({ DateTimeOriginal: new Date('2023-11-07T14:22:00') });
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    const result = await extractExifDate(file);
    expect(result).toEqual(new Date('2023-11-07T14:22:00'));
  });

  it('falls back to CreateDate when DateTimeOriginal is absent', async () => {
    mockParse.mockResolvedValueOnce({ CreateDate: new Date('2023-05-01T09:00:00') });
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    const result = await extractExifDate(file);
    expect(result).toEqual(new Date('2023-05-01T09:00:00'));
  });

  it('returns null when exifr throws', async () => {
    mockParse.mockRejectedValueOnce(new Error('no EXIF'));
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    expect(await extractExifDate(file)).toBeNull();
  });

  it('returns null when date is invalid', async () => {
    mockParse.mockResolvedValueOnce({ DateTimeOriginal: new Date('invalid') });
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    expect(await extractExifDate(file)).toBeNull();
  });
});
