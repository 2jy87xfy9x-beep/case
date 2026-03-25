export interface KeyFact {
  raw: string;
  amount: number;
  evidenceId: string;
  evidenceTitle: string;
}

const DOLLAR_RE = /\$[\d,]+(?:\.\d{2})?/g;

export function extractKeyFacts(
  evidence: Array<{ id: string; title: string; body: string }>
): KeyFact[] {
  const facts: KeyFact[] = [];
  const seenKeys = new Set<string>();

  for (const ev of evidence) {
    const matches = ev.body.match(DOLLAR_RE) ?? [];
    for (const raw of matches.slice(0, 2)) {
      const digits = raw.replace(/[$,.]/g, '');
      const amount = parseFloat(raw.replace(/[$,]/g, ''));

      if (!isValidAmount(amount, digits)) continue;

      const key = `${digits}:${ev.id}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      facts.push({ raw, amount, evidenceId: ev.id, evidenceTitle: ev.title });
      if (facts.length >= 8) return facts;
    }
  }

  return facts;
}

function isValidAmount(amount: number, digits: string): boolean {
  if (amount < 5) return false;
  if (amount > 100_000) return false;
  if (digits.length > 7) return false;           // account/routing numbers
  if (/^0+$/.test(digits)) return false;         // all zeros
  if (/^0{3}/.test(digits)) return false;        // starts with 3+ zeros
  return true;
}
