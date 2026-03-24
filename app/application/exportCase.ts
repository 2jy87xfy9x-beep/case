import { markCaseExported } from '../domain/exportReminder.js';
import { buildMarkdownExport, type ExportMarkdownVariant } from '../domain/markdownExport.js';
import type { Case } from '../domain/types.js';
import type { CaseRepository } from '../ports/CaseRepository.js';

export interface ExportCaseMarkdownInput {
  repo: CaseRepository;
  caseData: Case;
  variant: ExportMarkdownVariant;
  exportedAt: Date;
  appVersion?: string;
}

/**
 * Produces Markdown (Phase 7) and persists `lastExportedAt` on the case shell via the repository.
 * Evidence and messages remain in their stores; callers typically already persisted them.
 */
export async function exportCaseMarkdown(input: ExportCaseMarkdownInput): Promise<{ markdown: string; case: Case }> {
  const markdown = buildMarkdownExport(input.caseData, {
    variant: input.variant,
    exportedAt: input.exportedAt,
    appVersion: input.appVersion
  });
  const caseAfter = markCaseExported(input.caseData, input.exportedAt);
  await input.repo.saveCase(caseAfter);
  return { markdown, case: caseAfter };
}
