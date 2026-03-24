import { rotation } from 'exifr';

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function prepareImageForOcr(file: File): Promise<File> {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    return file;
  }

  const exifRotation = await rotation(file).catch(() => null);
  if (!exifRotation || exifRotation.deg % 360 === 0) {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return file;
  }

  const radians = (exifRotation.deg * Math.PI) / 180;
  const normalized = ((exifRotation.deg % 360) + 360) % 360;
  if (normalized === 90 || normalized === 270) {
    canvas.width = bitmap.height;
    canvas.height = bitmap.width;
  }

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(radians);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);

  const rotatedBlob = await canvas.convertToBlob({ type: file.type || 'image/jpeg', quality: 0.95 });
  return new File([rotatedBlob], file.name, {
    type: rotatedBlob.type,
    lastModified: file.lastModified
  });
}
