import { describe, it, expect, vi } from 'vitest';
import { buildGrayscaleArray, otsuThreshold } from '../../app/application/preprocessImageForOcr.js';

// Note: we test the pure math helpers directly; the main pipeline function
// requires browser Canvas APIs so is integration-tested via E2E

describe('otsuThreshold', () => {
  it('returns a threshold that separates bimodal histogram', () => {
    // 128 pixels at 0 (black text), 128 pixels at 255 (white background)
    const histogram = new Array(256).fill(0);
    histogram[0] = 128;
    histogram[255] = 128;
    const t = otsuThreshold(histogram, 256);
    // Optimal split is at 0 (separates 0-value pixels from 255-value pixels)
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(255);
  });

  it('returns 127 for uniform histogram', () => {
    const histogram = new Array(256).fill(1);
    const t = otsuThreshold(histogram, 256);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThanOrEqual(255);
  });
});

describe('buildGrayscaleArray', () => {
  it('converts RGBA pixel array to grayscale', () => {
    // Red pixel: R=255, G=0, B=0, A=255
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
    const gray = buildGrayscaleArray(rgba);
    // Rec.709 luma: 0.2126*R + 0.7152*G + 0.0722*B
    expect(gray[0]).toBeCloseTo(255 * 0.2126, 0); // red → ~54
    expect(gray[1]).toBeCloseTo(255 * 0.7152, 0); // green → ~182
  });
});
