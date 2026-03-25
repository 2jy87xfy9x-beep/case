import { describe, it, expect } from 'vitest';
import { extractKeyFacts } from '../../app/application/filterKeyFacts.js';

const ev = (id: string, title: string, body: string) => ({ id, title, body });

describe('extractKeyFacts', () => {
  it('filters amounts below $5', () => {
    const facts = extractKeyFacts([ev('1', 'Notice', '$3.00 was charged')]);
    expect(facts).toHaveLength(0);
  });

  it('keeps valid rent amounts', () => {
    const facts = extractKeyFacts([ev('1', 'Lease', 'monthly rent of $850.00')]);
    expect(facts).toHaveLength(1);
    expect(facts[0].amount).toBe(850);
    expect(facts[0].evidenceId).toBe('1');
  });

  it('filters all-zero amounts like account numbers', () => {
    const facts = extractKeyFacts([ev('1', 'Check', '$000.00 account')]);
    expect(facts).toHaveLength(0);
  });

  it('filters amounts with too many digits (account numbers)', () => {
    const facts = extractKeyFacts([ev('1', 'Bank', '$12345678 balance')]);
    expect(facts).toHaveLength(0);
  });

  it('deduplicates same amount from same evidence', () => {
    const facts = extractKeyFacts([ev('1', 'Lease', '$850.00 rent due $850.00 per month')]);
    expect(facts).toHaveLength(1);
  });

  it('caps at 8 total facts across evidence', () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      ev(String(i), `Item ${i}`, `$${(i + 1) * 100}.00 due`)
    );
    expect(extractKeyFacts(items)).toHaveLength(8);
  });

  it('includes evidenceId for navigation', () => {
    const facts = extractKeyFacts([ev('abc-123', 'Notice', '$75.00 late fee')]);
    expect(facts[0].evidenceId).toBe('abc-123');
  });

  it('filters amounts starting with three or more zeros', () => {
    const facts = extractKeyFacts([ev('1', 'Check', '$0001.00 ref number')]);
    expect(facts).toHaveLength(0);
  });
});
