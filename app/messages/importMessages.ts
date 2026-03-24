import { createHash } from 'node:crypto';
import type { Message } from '../domain/types.js';

export interface MessageRepository {
  saveMessages(messages: Message[]): Promise<void>;
  getDedupHashes(): Promise<Set<string>>;
}

export function messageDedupHash(message: Message): string {
  return createHash('sha1')
    .update(`${message.dateTime.toISOString()}|${message.sender}|${message.body}`)
    .digest('hex');
}

export async function importMessages(messages: Message[], repo: MessageRepository): Promise<string[]> {
  const seen = await repo.getDedupHashes();
  const unique = messages.filter((message) => {
    const hash = messageDedupHash(message);
    if (seen.has(hash)) return false;
    seen.add(hash);
    return true;
  });

  await repo.saveMessages(unique);
  return unique.map((message) => message.id);
}
