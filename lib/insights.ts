import type { Entry, Person } from '@/types';
import { db } from './db';

const WEEKDAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export interface InsightsResult {
  insights: string[];
}

/**
 * Ask Claude for 2-3 short observational insights about a person's behavioural
 * patterns. Each insight surfaces a pattern (day-of-week, sentiment trajectory,
 * recurring contexts) — not a single moment. Returns null if the API isn't
 * configured or there aren't enough entries.
 */
export async function generateInsights(
  person: Person,
  entries: Entry[]
): Promise<InsightsResult | null> {
  if (entries.length < 3) return null;

  const payload = {
    person: {
      name: person.name,
      entryCount: person.entryCount,
      avgSentiment: person.avgSentiment,
      userContext: person.userContext ?? null,
    },
    entries: entries.map((e) => {
      const d = new Date(e.createdAt);
      return {
        text: e.text,
        sentiment: e.sentiment,
        tags: e.tags,
        daysAgo: Math.max(0, Math.floor((Date.now() - e.createdAt) / 86_400_000)),
        weekday: WEEKDAY[d.getDay()],
        hour: d.getHours(),
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
  if (insights.length === 0) return null;

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
