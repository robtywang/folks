import { db } from './db';
import { generateReading, saveReading } from './reading';

/**
 * Reading auto-trigger threshold. Fires when a person reaches:
 *   - entry 3   (first stable moment — the user just unlocked patterns)
 *   - entry 13, 23, 33, ...  (every 10 entries after that)
 *
 * The reasoning: at entry 3 the person crosses from forming → stable and
 * gets a rank, so a Reading should exist by then. After that, Opus is
 * expensive ($0.05/call) so we throttle to every 10 entries.
 */
export function shouldAutoFireReading(entryCount: number): boolean {
  if (entryCount < 3) return false;
  if (entryCount === 3) return true;
  return (entryCount - 3) % 10 === 0;
}

/**
 * Check post-save whether this person's new entry count hit a Reading
 * threshold (3, 13, 23, ...). If so, fire generateReading + saveReading.
 * Idempotent — safe to call after every save.
 */
export async function maybeAutoFireReading(personId: string): Promise<void> {
  const person = await db.people.get(personId);
  if (!person) return;
  if (person.muted || person.isTransient) return;
  if (!shouldAutoFireReading(person.entryCount)) return;

  const entries = await db.entries
    .where('personId')
    .equals(personId)
    .reverse()
    .sortBy('createdAt');
  if (entries.length === 0) return;

  const reading = await generateReading(person, entries);
  await saveReading(personId, reading);
}
