import { describe, expect, it } from 'vitest';
import { createCase } from '../../app/domain/factories.js';
import { setEvidenceCategory } from '../../app/domain/evidenceOps.js';
import type { Evidence } from '../../app/domain/types.js';

function ev(id: string, category?: Evidence['category']): Evidence {
  return {
    id,
    dateTime: new Date('2026-01-01T00:00:00Z'),
    title: 'T',
    body: 'B',
    requiresUserReview: false,
    category,
    provenance: { tier: 'manual', extractedAt: new Date('2026-01-01T00:00:00Z') }
  };
}

describe('setEvidenceCategory (Phase 8 wiring)', () => {
  it('sets category immutably', () => {
    const c0 = createCase({ id: 'c1', title: 'Case' });
    const c1 = { ...c0, evidence: [ev('e1')] };
    const c2 = setEvidenceCategory(c1, 'e1', 'lease');
    expect(c1.evidence[0].category).toBeUndefined();
    expect(c2.evidence[0].category).toBe('lease');
  });

  it('clears category when undefined passed', () => {
    const c1 = { ...createCase({ id: 'c1', title: 'Case' }), evidence: [ev('e1', 'lease')] };
    const c2 = setEvidenceCategory(c1, 'e1', undefined);
    expect(c2.evidence[0].category).toBeUndefined();
  });

  it('returns same case reference when id not found', () => {
    const c1 = { ...createCase({ id: 'c1', title: 'Case' }), evidence: [ev('e1')] };
    const c2 = setEvidenceCategory(c1, 'missing', 'payment');
    expect(c2).toBe(c1);
  });
});
