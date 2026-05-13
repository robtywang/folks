import type { Entry, Person } from '@/types';
import { db } from './db';

export const READING_CATEGORIES = [
  'new friend',
  'close friend',
  'best friend',
  'old friend',
  'something more',
  'romantic',
  'partner',
  'family',
  'coworker',
  'complicated',
  'drifting',
] as const;

export type ReadingCategory = (typeof READING_CATEGORIES)[number];
export type ReadingEngine = 'mock' | 'claude';

export interface ReadingResult {
  category: string;
  summary: string;
  inferences: string[];
  engine: ReadingEngine;
}

/**
 * Generate a reading for a person: category + short summary + behavioral
 * inferences. Uses Claude Opus when configured; otherwise falls back to a
 * keyword-based mock.
 */
export async function generateReading(
  person: Person,
  entries: Entry[]
): Promise<ReadingResult> {
  const payload = {
    person: {
      name: person.name,
      closenessScore: person.closenessScore,
      closenessTrend: person.closenessTrend,
      avgSentiment: person.avgSentiment,
      entryCount: person.entryCount,
      currentRelationship: person.relationship,
      userContext: person.userContext ?? null,
    },
    entries: entries.map((e) => ({
      text: e.text,
      sentiment: e.sentiment,
      tags: e.tags,
      daysAgo: Math.floor((Date.now() - e.createdAt) / 86_400_000),
    })),
  };

  const res = await fetch('/api/reading', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (res.status === 503) {
    return { ...mockReading(person, entries), engine: 'mock' };
  }

  if (!res.ok) {
    throw new Error(`Reading failed (${res.status})`);
  }

  const data = await res.json();
  return {
    category: data.category,
    summary: data.summary,
    inferences: data.inferences ?? [],
    engine: 'claude',
  };
}

/**
 * Persist the generated reading to the person record.
 */
export async function saveReading(
  personId: string,
  reading: ReadingResult
): Promise<void> {
  await db.people.update(personId, {
    relationship: reading.category,
    readingText: reading.summary,
    readingInferences: reading.inferences,
    readingUpdatedAt: Date.now(),
  });
}

/**
 * Save user-written context. Doesn't auto-trigger a regen — the user clicks
 * "rerun" when they want the new context reflected.
 */
export async function updatePersonContext(
  personId: string,
  context: string
): Promise<void> {
  const trimmed = context.trim();
  await db.people.update(personId, {
    userContext: trimmed.length === 0 ? undefined : trimmed,
  });
}

// ── Mock heuristics ──────────────────────────────────────────────────────

interface InferenceRule {
  label: string;
  patterns: RegExp[];
  threshold?: number; // min occurrences across entries to trigger (default 2)
}

const INFERENCE_RULES: InferenceRule[] = [
  { label: 'coffee buddy', patterns: [/\bcoffee\b/i, /\bcafé?\b/i, /\bespresso\b/i, /\blatte\b/i] },
  { label: 'meal buddy', patterns: [/\b(dinner|lunch|brunch|breakfast)\b/i] },
  { label: 'running partner', patterns: [/\b(running|run|jogging|jog)\b/i] },
  { label: 'gym buddy', patterns: [/\b(gym|workout|lift|crossfit)\b/i] },
  { label: 'walking partner', patterns: [/\b(walked|walking|walk)\b/i] },
  { label: 'venting friend', patterns: [/\b(vent|venting|complain|complaining)\b/i] },
  { label: 'late-night text', patterns: [/\b(late\s+night|midnight|1am|2am|3am)\b/i] },
  { label: 'work confidant', patterns: [/\b(work|project|standup|deadline|boss)\b/i] },
  { label: 'travel companion', patterns: [/\b(trip|travel|flight|vacation|weekend\s+away)\b/i] },
  { label: 'movie / show buddy', patterns: [/\b(movie|film|show|series|watching)\b/i] },
  { label: 'party friend', patterns: [/\b(party|drinks|bar|club|night\s+out)\b/i] },
  { label: 'study partner', patterns: [/\b(studied|studying|study|library|exam)\b/i] },
  { label: 'supportive listener', patterns: [/\b(listened|listening|supported|supportive)\b/i] },
];

function mockInferences(entries: Entry[]): string[] {
  const corpus = entries.map((e) => e.text).join(' \n ');
  const matches: string[] = [];

  for (const rule of INFERENCE_RULES) {
    const threshold = rule.threshold ?? 2;
    let hits = 0;
    for (const pattern of rule.patterns) {
      const m = corpus.match(new RegExp(pattern.source, 'gi'));
      hits += m?.length ?? 0;
    }
    if (hits >= threshold) matches.push(rule.label);
  }

  // Cap at 3 to keep the chip row tidy.
  return matches.slice(0, 3);
}

function mockReading(
  person: Person,
  entries: Entry[]
): { category: string; summary: string; inferences: string[] } {
  if (entries.length === 0) {
    return {
      category: 'new friend',
      summary: 'not enough yet to read — log a few more entries.',
      inferences: [],
    };
  }

  const recent = entries.filter(
    (e) => Date.now() - e.createdAt < 90 * 86_400_000
  );
  const avgSent =
    recent.reduce((s, e) => s + e.sentiment, 0) / Math.max(recent.length, 1);

  const tagCounts = new Map<string, number>();
  for (const e of recent) {
    for (const t of e.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const topTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([t]) => t);

  const isVulnerable = topTags.includes('vulnerable');
  const trendingDown = person.closenessTrend < -0.3;
  const lowSent = avgSent <= 4.5;

  let category: ReadingCategory;
  if (entries.length < 3) {
    category = 'new friend';
  } else if (trendingDown && entries.length >= 4) {
    category = 'drifting';
  } else if (lowSent) {
    category = 'complicated';
  } else if (avgSent >= 8 && isVulnerable) {
    category = 'something more';
  } else if (avgSent >= 8.5 && entries.length >= 8) {
    category = 'best friend';
  } else if (avgSent >= 7 && person.closenessScore >= 6) {
    category = 'close friend';
  } else if (entries.length >= 5 && person.closenessScore < 4) {
    category = 'old friend';
  } else {
    category = 'close friend';
  }

  const name = person.name.toLowerCase();
  let summary: string;
  if (person.userContext && person.userContext.length > 0) {
    summary = `${name} — ${person.userContext.toLowerCase().slice(0, 120)}${
      person.userContext.length > 120 ? '…' : ''
    }`;
  } else if (topTags.length === 2) {
    summary = `${name} tends to feel ${topTags[0]} in your time together — ${topTags[1]} more often than not.`;
  } else if (topTags.length === 1) {
    summary = `${name} reads as ${topTags[0]} across the entries you've logged.`;
  } else {
    summary = `${name} hasn't formed a clear pattern yet — keep logging.`;
  }

  return { category, summary, inferences: mockInferences(entries) };
}
