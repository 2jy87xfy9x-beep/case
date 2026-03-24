/**
 * Vision OCR adapter — wraps a platform-native on-device OCR capability
 * (e.g. Apple Vision framework via Capacitor, or the Web API where available).
 *
 * Per ADR-002 the PWA build never bundles Capacitor, so `isAvailable()` returns
 * false in the browser.  When a native host injects a VisionEngine at runtime
 * (future Capacitor build) this service becomes the preferred Tier 1.
 */
import { OcrError, type OcrResult, type OcrService } from '../../ports/OcrService.js';

/**
 * Minimal interface the Vision host must satisfy.
 * Keeping it narrow so tests can supply lightweight stubs.
 */
export interface VisionEngine {
  /** Returns `true` when the native OCR capability is accessible. */
  isAvailable(): boolean;
  /** Perform recognition on a file and return raw text + confidence (0–1). */
  recognize(file: File): Promise<{ text: string; confidence: number; engineVersion?: string }>;
}

export class VisionOcrService implements OcrService {
  constructor(
    private readonly engine: VisionEngine,
    private readonly now: () => Date = () => new Date()
  ) {}

  isAvailable(): boolean {
    return this.engine.isAvailable();
  }

  async extractText(file: File): Promise<OcrResult> {
    if (!this.engine.isAvailable()) {
      throw new OcrError('error.ocrFailed', 'Vision OCR is not available on this platform');
    }

    let result: { text: string; confidence: number; engineVersion?: string };
    try {
      result = await this.engine.recognize(file);
    } catch (cause) {
      throw new OcrError(
        'error.ocrFailed',
        `Vision OCR engine error: ${cause instanceof Error ? cause.message : String(cause)}`
      );
    }

    const confidence =
      result.confidence >= 0.9
        ? 'high'
        : result.confidence >= 0.7
          ? 'medium'
          : result.confidence >= 0
            ? 'low'
            : 'unknown';

    return {
      text: result.text,
      tier: 'vision',
      // Vision is on-device and high-quality; still flag for review so users
      // can catch rare mis-reads before exporting.
      requiresUserReview: true,
      confidence,
      extractedAt: this.now(),
      engineVersion: result.engineVersion ?? 'vision-unknown'
    };
  }
}
