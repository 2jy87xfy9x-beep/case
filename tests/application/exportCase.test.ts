import { describe, expect, it } from 'vitest';
import { createCase } from '../../app/domain/factories.js';
import { exportCaseMarkdown } from '../../app/application/exportCase.js';
import type { Case, Evidence, Message } from '../../app/domain/types.js';
import type { CaseRepository } from '../../app/ports/CaseRepository.js';

class InMemoryCaseRepository implements CaseRepository {
  private readonly cases = new Map<string, Case>();

  async saveCase(caseData: Case): Promise<void> {
    this.cases.set(caseData.id, structuredClone(caseData));
  }

  async loadCase(caseId: string): Promise<Case | null> {
    return structuredClone(this.cases.get(caseId) ?? null);
  }

  async saveEvidence(_caseId: string, _evidence: Evidence[]): Promise<void> {}

  async listEvidence(_caseId: string): Promise<Evidence[]> {
    return [];
  }

  async saveMessages(_caseId: string, _messages: Message[]): Promise<void> {}

  async listMessages(_caseId: string): Promise<Message[]> {
    return [];
  }
}

describe('exportCaseMarkdown', () => {
  it('updates lastExportedAt on the case after export', async () => {
    const repo = new InMemoryCaseRepository();
    const exportedAt = new Date('2026-03-24T15:00:00Z');
    const caseData = createCase({ id: 'c-export', title: 'Export me' });
    expect(caseData.lastExportedAt).toBeNull();

    const { markdown, case: after } = await exportCaseMarkdown({
      repo,
      caseData,
      variant: 'fullCase',
      exportedAt,
      appVersion: 'test'
    });

    expect(markdown.length).toBeGreaterThan(50);
    expect(after.lastExportedAt).toEqual(exportedAt);

    const saved = await repo.loadCase('c-export');
    expect(saved?.lastExportedAt).toEqual(exportedAt);
  });
});
