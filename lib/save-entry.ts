import {
  db,
  uuid,
  findPersonByName,
  findPeopleByFirstName,
  createPerson,
} from './db';
import { parseEntry, type ParserEngine } from './ai';
import { recomputePerson } from './closeness';
import type { Entry, ParseResponse, Person } from '@/types';

export interface SaveResult {
  entry: Entry;
  parsed: ParseResponse;
  attributedTo: string | null; // person name, or null if solo
  newPersonCreated: boolean;
  engine: ParserEngine;
  /**
   * Other people who share the same first name as the attributed person. Empty
   * when there's no ambiguity. The compose UI uses this to surface a "which
   * Maya?" picker so the user can disambiguate or merge.
   */
  nameClashes: Person[];
}

/**
 * Save a new entry. Handles AI parsing, person attribution, person emergence,
 * and closeness recomputation in one call.
 */
export async function saveEntry(text: string): Promise<SaveResult> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Entry text is empty');

  const { parsed, engine } = await parseEntry(trimmed);

  let personId: string | null = null;
  let newPersonCreated = false;
  let attributedTo: string | null = null;

  if (!parsed.is_solo && parsed.primary_person) {
    const existing = await findPersonByName(parsed.primary_person);

    if (existing) {
      // If they were transient (one prior mention) and now confidence is decent,
      // promote them to a real person.
      if (existing.isTransient && parsed.confidence >= 0.7) {
        await db.people.update(existing.id, { isTransient: false });
      }
      personId = existing.id;
      attributedTo = existing.name;
    } else if (parsed.is_new_person && parsed.confidence >= 0.7) {
      // First mention of a new name — store as transient. Will get promoted on
      // second distinct mention via the branch above.
      const newPerson = await createPerson(parsed.primary_person, {
        isTransient: true,
      });
      personId = newPerson.id;
      attributedTo = newPerson.name;
      newPersonCreated = true;
    }
  }

  const now = Date.now();
  const entry: Entry = {
    id: uuid(),
    createdAt: now,
    updatedAt: now,
    text: trimmed,
    personId,
    sentiment: parsed.sentiment,
    tags: parsed.tags,
    aiConfidence: parsed.confidence,
    userConfirmed: false,
    additionalPeople: parsed.additional_people,
    // Snapshot what the AI originally said — never mutated. Comparing this to
    // entry.personId / entry.sentiment later tells us when the user corrected
    // the AI, which feeds future few-shot examples.
    aiPredictedPersonName: parsed.primary_person ?? null,
    aiPredictedSentiment: parsed.sentiment,
  };

  await db.entries.put(entry);

  if (personId) {
    await recomputePerson(personId);
  }

  // Surface same-first-name collisions so the UI can prompt for disambiguation.
  // We only care if there are 2+ people with that first name (the attributed
  // one plus at least one other); a single match is fine.
  let nameClashes: Person[] = [];
  if (parsed.primary_person && personId) {
    const matches = await findPeopleByFirstName(parsed.primary_person);
    if (matches.length >= 2) nameClashes = matches;
  }

  return {
    entry,
    parsed,
    attributedTo,
    newPersonCreated,
    engine,
    nameClashes,
  };
}

/**
 * Override the AI-assigned sentiment for an entry. Marks it as user-confirmed
 * and recomputes the person's closeness if attributed.
 */
export async function updateEntrySentiment(
  entryId: string,
  sentiment: number
): Promise<void> {
  const entry = await db.entries.get(entryId);
  if (!entry) return;
  await db.entries.update(entryId, {
    sentiment,
    updatedAt: Date.now(),
    userConfirmed: true,
  });
  if (entry.personId) {
    await recomputePerson(entry.personId);
  }
}

/**
 * Edit the text of an existing entry. Re-runs Claude on the new text so
 * sentiment + tags refresh, then recomputes closeness so the rating reflects
 * the edited content. Person attribution is intentionally preserved — a text
 * edit should never reassign the entry to a different person without the
 * user explicitly choosing so.
 */
export async function updateEntryText(
  entryId: string,
  text: string
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Entry text is empty');
  const entry = await db.entries.get(entryId);
  if (!entry) throw new Error('Entry not found');

  // Re-parse to refresh sentiment + tags from the new text. If parse fails
  // (no API key, network blip), fall back to keeping the existing values so
  // the edit still saves.
  let nextSentiment = entry.sentiment;
  let nextTags = entry.tags;
  try {
    const { parsed } = await parseEntry(trimmed);
    nextSentiment = parsed.sentiment;
    nextTags = parsed.tags;
  } catch (err) {
    console.warn('Re-parse on text edit failed; keeping old values:', err);
  }

  await db.entries.update(entryId, {
    text: trimmed,
    sentiment: nextSentiment,
    tags: nextTags,
    updatedAt: Date.now(),
    userConfirmed: true,
  });

  if (entry.personId) {
    await recomputePerson(entry.personId);
  }
}

/**
 * One-shot cleanup: find every Person that has zero entries pointing to them
 * and delete them. Cheap O(n) pass; safe to call on app boot. Catches orphans
 * created before per-action pruning was wired up.
 */
