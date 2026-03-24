import { describe, expect, it } from 'vitest';
import { createCase, createLawyer } from '../../app/domain/factories.js';
import {
  addLawyer,
  addQuestionToLawyer,
  getAllLawyerQuestions,
  markLawyerContacted,
  removeLawyer,
  updateLawyer
} from '../../app/domain/lawyerOps.js';

function makeCase() {
  return createCase({ id: 'c1', title: 'Test case' });
}

describe('Lawyer factory', () => {
  it('creates lawyer with defaults', () => {
    const lawyer = createLawyer({ name: 'Jane Doe' });
    expect(lawyer.name).toBe('Jane Doe');
    expect(lawyer.firm).toBe('');
    expect(lawyer.phoneOrEmail).toBe('');
    expect(lawyer.contacted).toBe(false);
    expect(lawyer.consultationType).toBe('unknown');
    expect(lawyer.questions).toEqual([]);
    expect(lawyer.id).toBeTruthy();
  });

  it('respects provided fields', () => {
    const lawyer = createLawyer({
      id: 'l-1',
      name: 'Bob Smith',
      firm: 'Smith & Co',
      phoneOrEmail: 'bob@example.com',
      consultationType: 'free',
      notes: 'Initial consultation Monday',
      status: 'contacted'
    });
    expect(lawyer.id).toBe('l-1');
    expect(lawyer.firm).toBe('Smith & Co');
    expect(lawyer.consultationType).toBe('free');
    expect(lawyer.notes).toBe('Initial consultation Monday');
  });
});

describe('lawyerOps CRUD', () => {
  it('addLawyer appends to case.lawyers', () => {
    const c = makeCase();
    const lawyer = createLawyer({ id: 'l-1', name: 'Alice' });
    const updated = addLawyer(c, lawyer);
    expect(updated.lawyers).toHaveLength(1);
    expect(updated.lawyers[0].id).toBe('l-1');
    // Original is not mutated.
    expect(c.lawyers).toHaveLength(0);
  });

  it('updateLawyer patches only the specified fields', () => {
    let c = makeCase();
    c = addLawyer(c, createLawyer({ id: 'l-1', name: 'Alice' }));
    c = updateLawyer(c, 'l-1', { notes: 'Call back by Friday', status: 'scheduled' });
    expect(c.lawyers[0].notes).toBe('Call back by Friday');
    expect(c.lawyers[0].status).toBe('scheduled');
    expect(c.lawyers[0].name).toBe('Alice');
  });

  it('removeLawyer removes the correct entry', () => {
    let c = makeCase();
    c = addLawyer(c, createLawyer({ id: 'l-1', name: 'Alice' }));
    c = addLawyer(c, createLawyer({ id: 'l-2', name: 'Bob' }));
    c = removeLawyer(c, 'l-1');
    expect(c.lawyers).toHaveLength(1);
    expect(c.lawyers[0].id).toBe('l-2');
  });

  it('markLawyerContacted sets contacted=true', () => {
    let c = makeCase();
    c = addLawyer(c, createLawyer({ id: 'l-1', name: 'Alice' }));
    expect(c.lawyers[0].contacted).toBe(false);
    c = markLawyerContacted(c, 'l-1');
    expect(c.lawyers[0].contacted).toBe(true);
  });

  it('addQuestionToLawyer appends question', () => {
    let c = makeCase();
    c = addLawyer(c, createLawyer({ id: 'l-1', name: 'Alice' }));
    c = addQuestionToLawyer(c, 'l-1', 'What is the local late-fee cap?');
    c = addQuestionToLawyer(c, 'l-1', 'Can I withhold rent?');
    expect(c.lawyers[0].questions).toEqual([
      'What is the local late-fee cap?',
      'Can I withhold rent?'
    ]);
  });

  it('addQuestionToLawyer is a no-op for unknown lawyerId', () => {
    let c = makeCase();
    c = addLawyer(c, createLawyer({ id: 'l-1', name: 'Alice' }));
    const unchanged = addQuestionToLawyer(c, 'l-99', 'question');
    expect(unchanged.lawyers[0].questions).toHaveLength(0);
  });

  it('getAllLawyerQuestions aggregates across all lawyers', () => {
    let c = makeCase();
    c = addLawyer(c, createLawyer({ id: 'l-1', name: 'Alice' }));
    c = addLawyer(c, createLawyer({ id: 'l-2', name: 'Bob' }));
    c = addQuestionToLawyer(c, 'l-1', 'Q1');
    c = addQuestionToLawyer(c, 'l-2', 'Q2');
    c = addQuestionToLawyer(c, 'l-2', 'Q3');
    expect(getAllLawyerQuestions(c)).toEqual(['Q1', 'Q2', 'Q3']);
  });

  it('getAllLawyerQuestions returns [] for empty case', () => {
    expect(getAllLawyerQuestions(makeCase())).toEqual([]);
  });
});
