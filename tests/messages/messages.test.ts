import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildTimeline } from '../../app/domain/timeline.js';
import { createMessage } from '../../app/domain/factories.js';
import { importMessages, type MessageRepository } from '../../app/messages/importMessages.js';
import { parseImazingCsv } from '../../app/messages/parsers/imazingCsv.js';
import { parseSmsXml } from '../../app/messages/parsers/smsXml.js';

const fixturePath = 'tests/fixtures/messages/imazing-sample.csv';

describe('message import and parsers', () => {
  it('fixture exists', () => {
    expect(() => readFileSync(fixturePath, 'utf8')).not.toThrow(
      'Missing fixture: export imazing-sample.csv from your device before running parser tests'
    );
  });

  it('parseImazingCsv handles rows, malformed date skip, and import source', () => {
    const csv = readFileSync(fixturePath, 'utf8');
    const logs: string[] = [];
    const messages = parseImazingCsv(csv, {
      landlordIdentifiers: ['+15551230000'],
      ownIdentifiers: ['Me', '+15559870000'],
      logger: (msg) => logs.push(msg)
    });

    expect(messages.length).toBe(3);
    expect(messages[0].importSource).toBe('imazing-csv');
    expect(messages.some((m) => m.direction === 'sent')).toBe(true);
    expect(messages.some((m) => m.direction === 'received')).toBe(true);
    expect(logs.some((line) => line.includes('Skipping malformed row'))).toBe(true);
  });

  it('parseSmsXml maps type and dates, throws malformed xml', () => {
    const xml = `<smses><sms date_sent="1735689600000" address="+15551230000" body="Rent reminder" type="1" /><sms date_sent="1735689700000" address="+15559870000" body="Thanks" type="2" /></smses>`;
    const messages = parseSmsXml(xml);
    expect(messages[0].direction).toBe('received');
    expect(messages[1].direction).toBe('sent');
    expect(messages[0].importSource).toBe('sms-xml');
    expect(messages[0].dateTime.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    expect(() => parseSmsXml('not-xml')).toThrow();
  });

  it('timeline merges evidence and messages', () => {
    const messages = [
      createMessage({
        id: 'm1',
        threadId: 't1',
        dateTime: new Date('2025-01-01T00:00:00Z'),
        sender: 'you',
        direction: 'sent',
        body: 'x',
        importSource: 'manual'
      })
    ];

    const evidence = [
      {
        id: 'e1',
        dateTime: new Date('2025-01-01T00:01:00Z'),
        title: 'Notice',
        body: 'doc',
        requiresUserReview: false,
        provenance: { tier: 'manual' as const, extractedAt: new Date('2025-01-01T00:01:00Z') }
      }
    ];

    const merged = buildTimeline(evidence, messages);
    expect(merged.map((item) => item.id)).toEqual(['m1', 'e1']);
  });

  it('importMessages deduplicates and persists', async () => {
    const saved: string[] = [];
    const hashes = new Set<string>();
    const repo: MessageRepository = {
      async saveMessages(messages) {
        for (const message of messages) saved.push(message.id);
      },
      async getDedupHashes() {
        return hashes;
      }
    };

    const msg = createMessage({
      id: 'id-1',
      threadId: 'thread',
      dateTime: new Date('2025-01-01T00:00:00Z'),
      sender: 'you',
      direction: 'sent',
      body: 'same',
      importSource: 'manual'
    });

    const idsFirst = await importMessages([msg], repo);
    const idsSecond = await importMessages([msg], repo);

    expect(idsFirst).toEqual(['id-1']);
    expect(idsSecond).toEqual([]);
    expect(saved).toEqual(['id-1']);
  });
});
