import { describe, expect, it } from 'vitest';
import {
  addClaim,
  addLegalNote,
  addQuestionToClaim,
  createClaim,
  createLegalNote,
  getCombinedQuestions,
  removeClaim,
  removeLegalNote,
  updateClaim,
  updateLegalNote
} from '../../app/domain/claimsOps.js';
import { createCase } from '../../app/domain/factories.js';
import { CLAIMS_SURFACE_IDS } from '../../app/product-surface/ids.js';

// ── Claim factory ──────────────────────────────────────────────────────────

describe('createClaim', () => {
  it('generates a stable UUID id', () => {
    const c1 = createClaim({ title: 'Late fee' });
    const c2 = createClaim({ title: 'Late fee' });
    expect(c1.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(c1.id).not.toBe(c2.id);
  });

  it('defaults to status researching and confidence low', () => {
    const c = createClaim({ title: 'Rent increase notice' });
    expect(c.status).toBe('researching');
    expect(c.confidence).toBe('low');
  });

  it('accepts all ClaimStatus values', () => {
    const statuses = ['researching', 'ready-to-discuss', 'resolved', 'dropped'] as const;
    for (const status of statuses) {
      const c = createClaim({ title: 't', status });
      expect(c.status).toBe(status);
    }
  });

  it('initialises related-id arrays and questions as empty', () => {
    const c = createClaim({ title: 'Entry notice' });
    expect(c.relatedEvidenceIds).toEqual([]);
    expect(c.relatedLegalNoteIds).toEqual([]);
    expect(c.questions).toEqual([]);
  });
});

// ── LegalNote factory ──────────────────────────────────────────────────────

describe('createLegalNote', () => {
  it('generates a stable UUID id', () => {
    const n = createLegalNote({ topic: 'Rent caps' });
    expect(n.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('defaults to appliesToCase maybe', () => {
    const n = createLegalNote({ topic: 'Late fee cap' });
    expect(n.appliesToCase).toBe('maybe');
    expect(n.confidence).toBe('low');
  });

  it('accepts all NoteApplies values', () => {
    for (const val of ['yes', 'maybe', 'no'] as const) {
      expect(createLegalNote({ topic: 't', appliesToCase: val }).appliesToCase).toBe(val);
    }
  });
});

// ── Claim mutations ────────────────────────────────────────────────────────

describe('addClaim', () => {
  it('appends claim without mutating original case', () => {
    const c0 = createCase({ id: 'c1', title: 'Case' });
    const claim = createClaim({ title: 'Late fee' });
    const c1 = addClaim(c0, claim);
    expect(c0.claims).toHaveLength(0);
    expect(c1.claims).toHaveLength(1);
    expect(c1.claims[0].id).toBe(claim.id);
  });
});

describe('updateClaim', () => {
  it('updates specified fields immutably', () => {
    const c0 = createCase({ id: 'c1', title: 'Case' });
    const claim = createClaim({ title: 'Entry notice' });
    const c1 = addClaim(c0, claim);
    const c2 = updateClaim(c1, claim.id, { status: 'ready-to-discuss', confidence: 'high' });
    expect(c1.claims[0].status).toBe('researching'); // original unchanged
    expect(c2.claims[0].status).toBe('ready-to-discuss');
    expect(c2.claims[0].confidence).toBe('high');
    expect(c2.claims[0].title).toBe('Entry notice'); // unchanged field preserved
  });

  it('returns a new case even when update matches current value', () => {
    const c0 = createCase({ id: 'c1', title: 'Case' });
    const claim = createClaim({ title: 't', status: 'researching' });
    const c1 = addClaim(c0, claim);
    const c2 = updateClaim(c1, claim.id, { status: 'researching' });
    expect(c2).not.toBe(c1);
    expect(c2.claims[0].status).toBe('researching');
  });
});

describe('removeClaim', () => {
  it('removes claim by id', () => {
    const c0 = createCase({ id: 'c1', title: 'Case' });
    const a = createClaim({ title: 'A' });
    const b = createClaim({ title: 'B' });
    const c1 = addClaim(addClaim(c0, a), b);
    const c2 = removeClaim(c1, a.id);
    expect(c2.claims.map((c) => c.id)).toEqual([b.id]);
  });

  it('is a no-op when id not found', () => {
    const c0 = createCase({ id: 'c1', title: 'Case' });
    const claim = createClaim({ title: 't' });
    const c1 = addClaim(c0, claim);
    const c2 = removeClaim(c1, 'non-existent');
    expect(c2.claims).toHaveLength(1);
  });
});

describe('addQuestionToClaim', () => {
  it('appends question to the correct claim', () => {
    const c0 = createCase({ id: 'c1', title: 'Case' });
    const claim = createClaim({ title: 'Late fee' });
    const c1 = addClaim(c0, claim);
    const c2 = addQuestionToClaim(c1, claim.id, 'Is $50 above the legal cap?');
    expect(c2.claims[0].questions).toEqual(['Is $50 above the legal cap?']);
  });
});

// ── LegalNote mutations ────────────────────────────────────────────────────

describe('addLegalNote', () => {
  it('appends note without mutating original case', () => {
    const c0 = createCase({ id: 'c1', title: 'Case' });
    const note = createLegalNote({ topic: 'Late fee caps' });
    const c1 = addLegalNote(c0, note);
    expect(c0.legalNotes).toHaveLength(0);
    expect(c1.legalNotes[0].id).toBe(note.id);
  });
});

describe('updateLegalNote', () => {
  it('updates fields immutably', () => {
    const c0 = createCase({ id: 'c1', title: 'Case' });
    const note = createLegalNote({ topic: 'Habitability' });
    const c1 = addLegalNote(c0, note);
    const c2 = updateLegalNote(c1, note.id, { appliesToCase: 'yes', summary: 'Landlord must maintain heat.' });
    expect(c1.legalNotes[0].appliesToCase).toBe('maybe'); // original unchanged
    expect(c2.legalNotes[0].appliesToCase).toBe('yes');
    expect(c2.legalNotes[0].summary).toBe('Landlord must maintain heat.');
  });
});

describe('removeLegalNote', () => {
  it('removes note by id', () => {
    const c0 = createCase({ id: 'c1', title: 'Case' });
    const n = createLegalNote({ topic: 'Rent caps' });
    const c1 = addLegalNote(c0, n);
    const c2 = removeLegalNote(c1, n.id);
    expect(c2.legalNotes).toHaveLength(0);
  });
});

// ── Combined questions ─────────────────────────────────────────────────────

describe('getCombinedQuestions', () => {
  it('returns empty array when no claims or notes', () => {
    const c = createCase({ id: 'c1', title: 'Case' });
    expect(getCombinedQuestions(c)).toEqual([]);
  });

  it('merges questions from claims and legal notes in that order', () => {
    let c = createCase({ id: 'c1', title: 'Case' });
    const claim = createClaim({ title: 'Late fee' });
    const note = createLegalNote({ topic: 'Late fee cap' });
    c = addClaim(c, claim);
    c = addLegalNote(c, note);
    c = updateClaim(c, claim.id, { questions: ['Is this legal?', 'What is the cap?'] });
    c = updateLegalNote(c, note.id, { questions: ['Where does the cap apply?'] });
    expect(getCombinedQuestions(c)).toEqual([
      'Is this legal?',
      'What is the cap?',
      'Where does the cap apply?'
    ]);
  });
});

// ── Conservative framing: surface IDs exist ────────────────────────────────

describe('CLAIMS_SURFACE_IDS (Phase 6 surface registry)', () => {
  it('includes required screen and action ids', () => {
    expect(CLAIMS_SURFACE_IDS).toContain('screen.claims');
    expect(CLAIMS_SURFACE_IDS).toContain('screen.lawNotes');
    expect(CLAIMS_SURFACE_IDS).toContain('action.addClaim');
    expect(CLAIMS_SURFACE_IDS).toContain('section.topicsToDiscuss');
    expect(CLAIMS_SURFACE_IDS).toContain('copy.claimsDisclaimer');
  });
});
