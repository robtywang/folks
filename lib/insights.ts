import type { Entry, Person } from '@/types';
import { db } from './db';

const WEEKDAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const DAY_MS = 86_400_000;

/** Quantitative pattern detected locally, ready to be phrased by Claude. */
export interface DetectedPattern {
  kind:
    | 'weekday_warmer'
    | 'weekend_warmer'
    | 'time_of_day_warmer'
    | 'tag_dominant'
    | 'sentiment_trending'
    | 'gap_unusual'
    | 'recurring_context';
  /** Short factual description of the pattern, in plain English. */
  fact: string;
  /** How many entries support it. The model knows to acknowledge weak signals. */
  support: number;
  /** Optional measured delta (sentiment points). */
  delta?: number;
}

export interface InsightsResult {
  insights: string[];
}

const MIN_COHORT = 3;
const MIN_SENTIMENT_DELTA = 1.2;

/**
 * Compute the actual numerical patterns locally before asking the model to
 * phrase them. The model never "finds" patterns — only renders the true ones
 * we hand it. This eliminates the model's main failure mode (inventing
 * patterns that sound right but aren't in the data).
 */
function detectPatterns(entries: Entry[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  if (entries.length < MIN_COHORT) return patterns;

  // ── Day-of-week sentiment ──────────────────────────────────────────────
  const byDay: { sentiments: number[]; count: number }[] = Array.from(
    { length: 7 },
    () => ({ sentiments: [], count: 0 })
  );
  for (const e of entries) {
    const day = new Date(e.createdAt).getDay();
    byDay[day].sentiments.push(e.sentiment);
    byDay[day].count += 1;
  }
  const weekdayEntries = byDay
    .slice(1, 6)
    .flatMap((d) => d.sentiments); // mon-fri
  const weekendEntries = [byDay[0], byDay[6]].flatMap((d) => d.sentiments); // sat+sun
  if (weekdayEntries.length >= MIN_COHORT && weekendEntries.length >= MIN_COHORT) {
    const weekdayAvg =
      weekdayEntries.reduce((a, b) => a + b, 0) / weekdayEntries.length;
    const weekendAvg =
      weekendEntries.reduce((a, b) => a + b, 0) / weekendEntries.length;
    const delta = weekendAvg - weekdayAvg;
    if (Math.abs(delta) >= MIN_SENTIMENT_DELTA) {
      const warmer = delta > 0 ? 'weekend' : 'weekday';
      const warmerAvg = delta > 0 ? weekendAvg : weekdayAvg;
      const coolerAvg = delta > 0 ? weekdayAvg : weekendAvg;
      patterns.push({
        kind: delta > 0 ? 'weekend_warmer' : 'weekday_warmer',
        fact: `${warmer} sentiment averages ${warmerAvg.toFixed(1)} vs ${coolerAvg.toFixed(
          1
        )} on the other days`,
        support: warmer === 'weekend' ? weekendEntries.length : weekdayEntries.length,
        delta: Math.abs(delta),
      });
    }
  }

  // ── Time of day sentiment (morning vs evening) ─────────────────────────
  const morning: number[] = [];
  const evening: number[] = [];
  for (const e of entries) {
    const h = new Date(e.createdAt).getHours();
    if (h < 12) morning.push(e.sentiment);
    else if (h >= 18) evening.push(e.sentiment);
  }
  if (morning.length >= MIN_COHORT && evening.length >= MIN_COHORT) {
    const mAvg = morning.reduce((a, b) => a + b, 0) / morning.length;
    const eAvg = evening.reduce((a, b) => a + b, 0) / evening.length;
    const delta = mAvg - eAvg;
    if (Math.abs(delta) >= MIN_SENTIMENT_DELTA) {
      const better = delta > 0 ? 'morning' : 'evening';
      patterns.push({
        kind: 'time_of_day_warmer',
        fact: `${better} entries average ${(delta > 0 ? mAvg : eAvg).toFixed(
          1
        )} vs ${(delta > 0 ? eAvg : mAvg).toFixed(1)} the other time of day`,
        support: better === 'morning' ? morning.length : evening.length,
        delta: Math.abs(delta),
      });
    }
  }

  // ── Tag dominance ──────────────────────────────────────────────────────
  const tagCounts: Record<string, number> = {};
  for (const e of entries) {
    for (const t of e.tags) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
  }
  const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  if (sortedTags.length > 0) {
    const [topTag, topCount] = sortedTags[0];
    // Only surface if at least 40% of entries carry the tag AND cohort is real
    if (topCount >= MIN_COHORT && topCount / entries.length >= 0.4) {
      patterns.push({
        kind: 'tag_dominant',
        fact: `the tag "${topTag}" appears on ${topCount} of ${entries.length} entries`,
        support: topCount,
      });
    }
  }

  // ── Sentiment trajectory (recent 4 entries vs prior 4) ─────────────────
  if (entries.length >= 8) {
    const sortedByTime = [...entries].sort((a, b) => a.createdAt - b.createdAt);
    const tail = sortedByTime.slice(-4);
    const prior = sortedByTime.slice(-8, -4);
    const tailAvg = tail.reduce((a, b) => a + b.sentiment, 0) / tail.length;
    const priorAvg = prior.reduce((a, b) => a + b.sentiment, 0) / prior.length;
    const delta = tailAvg - priorAvg;
    if (Math.abs(delta) >= MIN_SENTIMENT_DELTA) {
      patterns.push({
        kind: 'sentiment_trending',
        fact: `sentiment over the last 4 entries averages ${tailAvg.toFixed(
          1
        )} vs ${priorAvg.toFixed(1)} in the prior 4`,
        support: 4,
        delta: Math.abs(delta),
      });
    }
  }

  // ── Gap unusual: longest gap in last 90 days ──────────────────────────
  if (entries.length >= 4) {
    const sortedByTime = [...entries].sort((a, b) => a.createdAt - b.createdAt);
    const recent = sortedByTime.filter(
      (e) => Date.now() - e.createdAt <= 90 * DAY_MS
    );
    if (recent.length >= 4) {
      const gaps: number[] = [];
      for (let i = 1; i < recent.length; i++) {
        gaps.push((recent[i].createdAt - recent[i - 1].createdAt) / DAY_MS);
      }
      const lastGap = (Date.now() - recent[recent.length - 1].createdAt) / DAY_MS;
      gaps.push(lastGap);
      const maxGap = Math.max(...gaps);
      const median = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
      if (maxGap >= 7 && median > 0 && maxGap >= median * 3 && lastGap === maxGap) {
        patterns.push({
          kind: 'gap_unusual',
          fact: `${Math.round(lastGap)} days since last entry — longest gap in this stretch`,
          support: gaps.length,
        });
      }
    }
  }

  return patterns;
}

/**
 * Ask Claude to phrase pre-detected statistical patterns. Returns null when
 * there's not enough data, no signal, or the API isn't configured.
 */
export async function generateInsights(
  person: Person,
  entries: Entry[]
): Promise<InsightsResult | null> {
  if (entries.length < 3) return null;

  const patterns = detectPatterns(entries);
  if (patterns.length === 0) {
    // No statistically meaningful patterns yet. Better to say nothing than
    // invent something. The profile shows "no patterns yet" state.
    return { insights: [] };
  }

  const payload = {
    person: {
      name: person.name,
      entryCount: person.entryCount,
      avgSentiment: person.avgSentiment,
      userContext: person.userContext ?? null,
    },
    // Patterns ready to phrase — Claude renders, doesn't find.
    patterns: patterns.map((p) => ({
      fact: p.fact,
      support: p.support,
      delta: p.delta,
    })),
    // A small entry sample for tonal context only — not used for finding
    // patterns. Capped to the most recent 8 to keep prompt cost low.
    entrySample: entries
      .slice(0, 8)
      .map((e) => {
        const d = new Date(e.createdAt);
        return {
          text: e.text,
          sentiment: e.sentiment,
          tags: e.tags,
          daysAgo: Math.max(0, Math.floor((Date.now() - e.createdAt) / DAY_MS)),
          weekday: WEEKDAY[d.getDay()],
        };
      }),
  };

  const res = await fetch('/api/insights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    if (res.status === 503 || res.status === 400) return null;
    throw new Error(`insights api ${res.status}`);
  }

  const data: { insights?: unknown } = await res.json();
  if (!data.insights || !Array.isArray(data.insights)) return null;

  const insights = data.insights
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .slice(0, 3);

  return { insights };
}

export async function saveInsights(
  personId: string,
  result: InsightsResult
): Promise<void> {
  await db.people.update(personId, {
    insightCards: result.insights,
    insightsUpdatedAt: Date.now(),
  });
}
