import type { Entry, FriendPrompt, Person } from '@/types';
import { db, uuid } from './db';
import { detectPatterns, type DetectedPattern } from './insights';

const DAY_MS = 86_400_000;
const STALE_DAYS = 7;
const EXPIRE_DAYS = 30;
const MAX_ACTIVE_PER_PERSON = 5;
const MIN_ENTRIES = 3;

export type PromptRefreshTrigger = 'new_entry' | 'manual' | 'mount';

/**
 * Should we re-run prompt generation for this person? Yes if:
 *   - they have ≥3 entries (forming → stable)
 *   - they aren't muted
 *   - no active prompts exist, OR the newest prompt is older than 7 days
 *
 * Called fire-and-forget from save-entry.ts after a new entry lands.
 */
export async function maybeRefreshPrompts(
  personId: string,
  trigger: PromptRefreshTrigger
): Promise<{ refreshed: boolean; reason: string }> {
  const person = await db.people.get(personId);
  if (!person) return { refreshed: false, reason: 'person not found' };
  if (person.muted) return { refreshed: false, reason: 'muted' };
  if (person.entryCount < MIN_ENTRIES) {
    return { refreshed: false, reason: 'forming' };
  }

  if (trigger !== 'manual') {
    const active = await getActivePrompts(personId);
    if (active.length > 0) {
      const newest = active[0];
      const age = Date.now() - newest.createdAt;
      if (age < STALE_DAYS * DAY_MS) {
        return { refreshed: false, reason: 'fresh enough' };
      }
    }
  }

  const entries = await db.entries
    .where('personId')
    .equals(personId)
    .reverse()
    .sortBy('createdAt');
  if (entries.length < MIN_ENTRIES) {
    return { refreshed: false, reason: 'not enough entries' };
  }

  const generated = await generatePrompts(person, entries);
  if (!generated || generated.length === 0) {
    return { refreshed: false, reason: 'no patterns' };
  }

  await savePrompts(personId, generated);
  return { refreshed: true, reason: 'ok' };
}

/**
 * Build the payload, call /api/prompts, return the questions. Does NOT persist.
 * Returns null if no patterns or the API errored.
 */
export async function generatePrompts(
  person: Person,
  entries: Entry[]
): Promise<{ question: string; sourcePattern: string }[] | null> {
  const patterns = detectPatterns(entries);
  if (patterns.length === 0) return null;

  const payload = {
    person: {
      name: person.name,
      entryCount: person.entryCount,
      avgSentiment: person.avgSentiment,
      userContext: person.userContext ?? null,
    },
    patterns: patterns.map((p) => ({
      kind: p.kind,
      fact: p.fact,
      support: p.support,
      delta: p.delta,
    })),
    entrySample: entries.slice(0, 8).map((e) => ({
      text: e.text,
      sentiment: e.sentiment,
      tags: e.tags,
      daysAgo: Math.max(0, Math.floor((Date.now() - e.createdAt) / DAY_MS)),
    })),
  };

  const res = await fetch('/api/prompts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data.questions)) return null;

  return data.questions
    .filter(
      (q: unknown): q is { question: string; sourcePattern: string } =>
        !!q &&
        typeof (q as { question?: unknown }).question === 'string' &&
        typeof (q as { sourcePattern?: unknown }).sourcePattern === 'string'
    )
    .slice(0, MAX_ACTIVE_PER_PERSON);
}

/**
 * Persist new prompts. Active prompts from this person are expired first so
 * we always replace, not append (avoids stale + fresh mixing).
 */
export async function savePrompts(
  personId: string,
  generated: { question: string; sourcePattern: string }[]
): Promise<FriendPrompt[]> {
  // Expire any previously-active prompts for this person.
  const previousActive = await db.friendPrompts
    .where('personId')
    .equals(personId)
    .filter((p) => p.status === 'active')
    .toArray();
  await Promise.all(
    previousActive.map((p) =>
      db.friendPrompts.update(p.id, { status: 'expired' })
    )
  );

  const now = Date.now();
  const rows: FriendPrompt[] = generated.map((g) => ({
    id: uuid(),
    personId,
    createdAt: now,
    text: g.question,
    sourcePattern: g.sourcePattern,
    status: 'active',
  }));
  await db.friendPrompts.bulkPut(rows);
  return rows;
}

/** Active prompts for a person, newest first. */
export async function getActivePrompts(
  personId: string
): Promise<FriendPrompt[]> {
  const all = await db.friendPrompts
    .where('personId')
    .equals(personId)
    .toArray();
  return all
    .filter((p) => p.status === 'active')
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_ACTIVE_PER_PERSON);
}

/** All active prompts across all people (for the home rotator). */
export async function getAllActivePrompts(): Promise<FriendPrompt[]> {
  const all = await db.friendPrompts.toArray();
  return all
    .filter((p) => p.status === 'active')
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function markAnswered(
  promptId: string,
  entryId: string
): Promise<void> {
  await db.friendPrompts.update(promptId, {
    status: 'answered',
    answeredByEntryId: entryId,
  });
}

export async function dismissPrompt(promptId: string): Promise<void> {
  await db.friendPrompts.update(promptId, { status: 'dismissed' });
}

/**
 * Expire any prompt older than 30 days. Cheap O(n); safe to call on boot.
 */
export async function expireOldPrompts(): Promise<number> {
  const cutoff = Date.now() - EXPIRE_DAYS * DAY_MS;
  const stale = await db.friendPrompts
    .where('createdAt')
    .below(cutoff)
    .filter((p) => p.status === 'active')
    .toArray();
  if (stale.length === 0) return 0;
  await Promise.all(
    stale.map((p) => db.friendPrompts.update(p.id, { status: 'expired' }))
  );
  return stale.length;
}

/**
 * Build the prompts API payload without Dexie (for verification scripts). The
 * shape exactly mirrors what generatePrompts sends to /api/prompts.
 */
export function buildPromptsPayload(opts: {
  person: Pick<Person, 'name' | 'entryCount' | 'avgSentiment' | 'userContext'>;
  entries: Entry[];
}): {
  person: {
    name: string;
    entryCount: number;
    avgSentiment: number;
    userContext: string | null;
  };
  patterns: Array<Pick<DetectedPattern, 'kind' | 'fact' | 'support' | 'delta'>>;
  entrySample: Array<{
    text: string;
    sentiment: number;
    tags: string[];
    daysAgo: number;
  }>;
} | null {
  const { person, entries } = opts;
  const patterns = detectPatterns(entries);
  if (patterns.length === 0) return null;
  return {
    person: {
      name: person.name,
      entryCount: person.entryCount,
      avgSentiment: person.avgSentiment,
      userContext: person.userContext ?? null,
    },
    patterns: patterns.map((p) => ({
      kind: p.kind,
      fact: p.fact,
      support: p.support,
      delta: p.delta,
    })),
    entrySample: entries.slice(0, 8).map((e) => ({
      text: e.text,
      sentiment: e.sentiment,
      tags: e.tags,
      daysAgo: Math.max(0, Math.floor((Date.now() - e.createdAt) / DAY_MS)),
    })),
  };
}
