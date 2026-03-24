import { createHash, randomUUID } from 'node:crypto';
import { createMessage } from '../../domain/factories.js';
import type { Message } from '../../domain/types.js';

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells.map((value) => value.trim());
}

export interface ParseImazingCsvOptions {
  landlordIdentifiers: string[];
  ownIdentifiers: string[];
  logger?: (message: string) => void;
}

export function parseImazingCsv(csvText: string, options: ParseImazingCsvOptions): Message[] {
  const trimmed = csvText.trim();
  if (!trimmed) return [];

  const rows = trimmed.split(/\r?\n/).filter(Boolean);
  if (rows.length <= 1) return [];

  const headers = splitCsvLine(rows[0]).map((header) => header.toLowerCase());
  const dateIndex = headers.findIndex((h) => ['date', 'datetime', 'time'].includes(h));
  const senderIndex = headers.findIndex((h) => ['sender', 'from'].includes(h));
  const bodyIndex = headers.findIndex((h) => ['text', 'body', 'message'].includes(h));
  const threadIndex = headers.findIndex((h) => ['conversation', 'thread', 'chat'].includes(h));

  if (dateIndex < 0 || senderIndex < 0 || bodyIndex < 0) {
    throw new Error('Unsupported iMazing CSV headers in fixture');
  }

  const messages: Message[] = [];

  for (let i = 1; i < rows.length; i += 1) {
    const cells = splitCsvLine(rows[i]);
    const rawDate = cells[dateIndex];
    if (!rawDate) {
      options.logger?.(`Skipping malformed row ${i}: missing date`);
      continue;
    }

    const parsedDate = new Date(rawDate);
    if (Number.isNaN(parsedDate.getTime())) {
      options.logger?.(`Skipping malformed row ${i}: invalid date`);
      continue;
    }

    const senderValue = cells[senderIndex] ?? '';
    const normalizedSender = senderValue.toLowerCase();
    const direction =
      options.ownIdentifiers.some((identifier) => normalizedSender.includes(identifier.toLowerCase()))
        ? 'sent'
        : options.landlordIdentifiers.some((identifier) => normalizedSender.includes(identifier.toLowerCase()))
          ? 'received'
          : 'received';
    const sender = direction === 'sent' ? 'you' : options.landlordIdentifiers.length ? 'landlord' : 'other';

    const body = cells[bodyIndex] ?? '';
    const threadId =
      cells[threadIndex] ||
      createHash('sha1')
        .update(`${senderValue}`)
        .digest('hex');

    messages.push(
      createMessage({
        id: randomUUID(),
        threadId,
        dateTime: parsedDate,
        sender,
        direction,
        body,
        importSource: 'imazing-csv'
      })
    );
  }

  return messages;
}
