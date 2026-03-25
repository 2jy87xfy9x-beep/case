/**
 * claimSuggester.ts — Pure function that suggests discussion topics based on
 * evidence patterns. Conservative framing required (ADR-003): suggestions are
 * "topics to discuss with your lawyer", not legal conclusions.
 *
 * All claim text must sound like a notebook/organiser, not a legal assessment.
 */
import type { Case, Claim, Evidence } from './types.js';

/**
 * Deterministic ID for a claim based on its topic key.
 * Uses a simple namespace prefix so IDs are stable across calls with the same input.
 */
function topicId(topicKey: string): string {
  // Stable ID derived from the topic key — no randomness, ensuring purity.
  return `claim-${topicKey}`;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function daysBetween(earlier: Date, later: Date): number {
  return (later.getTime() - earlier.getTime()) / MS_PER_DAY;
}

function byCategory(evidence: Evidence[], category: Evidence['category']): Evidence[] {
  return evidence.filter((e) => e.category === category);
}

function hasEvictionKeyword(e: Evidence): boolean {
  const text = `${e.title} ${e.body}`.toLowerCase();
  return (
    text.includes('eviction') ||
    text.includes('unlawful detainer') ||
    text.includes('notice to quit')
  );
}

function makeClaim(opts: {
  topicKey: string;
  title: string;
  description: string;
  confidence: Claim['confidence'];
  relatedEvidenceIds: string[];
  questions: string[];
}): Claim {
  return {
    id: topicId(opts.topicKey),
    title: opts.title,
    description: opts.description,
    status: 'researching',
    confidence: opts.confidence,
    relatedEvidenceIds: opts.relatedEvidenceIds,
    relatedLegalNoteIds: [],
    questions: opts.questions
  };
}

/**
 * Suggests discussion topics based on evidence patterns.
 * Returns [] for an empty case. No duplicate topic keys.
 */
export function suggestClaims(caseData: Case): Claim[] {
  const { evidence, messages } = caseData;

  if (evidence.length === 0) return [];

  const claims: Claim[] = [];
  const seenTopics = new Set<string>();

  function add(topicKey: string, claim: Claim): void {
    if (!seenTopics.has(topicKey)) {
      seenTopics.add(topicKey);
      claims.push(claim);
    }
  }

  const repairs = byCategory(evidence, 'repair');
  const rentNotices = byCategory(evidence, 'rent-notice');
  const feeNotices = byCategory(evidence, 'fee-notice');

  // ── topic.rent-increase-notice ──────────────────────────────────────────
  if (rentNotices.length > 0) {
    add(
      'topic.rent-increase-notice',
      makeClaim({
        topicKey: 'topic.rent-increase-notice',
        title: 'Rent increase notice found — review the details',
        description:
          'A rent increase notice is in your records. Reviewing it with a lawyer can help you understand your options and any applicable notice periods.',
        confidence: 'medium',
        relatedEvidenceIds: rentNotices.map((e) => e.id),
        questions: [
          'Was proper notice given for this rent increase?',
          'Are there any local rules that apply to this increase?'
        ]
      })
    );
  }

  // ── topic.eviction-defense ──────────────────────────────────────────────
  const evictionNotices = feeNotices.filter(hasEvictionKeyword);
  if (evictionNotices.length > 0) {
    add(
      'topic.eviction-defense',
      makeClaim({
        topicKey: 'topic.eviction-defense',
        title: 'Eviction or notice received — gather your records',
        description:
          'A notice that may relate to eviction proceedings is in your records. Keeping thorough documentation of all related events is important to bring to any consultation.',
        confidence: 'medium',
        relatedEvidenceIds: evictionNotices.map((e) => e.id),
        questions: [
          'What are my options when I receive this type of notice?',
          'What documents should I gather before speaking with a lawyer?'
        ]
      })
    );
  }

  // ── topic.habitability ──────────────────────────────────────────────────
  if (repairs.length > 0) {
    const hasLandlordResponse = messages.some((m) => m.sender === 'landlord');
    if (!hasLandlordResponse) {
      add(
        'topic.habitability',
        makeClaim({
          topicKey: 'topic.habitability',
          title: 'Unresolved repair request — bring documentation',
          description:
            'A repair request is on file with no recorded landlord response. Documenting the request and any follow-up is helpful to discuss with a lawyer.',
          confidence: repairs.length > 1 ? 'medium' : 'low',
          relatedEvidenceIds: repairs.map((e) => e.id),
          questions: [
            'What steps should I take to document an unresolved repair request?',
            'What time frames are typical for landlord repair obligations?'
          ]
        })
      );
    }
  }

  // ── topic.failure-to-repair ─────────────────────────────────────────────
  if (repairs.length > 0) {
    const validDates = evidence
      .map((e) => e.dateTime)
      .filter((d) => Number.isFinite(d.getTime()));

    if (validDates.length > 0) {
      const mostRecentDate = new Date(Math.max(...validDates.map((d) => d.getTime())));

      const oldRepairs = repairs.filter(
        (r) =>
          Number.isFinite(r.dateTime.getTime()) &&
          daysBetween(r.dateTime, mostRecentDate) > 30
      );

      if (oldRepairs.length > 0) {
        add(
          'topic.failure-to-repair',
          makeClaim({
            topicKey: 'topic.failure-to-repair',
            title: 'Repair request open for extended period — worth noting',
            description:
              'A repair request in your records appears to have been open for more than 30 days. This timeline may be worth discussing with a lawyer.',
            confidence: 'medium',
            relatedEvidenceIds: oldRepairs.map((e) => e.id),
            questions: [
              'How long is a landlord typically required to address a repair request?',
              'What documentation helps show the timeline of a repair request?'
            ]
          })
        );
      }
    }
  }

  // ── topic.retaliatory-increase ──────────────────────────────────────────
  if (repairs.length > 0 && rentNotices.length > 0) {
    const repairDates = repairs
      .map((e) => e.dateTime)
      .filter((d) => Number.isFinite(d.getTime()));
    const rentNoticeDates = rentNotices
      .map((e) => e.dateTime)
      .filter((d) => Number.isFinite(d.getTime()));

    if (repairDates.length > 0 && rentNoticeDates.length > 0) {
      const earliestRepair = new Date(Math.min(...repairDates.map((d) => d.getTime())));
      const triggeredNotices = rentNoticeDates.filter(
        (d) => d > earliestRepair && daysBetween(earliestRepair, d) <= 180
      );

      if (triggeredNotices.length > 0) {
        const triggeredRentNotices = rentNotices.filter(
          (e) =>
            Number.isFinite(e.dateTime.getTime()) &&
            e.dateTime > earliestRepair &&
            daysBetween(earliestRepair, e.dateTime) <= 180
        );
        add(
          'topic.retaliatory-increase',
          makeClaim({
            topicKey: 'topic.retaliatory-increase',
            title: 'Rent increase after repair request — worth discussing',
            description:
              'A rent increase notice appears within 180 days of a repair request. The timing of these events may be worth discussing with a lawyer.',
            confidence: 'medium',
            relatedEvidenceIds: [
              ...repairs.map((e) => e.id),
              ...triggeredRentNotices.map((e) => e.id)
            ],
            questions: [
              'Is the timing between a repair request and a rent increase significant?',
              'What records would help show the sequence of events?'
            ]
          })
        );
      }
    }
  }

  // ── topic.retaliation ──────────────────────────────────────────────────
  if (feeNotices.length > 0 && rentNotices.length > 0) {
    const feeNoticeDates = feeNotices
      .map((e) => e.dateTime)
      .filter((d) => Number.isFinite(d.getTime()));
    const rentNoticeDates = rentNotices
      .map((e) => e.dateTime)
      .filter((d) => Number.isFinite(d.getTime()));

    if (feeNoticeDates.length > 0 && rentNoticeDates.length > 0) {
      let triggered = false;
      const relatedIds: string[] = [];

      for (const feeDate of feeNoticeDates) {
        for (const rentDate of rentNoticeDates) {
          const diff = Math.abs(feeDate.getTime() - rentDate.getTime()) / MS_PER_DAY;
          if (diff <= 90) {
            triggered = true;
          }
        }
      }

      if (triggered) {
        relatedIds.push(...feeNotices.map((e) => e.id), ...rentNotices.map((e) => e.id));
        add(
          'topic.retaliation',
          makeClaim({
            topicKey: 'topic.retaliation',
            title: 'Notice and rent change close in time — document the sequence',
            description:
              'A legal notice and a rent increase notice are close together in your records. Documenting the full sequence of events is useful to bring to a consultation.',
            confidence: 'medium',
            relatedEvidenceIds: [...new Set(relatedIds)],
            questions: [
              'What does the timing between a notice and a rent change mean for my situation?',
              'How should I document the sequence of events for a lawyer consultation?'
            ]
          })
        );
      }
    }
  }

  return claims;
}
