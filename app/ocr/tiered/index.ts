import type { OcrResult, OcrService, OcrTier } from '../../ports/OcrService.js';
import { selectTier } from './selectTier.js';

export class TieredOcrService implements OcrService {
  constructor(private readonly services: Partial<Record<OcrTier, OcrService>>, private readonly userPreference?: OcrTier) {}

  isAvailable(): boolean {
    return Object.values(this.services).some((service) => service?.isAvailable());
  }

  async extractText(file: File): Promise<OcrResult> {
    const available = (Object.keys(this.services) as OcrTier[]).filter((tier) => this.services[tier]?.isAvailable());
    const selected = selectTier(available, this.userPreference);
    const service = this.services[selected];

    if (!service) throw new Error(`Tier ${selected} unavailable`);
    return service.extractText(file);
  }
}
