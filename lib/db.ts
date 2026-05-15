import Dexie, { type Table } from 'dexie';
import type { Entry, Person, WeeklyRecap, FriendPrompt } from '@/types';

interface MetaRow {
  key: string;
  value: unknown;
}

class CircleDB extends Dexie {
  entries!: Table<Entry, string>;
  people!: Table<Person, string>;
  meta!: Table<MetaRow, string>;
  weeklyRecaps!: Table<WeeklyRecap, string>;
  friendPrompts!: Table<FriendPrompt, string>;

  constructor() {
    super('circle');
    this.version(1).stores({
      entries: 'id, createdAt, personId, sentiment',
      people: 'id, name, closenessScore, lastInteraction, isTransient',
    });
    // v2: meta kv table for app-level flags (hasSeenPasscodeWarning, etc.)
    this.version(2).stores({
      entries: 'id, createdAt, personId, sentiment',
      people: 'id, name, closenessScore, lastInteraction, isTransient',
      meta: 'key',
    });
    // v3: weekly recaps + per-friend prompted questions. Both additive —
    // existing entries/people/meta are untouched.
    this.version(3).stores({
      entries: 'id, createdAt, personId, sentiment',
      people: 'id, name, closenessScore, lastInteraction, isTransient',
      meta: 'key',
      weeklyRecaps: 'id, createdAt, weekStart, status',
      friendPrompts: 'id, personId, createdAt, status',
    });
  }
}

export const db = new CircleDB();

export async function getMeta<T>(key: string): Promise<T | undefined> {
  try {
    const row = await db.meta.get(key);
    return row?.value as T | undefined;
  } catch {
    return undefined;
  }
}

export async function setMeta<T>(key: string, value: T): Promise<void> {
  try {
    await db.meta.put({ key, value });
  } catch (err) {
    console.warn('setMeta failed:', err);
  }
}

// Helper: generate a UUID
export function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Find an existing person by name (case-insensitive). Returns null if not found.
export async function findPersonByName(name: string): Promise<Person | null> {
  const normalized = name.trim().toLowerCase();
  const all = await db.people.toArray();
  return all.find((p) => p.name.toLowerCase() === normalized) ?? null;
}

// All people sharing the same first-name token (case-insensitive). Used to
// detect collisions ("Maya" vs "Maya R" vs "Maya from work") so we can prompt
// the user instead of silently picking one.
export async function findPeopleByFirstName(name: string): Promise<Person[]> {
  const firstToken = name.trim().toLowerCase().split(/\s+/)[0];
  if (!firstToken) return [];
  const all = await db.people.toArray();
  return all.filter((p) => {
    const personFirst = p.name.trim().toLowerCase().split(/\s+/)[0];
    return personFirst === firstToken;
  });
}

// Create a new person record.
export async function createPerson(
  name: string,
  options: { isTransient?: boolean } = {}
): Promise<Person> {
  const person: Person = {
    id: uuid(),
    createdAt: Date.now(),
    name,
    closenessScore: 0,
    closenessTrend: 0,
    lastInteraction: Date.now(),
    entryCount: 0,
    avgSentiment: 0,
    muted: false,
    pinned: false,
    isTransient: options.isTransient ?? false,
  };
  await db.people.put(person);
  return person;
}
