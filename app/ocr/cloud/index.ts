/**
 * Cloud OCR adapter — opt-in only (per selectTier: requires explicit user preference).
 *
 * Per ADR-002 and decision.cloud-ocr-provider this adapter is intentionally
 * minimal: it delegates to a caller-supplied CloudEngine so that the concrete
 * provider (Google Cloud Vision, AWS Textract, etc.) can be swapped without
 * touching domain code, and so tests can use lightweight stubs.
 *
 * Privacy note: files are sent to a third-party service. The user must
 * explicitly opt in. The UI must surface a privacy disclosure before first use.
 */
import { OcrError, type OcrResult, type OcrService } from '../../ports/OcrService.js';

/**
 * Minimal interface a cloud OCR provider must satisfy.
 */
export interface CloudEngine {
  /** Provider name / version string for provenance tracking. */
  readonly engineVersion: string;
  /** Upload the file and return extracted text with a 0–1 confidence score. */
  recognize(file: File): Promise<{ text: string; confidence: number }>;
}

export class CloudOcrService implements OcrService {
  constructor(
    private readonly engine: CloudEngine,
    private readonly now: () => Date = () => new Date()
  ) {}

  isAvailable(): boolean {
    // Cloud is structurally available when an engine is provided.
    // selectTier only picks this tier when the caller passes userPreference='cloud'.
    return true;
  }

  async extractText(file: File): Promise<OcrResult> {
    let result: { text: string; confidence: number };
    try {
      result = await this.engine.recognize(file);
    } catch (cause) {
      throw new OcrError(
        'error.ocrFailed',
        `Cloud OCR engine error: ${cause instanceof Error ? cause.message : String(cause)}`
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
      tier: 'cloud',
      // Cloud results still need human review — OCR is not authoritative.
      requiresUserReview: true,
      confidence,
      extractedAt: this.now(),
      engineVersion: this.engine.engineVersion
    };
  }
}
