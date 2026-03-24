import type { Evidence, Message, TimelineItem } from './types.js';

export function buildTimeline(evidence: Evidence[], messages: Message[]): TimelineItem[] {
  return [
    ...evidence.map((item) => ({ ...item, kind: 'evidence' as const })),
    ...messages.map((item) => ({ ...item, kind: 'message' as const }))
  ].sort((a, b) => {
    const diff = a.dateTime.getTime() - b.dateTime.getTime();
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });
}

export function groupMessagesByThread(messages: Message[]): Map<string, Message[]> {
  const grouped = new Map<string, Message[]>();
  for (const message of [...messages].sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime() || a.id.localeCompare(b.id))) {
    const existing = grouped.get(message.threadId) ?? [];
    existing.push(message);
    grouped.set(message.threadId, existing);
  }
  return grouped;
}
