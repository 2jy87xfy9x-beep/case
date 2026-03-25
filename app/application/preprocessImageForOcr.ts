import { rotation } from 'exifr';

const SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);
const UPSCALE = 2.5;
const SHARPEN_KERNEL = [0, -1, 0, -1, 5, -1, 0, -1, 0]; // 3×3 unsharp mask

export async function preprocessImageForOcr(file: File): Promise<File> {
  if (!SUPPORTED.has(file.type)) return file;

  const exifRotation = await rotation(file).catch(() => null);
  const rotateDeg = exifRotation?.deg ?? 0;
  const normalized = ((rotateDeg % 360) + 360) % 360;

  const bitmap = await createImageBitmap(file);
  const srcW = bitmap.width;
  const srcH = bitmap.height;

  // Step 1: Upscale canvas (swap dims if rotating 90/270)
  const destW = Math.round((normalized === 90 || normalized === 270 ? srcH : srcW) * UPSCALE);
  const destH = Math.round((normalized === 90 || normalized === 270 ? srcW : srcH) * UPSCALE);

  const canvas = new OffscreenCanvas(destW, destH);
  const ctx = canvas.getContext('2d')!;

  // Step 2: Draw with rotation + upscale
  ctx.translate(destW / 2, destH / 2);
  ctx.rotate((rotateDeg * Math.PI) / 180);
  ctx.scale(UPSCALE, UPSCALE);
  ctx.drawImage(bitmap, -srcW / 2, -srcH / 2);
  bitmap.close();

  // Step 3: Get pixel data and apply grayscale + contrast + sharpen + binarize
  const imageData = ctx.getImageData(0, 0, destW, destH);
  const gray = buildGrayscaleArray(imageData.data);
  const contrasted = applyContrast(gray, 1.5, 10);
  const sharpened = applySharpen(contrasted, destW, destH);
  const threshold = otsuThreshold(buildHistogram(sharpened), sharpened.length);
  const binarized = applyBinarize(sharpened, threshold);

  // Write back as RGBA (grayscale → R=G=B, A=255)
  for (let i = 0; i < binarized.length; i++) {
    const v = binarized[i];
    imageData.data[i * 4] = v;
    imageData.data[i * 4 + 1] = v;
    imageData.data[i * 4 + 2] = v;
    imageData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new File([blob], file.name, { type: 'image/png', lastModified: file.lastModified });
}

// ── Pure helpers (exported for testing) ───────────────────────────────────────

export function buildGrayscaleArray(rgba: Uint8ClampedArray): Float32Array {
  const n = rgba.length / 4;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = 0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2];
  }
  return out;
}

function applyContrast(gray: Float32Array, factor: number, lift: number): Float32Array {
  const out = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    out[i] = Math.max(0, Math.min(255, (gray[i] - 128) * factor + 128 + lift));
  }
  return out;
}

function applySharpen(gray: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(gray); // copy so border pixels retain original values (not zeroed)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          sum += gray[(y + ky) * width + (x + kx)] * SHARPEN_KERNEL[(ky + 1) * 3 + (kx + 1)];
        }
      }
      out[y * width + x] = Math.max(0, Math.min(255, sum));
    }
  }
  return out;
}

function buildHistogram(gray: Float32Array): number[] {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) {
    hist[Math.round(gray[i])]++;
  }
  return hist;
}

export function otsuThreshold(histogram: number[], total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];

  let sumB = 0, wB = 0, max = 0, threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > max) { max = between; threshold = t; }
  }
  return threshold;
}

function applyBinarize(gray: Float32Array, threshold: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) {
    out[i] = gray[i] > threshold ? 255 : 0;
  }
  return out;
}
