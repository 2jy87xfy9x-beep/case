import type { Case } from './types.js';

const REMINDER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function needsExportReminder(currentCase: Case, now: Date): boolean {
  if (!currentCase.lastExportedAt) return true;
  return now.getTime() - currentCase.lastExportedAt.getTime() > REMINDER_WINDOW_MS;
}

export function markCaseExported(currentCase: Case, exportedAt: Date): Case {
  return {
    ...currentCase,
    lastExportedAt: exportedAt
  };
}