/**
 * Nuclear option: wipe every piece of user data — entries, people, meta,
 * passcode hash/salt/hint/mode, onboarding flag, user profile. Used by the
 * "forgot passcode → wipe everything" escape hatch on the lock screen.
 */
export async function wipeEverything(): Promise<void> {
  try {
    await db.entries.clear();
    await db.people.clear();
    await db.meta.clear();
  } catch (err) {
    console.error('Wipe Dexie failed:', err);
  }
  // Local storage keys folks owns
  const keys = [
    'folks_lock_pin_hash',
    'folks_lock_pin_salt',
    'folks_lock_pin_hint',
    'folks_passcode_mode',
    'folks_onboarded',
    'folks_user_name',
    'folks_user_about',
  ];
  try {
    for (const k of keys) localStorage.removeItem(k);
    sessionStorage.clear();
  } catch {
    // ignore
  }
}

export async function pruneAllOrphans(): Promise<number> {
  const [people, entries] = await Promise.all([
    db.people.toArray(),
    db.entries.toArray(),
  ]);
  const haveEntries = new Set<string>();
  for (const e of entries) {
    if (e.personId) haveEntries.add(e.personId);
  }
  const orphans = people.filter((p) => !haveEntries.has(p.id));
  if (orphans.length === 0) return 0;
  await db.people.bulkDelete(orphans.map((p) => p.id));
  return orphans.length;
}

/**
 * If a person has no entries left, remove them entirely. Prevents orphaned
 * people from cluttering the list after their last entry is deleted or
 * reassigned away.
 */
async function pruneIfOrphaned(personId: string): Promise<boolean> {
  const remaining = await db.entries
    .where('personId')
    .equals(personId)
    .count();
  if (remaining === 0) {
    await db.people.delete(personId);
    return true;
  }
  return false;
}

/**
 * Delete an entry. Recomputes the person's closeness, or removes the person
 * entirely if that was their last entry.
 */
export async function deleteEntry(entryId: string): Promise<void> {
  const entry = await db.entries.get(entryId);
  if (!entry) return;
  const personId = entry.personId;
  await db.entries.delete(entryId);
  if (personId) {
    const pruned = await pruneIfOrphaned(personId);
    if (!pruned) await recomputePerson(personId);
  }
}

/**
 * Merge `sourceId` into `targetId`: reassign every entry from source to target,
 * then delete the source person. Used to collapse duplicate "Maya" records
 * into one. The target's closeness is recomputed.
 */
export async function mergePerson(
  sourceId: string,
  targetId: string
): Promise<{ entriesMoved: number }> {
  if (sourceId === targetId) return { entriesMoved: 0 };
  const entries = await db.entries
    .where('personId')
    .equals(sourceId)
    .toArray();
  await Promise.all(
    entries.map((e) =>
      db.entries.update(e.id, {
        personId: targetId,
        updatedAt: Date.now(),
        userConfirmed: true,
      })
    )
  );
  await db.people.delete(sourceId);
  await recomputePerson(targetId);
  return { entriesMoved: entries.length };
}

/**
 * Remove a person from the circle. Their entries are kept but unattributed
 * (become solo entries) so the user's writing isn't destroyed.
 */
export async function removePerson(personId: string): Promise<void> {
  const entries = await db.entries.where('personId').equals(personId).toArray();
  await Promise.all(
    entries.map((e) =>
      db.entries.update(e.id, {
        personId: null,
        updatedAt: Date.now(),
      })
    )
  );
  await db.people.delete(personId);
}

export type AttributionTarget =
  | { kind: 'person'; name: string }
  | { kind: 'solo' };

/**
 * Reassign which person an entry is attributed to (or mark it as solo).
 * Creates the person if the name is new. Recomputes closeness for both the
 * old and new attribution so the rankings stay in sync.
 */
export async function updateEntryAttribution(
  entryId: string,
  target: AttributionTarget
): Promise<{ person: Person | null }> {
  const entry = await db.entries.get(entryId);
  if (!entry) throw new Error('Entry not found');

  const oldPersonId = entry.personId;
  let newPerson: Person | null = null;

  if (target.kind === 'person') {
    const name = target.name.trim();
    if (!name) throw new Error('Person name required');

    const existing = await findPersonByName(name);
    if (existing) {
      if (existing.isTransient) {
        await db.people.update(existing.id, { isTransient: false });
      }
      newPerson = { ...existing, isTransient: false };
    } else {
      newPerson = await createPerson(name, { isTransient: false });
    }
  }

  await db.entries.update(entryId, {
    personId: newPerson?.id ?? null,
    updatedAt: Date.now(),
    userConfirmed: true,
  });

  // If we left someone, recompute or prune them if they have no entries left.
  if (oldPersonId && oldPersonId !== newPerson?.id) {
    const pruned = await pruneIfOrphaned(oldPersonId);
    if (!pruned) await recomputePerson(oldPersonId);
  }
  if (newPerson) {
    await recomputePerson(newPerson.id);
  }

  return { person: newPerson };
}
