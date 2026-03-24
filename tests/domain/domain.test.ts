import { describe, expect, it } from 'vitest';
import { createCase, createMessage } from '../../app/domain/factories.js';
import { markCaseExported, needsExportReminder } from '../../app/domain/exportReminder.js';
import { buildTimeline, groupMessagesByThread } from '../../app/domain/timeline.js';

describe('domain factories and timeline', () => {
  it('createMessage produces valid message with stable id when provided', () => {
    const message = createMessage({
      id: 'msg-1',
      threadId: 'thread-a',
      dateTime: new Date('2026-01-01T00:00:00Z'),
      sender: 'you',
      direction: 'sent',
      body: 'hello',
      importSource: 'manual'
    });

    expect(message.id).toBe('msg-1');
    expect(message.threadId).toBe('thread-a');
  });

  it('builds mixed timeline in chronological order with id tie-break', () => {
    const evidence = [
      {
        id: 'b',
        dateTime: new Date('2026-01-01T00:00:00Z'),
        title: 'Lease',
        body: 'Lease body',
        requiresUserReview: false,
        provenance: { tier: 'manual' as const, extractedAt: new Date('2026-01-01T00:00:00Z') }
      }
    ];

    const messages = [
      createMessage({
        id: 'a',
        threadId: 't1',
        dateTime: new Date('2026-01-01T00:00:00Z'),
        sender: 'landlord',
        direction: 'received',
        body: 'rent due',
        importSource: 'sms-xml'
      })
    ];

    const timeline = buildTimeline(evidence, messages);
    expect(timeline[0].id).toBe('a');
    expect(timeline[1].id).toBe('b');
  });

  it('groups messages by thread in date order', () => {
    const m1 = createMessage({
      id: '2',
      threadId: 'thread-1',
      dateTime: new Date('2026-01-01T01:00:00Z'),
      sender: 'you',
      direction: 'sent',
      body: 'a',
      importSource: 'manual'
    });
    const m2 = createMessage({
      id: '1',
      threadId: 'thread-1',
      dateTime: new Date('2026-01-01T00:00:00Z'),
      sender: 'landlord',
      direction: 'received',
      body: 'b',
      importSource: 'manual'
    });

    const grouped = groupMessagesByThread([m1, m2]);
    expect(grouped.get('thread-1')?.map((m) => m.id)).toEqual(['1', '2']);
  });

  it('new case has null lastExportedAt and reminder logic works', () => {
    const c = createCase({ id: 'c1', title: 'Case' });
    expect(c.lastExportedAt).toBeNull();
    expect(needsExportReminder(c, new Date('2026-03-10T00:00:00Z'))).toBe(true);

    const exported = markCaseExported(c, new Date('2026-03-08T00:00:00Z'));
    expect(needsExportReminder(exported, new Date('2026-03-10T00:00:00Z'))).toBe(false);
    expect(needsExportReminder(exported, new Date('2026-03-18T00:00:01Z'))).toBe(true);
  });
});
