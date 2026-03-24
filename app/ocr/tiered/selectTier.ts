import type { OcrTier } from '../../ports/OcrService.js';

const ORDER: OcrTier[] = ['vision', 'tesseract', 'manual'];

export function selectTier(available: OcrTier[], userPreference?: OcrTier): OcrTier {
  const unique = new Set(available);
  if (userPreference === 'cloud' && unique.has('cloud')) {
    return 'cloud';
  }

  for (const candidate of ORDER) {
    if (unique.has(candidate)) {
      return candidate;
    }
  }

  if (unique.has('cloud') && userPreference === 'cloud') {
    return 'cloud';
  }

  throw new Error('No OCR tier available');
}
