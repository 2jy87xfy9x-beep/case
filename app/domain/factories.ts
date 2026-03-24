import { randomUUID } from 'node:crypto';
import type { Case, Message, MessageDirection, MessageImportSource, MessageSender } from './types.js';

export function createMessage(input: {
  threadId: string;
  dateTime: Date;
  sender: MessageSender;
  direction: MessageDirection;
  body: string;
  importSource: MessageImportSource;
  tags?: string[];
  notes?: string;
  id?: string;
}): Message {
  return {
    id: input.id ?? randomUUID(),
    threadId: input.threadId,
    dateTime: input.dateTime,
    sender: input.sender,
    direction: input.direction,
    body: input.body,
    importSource: input.importSource,
    tags: input.tags ?? [],
    notes: input.notes ?? ''
  };
}

export function createCase(input: { id?: string; title: string }): Case {
  return {
    id: input.id ?? randomUUID(),
    title: input.title,
    lastExportedAt: null
  };
}
