import { describe, expect, it } from 'vitest';
import { suggestClaims } from '../../app/domain/claimSuggester.js';
import { createCase } from '../../app/domain/factories.js';
import type { Evidence } from '../../app/domain/types.js';

function makeEvidence(overrides: Partial<Evidence> & Pick<Evidence, 'id'>): Evidence {
  return {
    dateTime: new Date('2026-01-15T00:00:00Z'),
    title: 'Document',
    body: '',
    requiresUserReview: false,
    provenance: { tier: 'manual', extractedAt: new Date('2026-01-15T00:00:00Z') },
    ...overrides
  };
}

describe('suggestClaims', () => {
  it('returns empty array for empty case', () => {
    const c = createCase({ id: 'c1', title: 'Empty' });
    expect(suggestClaims(c)).toEqual([]);
  });

  it('returns empty array when no evidence', () => {
    const c = createCase({ id: 'c2', title: 'No evidence' });
    c.evidence = [];
    expect(suggestClaims(c)).toEqual([]);
  });

  // topic.rent-increase-notice
  it('suggests rent-increase-notice topic when rent-notice evidence exists', () => {
    const c = createCase({ id: 'c3', title: 'Rent notice' });
    c.evidence = [makeEvidence({ id: 'e1', category: 'rent-notice', title: 'Rent Increase Notice' })];
    const claims = suggestClaims(c);
    const topics = claims.map((cl) => cl.title);
    expect(topics.some((t) => t.toLowerCase().includes('rent increase notice'))).toBe(true);
  });

  // topic.eviction-defense
  it('suggests eviction-defense topic when fee-notice with eviction keywords exists', () => {
    const c = createCase({ id: 'c4', title: 'Eviction' });
    c.evidence = [
      makeEvidence({ id: 'e1', category: 'fee-notice', title: 'Unlawful Detainer Notice' })
    ];
    const claims = suggestClaims(c);
    expect(claims.some((cl) => cl.title.toLowerCase().includes('eviction'))).toBe(true);
  });

  // topic.habitability — repair exists, no landlord response message
  it('suggests habitability topic when repair evidence exists with no landlord response', () => {
    const c = createCase({ id: 'c5', title: 'Repair' });
    c.evidence = [makeEvidence({ id: 'e1', category: 'repair', title: 'Broken heater repair request' })];
    c.messages = [];
    const claims = suggestClaims(c);
    expect(claims.some((cl) => cl.title.toLowerCase().includes('repair'))).toBe(true);
  });

  // topic.failure-to-repair — repair date > 30 days before most recent evidence
  it('suggests failure-to-repair topic when repair is more than 30 days old relative to newest evidence', () => {
    const c = createCase({ id: 'c6', title: 'Old repair' });
    c.evidence = [
      makeEvidence({ id: 'e1', category: 'repair', title: 'Repair request', dateTime: new Date('2025-11-01T00:00:00Z') }),
      makeEvidence({ id: 'e2', category: 'other', title: 'Something recent', dateTime: new Date('2026-01-15T00:00:00Z') })
    ];
    const claims = suggestClaims(c);
    expect(claims.some((cl) => cl.title.toLowerCase().includes('repair'))).toBe(true);
  });

  // topic.retaliatory-increase — repair + rent-notice within 180 days after repair
  it('suggests retaliatory-increase topic when rent-notice is within 180 days after repair', () => {
    const c = createCase({ id: 'c7', title: 'Retaliation' });
    c.evidence = [
      makeEvidence({ id: 'e1', category: 'repair', title: 'Repair request', dateTime: new Date('2025-10-01T00:00:00Z') }),
      makeEvidence({ id: 'e2', category: 'rent-notice', title: 'Rent Increase', dateTime: new Date('2025-12-01T00:00:00Z') })
    ];
    const claims = suggestClaims(c);
    expect(claims.some((cl) => cl.title.toLowerCase().includes('rent increase after'))).toBe(true);
  });

  it('does NOT suggest retaliatory-increase when rent-notice is more than 180 days after repair', () => {
    const c = createCase({ id: 'c8', title: 'No retaliation' });
    c.evidence = [
      makeEvidence({ id: 'e1', category: 'repair', title: 'Repair request', dateTime: new Date('2024-01-01T00:00:00Z') }),
      makeEvidence({ id: 'e2', category: 'rent-notice', title: 'Rent Increase', dateTime: new Date('2025-01-01T00:00:00Z') })
    ];
    const claims = suggestClaims(c);
    expect(claims.some((cl) => cl.title.toLowerCase().includes('rent increase after'))).toBe(false);
  });

  // topic.retaliation — fee-notice AND rent-notice within 90 days of fee-notice
  it('suggests retaliation topic when legal notice and rent-notice are within 90 days', () => {
    const c = createCase({ id: 'c9', title: 'Retaliation sequence' });
    c.evidence = [
      makeEvidence({ id: 'e1', category: 'fee-notice', title: 'Notice to Pay', dateTime: new Date('2026-01-01T00:00:00Z') }),
      makeEvidence({ id: 'e2', category: 'rent-notice', title: 'Rent Increase', dateTime: new Date('2026-02-01T00:00:00Z') })
    ];
    const claims = suggestClaims(c);
    expect(claims.some((cl) => cl.title.toLowerCase().includes('notice and rent'))).toBe(true);
  });

  it('does NOT suggest retaliation topic when rent-notice is more than 90 days from fee-notice', () => {
    const c = createCase({ id: 'c10', title: 'Far apart' });
    c.evidence = [
      makeEvidence({ id: 'e1', category: 'fee-notice', title: 'Notice to Pay', dateTime: new Date('2025-01-01T00:00:00Z') }),
      makeEvidence({ id: 'e2', category: 'rent-notice', title: 'Rent Increase', dateTime: new Date('2025-06-01T00:00:00Z') })
    ];
    const claims = suggestClaims(c);
    expect(claims.some((cl) => cl.title.toLowerCase().includes('notice and rent'))).toBe(false);
  });

  it('no duplicate topic keys for same case', () => {
    const c = createCase({ id: 'c11', title: 'Many notices' });
    c.evidence = [
      makeEvidence({ id: 'e1', category: 'rent-notice', title: 'Rent Increase Notice', dateTime: new Date('2026-01-15T00:00:00Z') }),
      makeEvidence({ id: 'e2', category: 'rent-notice', title: 'Another Rent Notice', dateTime: new Date('2026-02-01T00:00:00Z') })
    ];
    const claims = suggestClaims(c);
    const titles = claims.map((cl) => cl.title);
    const uniqueTitles = [...new Set(titles)];
    expect(titles.length).toBe(uniqueTitles.length);
  });

  it('all claim titles and descriptions pass conservative framing — no legal conclusion language', () => {
    const c = createCase({ id: 'c12', title: 'Conservative framing test' });
    c.evidence = [
      makeEvidence({ id: 'e1', category: 'repair', title: 'Repair request', dateTime: new Date('2025-10-01T00:00:00Z') }),
      makeEvidence({ id: 'e2', category: 'rent-notice', title: 'Rent Increase Notice', dateTime: new Date('2025-12-01T00:00:00Z') }),
      makeEvidence({ id: 'e3', category: 'fee-notice', title: 'Unlawful Detainer Notice', dateTime: new Date('2026-01-01T00:00:00Z') })
    ];
    const prohibited = ['violation', 'breach', 'illegal', 'liable', 'entitled'];
    // "claim" is part of "suggestClaims" function name, but must not appear in the text content
    const prohibitedInContent = [...prohibited, 'claim'];
    const claims = suggestClaims(c);
    expect(claims.length).toBeGreaterThan(0);
    for (const cl of claims) {
      for (const word of prohibitedInContent) {
        const titleLower = cl.title.toLowerCase();
        const descLower = cl.description.toLowerCase();
        expect(titleLower).not.toContain(word);
        expect(descLower).not.toContain(word);
      }
    }
  });

  it('is a pure function — same input yields same output', () => {
    const c = createCase({ id: 'c13', title: 'Pure' });
    c.evidence = [
      makeEvidence({ id: 'e1', category: 'rent-notice', title: 'Rent Increase' })
    ];
    const a = JSON.stringify(suggestClaims(c));
    const b = JSON.stringify(suggestClaims(c));
    expect(a).toBe(b);
  });

  it('each claim has required fields: id, title, description, status, confidence, relatedEvidenceIds, questions', () => {
    const c = createCase({ id: 'c14', title: 'Fields check' });
    c.evidence = [makeEvidence({ id: 'e1', category: 'rent-notice', title: 'Rent Increase Notice' })];
    const claims = suggestClaims(c);
    expect(claims.length).toBeGreaterThan(0);
    for (const cl of claims) {
      expect(cl.id).toBeTruthy();
      expect(cl.title).toBeTruthy();
      expect(cl.description).toBeTruthy();
      expect(cl.status).toBe('researching');
      expect(['low', 'medium', 'high']).toContain(cl.confidence);
      expect(Array.isArray(cl.relatedEvidenceIds)).toBe(true);
      expect(Array.isArray(cl.questions)).toBe(true);
      expect(cl.questions.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('does not suggest habitability when a landlord message response exists', () => {
    const c = createCase({ id: 'c15', title: 'With response' });
    c.evidence = [makeEvidence({ id: 'e1', category: 'repair', title: 'Repair request' })];
    c.messages = [
      {
        id: 'm1',
        threadId: 't1',
        dateTime: new Date('2026-01-20T00:00:00Z'),
        sender: 'landlord',
        direction: 'received',
        body: 'I will fix it next week',
        importSource: 'sms-xml',
        tags: [],
        notes: ''
      }
    ];
    const claims = suggestClaims(c);
    // habitability topic should not appear when landlord has responded
    const hasHabitability = claims.some(
      (cl) => cl.title.toLowerCase().includes('unresolved repair')
    );
    expect(hasHabitability).toBe(false);
  });
});
