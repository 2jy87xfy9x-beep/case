import { parse } from 'exifr';

const SUPPORTED = new Set(['image/jpeg', 'image/jpg', 'image/heic', 'image/heif', 'image/png']);

export async function extractExifDate(file: File): Promise<Date | null> {
  if (!SUPPORTED.has(file.type.toLowerCase())) return null;
  try {
    const tags = await parse(file, { DateTimeOriginal: true, CreateDate: true });
    const dt: unknown = tags?.DateTimeOriginal ?? tags?.CreateDate;
    if (dt instanceof Date && isFinite(dt.getTime())) return dt;
    return null;
  } catch {
    return null;
  }
}
