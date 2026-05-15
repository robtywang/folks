import { db, uuid } from './db';
import type { Entry, Person, WeeklyRecap } from '@/types';

const DAY_MS = 86_400_000;

/** Unix ms for the most recent Sunday at 00:00 local. */
export function startOfWeekLocal(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

/**
 * True if a fresh recap is eligible: it's at or past Sunday 00:00 local,
 * no recap exists yet for this week, and there are ≥3 entries in the past
 * 7 days. Used by the home screen mount check and the dev trigger.
 */
export async function isRecapEligible(): Promise<{
  eligible: boolean;
  reason: string;
  weekStart: number;
  entryCount: number;
}> {
  const weekStart = startOfWeekLocal();
  const entries = await db.entries
    .where('createdAt')
    .aboveOrEqual(Date.now() - 7 * DAY_MS)
    .toArray();
  if (entries.length < 3) {
    return {
      eligible: false,
      reason: `only ${entries.length} entries in last 7 days`,
      weekStart,
      entryCount: entries.length,
    };
  }
  const existing = await db.weeklyRecaps
    .where('weekStart')
    .equals(weekStart)
    .first();
  if (existing) {
    return {
      eligible: false,
      reason: 'already generated for this week',
      weekStart,
      entryCount: entries.length,
    };
  }
  return { eligible: true, reason: 'ok', weekStart, entryCount: entries.length };
}

/**
 * Compose stats + entry sample for the prompt, then call the API. Returns the
 * generated content string. Does NOT persist — caller handles save.
 */
export async function generateWeeklyRecap(opts?: {
  /** Force generation even if a recap already exists for this week. */
  force?: boolean;
}): Promise<{ content: string; weekStart: number } | null> {
  const weekStart = startOfWeekLocal();
  const sevenDaysAgo = Date.now() - 7 * DAY_MS;
  const entries = await db.entries
    .where('createdAt')
    .aboveOrEqual(sevenDaysAgo)
    .toArray();
  if (entries.length < 3) return null;

  if (!opts?.force) {
    const existing = await db.weeklyRecaps
      .where('weekStart')
      .equals(weekStart)
      .first();
    if (existing) return null;
  }

  const people = await db.people.toArray();
  const peopleById = new Map(people.map((p) => [p.id, p]));

  // Aggregate per-person stats for the week.
  const perPerson = new Map<
    string,
    { name: string; entries: Entry[]; lastSeen: number }
  >();
  for (const e of entries) {
    if (!e.personId) continue;
    const p = peopleById.get(e.personId);
    if (!p || p.muted) continue;
    const slot = perPerson.get(e.personId);
    if (slot) {
      slot.entries.push(e);
      slot.lastSeen = Math.max(slot.lastSeen, e.createdAt);
    } else {
      perPerson.set(e.personId, {
        name: p.name,
        entries: [e],
        lastSeen: e.createdAt,
      });
    }
  }

  // Top 3 people by entry count.
  const ranked = Array.from(perPerson.values()).sort(
    (a, b) => b.entries.length - a.entries.length
  );
  const topPeople = ranked.slice(0, 3).map((row) => {
    const avgSent =
      row.entries.reduce((s, e) => s + e.sentiment, 0) / row.entries.length;
    const lastSeenDaysAgo = Math.floor((Date.now() - row.lastSeen) / DAY_MS);
    // Gap: did this person have entries before this week? When was the last?
    let gapNotable: string | undefined;
    const personId = entries.find((e) => peopleById.get(e.personId!)?.name === row.name)?.personId;
    if (personId) {
      const olderEntries = peopleById.get(personId)?.lastInteraction;
      // We don't have a great signal here without an extra DB query — keep
      // it simple. Gap detection is heuristic; Opus can read the avgSentiment
      // + count for tone.
      gapNotable = undefined;
    }
    return {
      name: row.name,
      entryCount: row.entries.length,
      avgSentiment: avgSent,
      lastSeenDaysAgo,
      gapNotable,
    };
  });

  const totalEntries = entries.length;
  const peopleMentioned = perPerson.size;
  const avgSentiment =
    entries.reduce((s, e) => s + e.sentiment, 0) / entries.length;

  const entrySample = entries
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 8)
    .map((e) => ({
      personName: e.personId ? peopleById.get(e.personId)?.name ?? null : null,
      text: e.text,
      sentiment: e.sentiment,
      tags: e.tags,
      daysAgo: Math.floor((Date.now() - e.createdAt) / DAY_MS),
    }));

  const res = await fetch('/api/weekly-recap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      weekStart,
      stats: { totalEntries, peopleMentioned, avgSentiment, topPeople },
      entrySample,
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (!data.content || typeof data.content !== 'string') return null;
  return { content: data.content, weekStart };
}

/** Persist a generated recap. Returns the saved row. */
export async function saveWeeklyRecap(
  weekStart: number,
  content: string
): Promise<WeeklyRecap> {
  const recap: WeeklyRecap = {
    id: uuid(),
    createdAt: Date.now(),
    weekStart,
    content,
    status: 'active',
  };
  await db.weeklyRecaps.put(recap);
  return recap;
}

/** Most recent active recap, or null. */
export async function getActiveRecap(): Promise<WeeklyRecap | null> {
  const all = await db.weeklyRecaps
    .where('status')
    .equals('active')
    .reverse()
    .sortBy('createdAt');
  return all[0] ?? null;
}

export async function dismissRecap(id: string): Promise<void> {
  await db.weeklyRecaps.update(id, { status: 'dismissed' });
}

/**
 * Server-side equivalent of generateWeeklyRecap that takes inputs directly
 * (used by verification scripts; no Dexie required). Returns the prompt
 * payload that would be sent to /api/weekly-recap.
 */
export function buildRecapPayload(opts: {
  entries: Entry[];
  people: Person[];
  weekStart: number;
}): {
  weekStart: number;
  stats: {
    totalEntries: number;
    peopleMentioned: number;
    avgSentiment: number;
    topPeople: Array<{
      name: string;
      entryCount: number;
      avgSentiment: number;
      lastSeenDaysAgo: number;
    }>;
  };
  entrySample: Array<{
    personName: string | null;
    text: string;
    sentiment: number;
    tags: string[];
    daysAgo: number;
  }>;
} {
  const { entries, people, weekStart } = opts;
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const perPerson = new Map<
    string,
    { name: string; entries: Entry[]; lastSeen: number }
  >();
  for (const e of entries) {
    if (!e.personId) continue;
    const p = peopleById.get(e.personId);
    if (!p) continue;
    const slot = perPerson.get(e.personId);
    if (slot) {
      slot.entries.push(e);
      slot.lastSeen = Math.max(slot.lastSeen, e.createdAt);
    } else {
      perPerson.set(e.personId, {
        name: p.name,
        entries: [e],
        lastSeen: e.createdAt,
      });
    }
  }
  const ranked = Array.from(perPerson.values()).sort(
    (a, b) => b.entries.length - a.entries.length
  );
  const topPeople = ranked.slice(0, 3).map((row) => ({
    name: row.name,
    entryCount: row.entries.length,
    avgSentiment:
      row.entries.reduce((s, e) => s + e.sentiment, 0) / row.entries.length,
    lastSeenDaysAgo: Math.floor((Date.now() - row.lastSeen) / DAY_MS),
  }));
  const entrySample = [...entries]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 8)
    .map((e) => ({
      personName: e.personId ? peopleById.get(e.personId)?.name ?? null : null,
      text: e.text,
      sentiment: e.sentiment,
      tags: e.tags,
      daysAgo: Math.floor((Date.now() - e.createdAt) / DAY_MS),
    }));
  return {
    weekStart,
    stats: {
      totalEntries: entries.length,
      peopleMentioned: perPerson.size,
      avgSentiment:
        entries.reduce((s, e) => s + e.sentiment, 0) / entries.length,
      topPeople,
    },
    entrySample,
  };
}
