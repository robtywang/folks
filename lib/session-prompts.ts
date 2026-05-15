/**
 * Session-level home placeholder rotator. Picks a fresh prompt each mount,
 * time-of-day aware, and avoids repeating the last one. Separate from the
 * AI friend-prompts system in lib/prompts.ts (which generates per-friend
 * questions from detected patterns) — different domain, different file.
 */

const ALL_PROMPTS = [
  "what's on your mind?",      // 0
  'how was today?',            // 1  ← evening
  "who's on your mind?",       // 2
  'anything weighing on you?', // 3
  "what won't leave you alone?", // 4
  'what happened today?',      // 5  ← evening
  'anything to get off your chest?', // 6
  'what do you want to remember?',   // 7  ← evening
] as const;

const EVENING_INDICES = [1, 5, 7] as const;

const STORAGE_KEY = 'folks.lastPromptIndex';

function readLastIndex(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeLastIndex(i: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(i));
  } catch {
    // localStorage can be unavailable (private mode, quota) — ignore.
  }
}

function pickRandom<T>(pool: readonly T[], avoid?: T): T {
  if (pool.length === 0) throw new Error('empty pool');
  if (pool.length === 1 || avoid === undefined) {
    return pool[Math.floor(Math.random() * pool.length)]!;
  }
  const filtered = pool.filter((x) => x !== avoid);
  if (filtered.length === 0) {
    return pool[Math.floor(Math.random() * pool.length)]!;
  }
  return filtered[Math.floor(Math.random() * filtered.length)]!;
}

export function getPromptForSession(): string {
  const hour = new Date().getHours();
  const evening = hour >= 18 || hour < 6;

  const lastIndex = readLastIndex();
  const pool: readonly number[] = evening
    ? EVENING_INDICES
    : ALL_PROMPTS.map((_, i) => i);

  // Avoid the previously-served index when possible.
  const avoidIndex =
    lastIndex !== null && pool.includes(lastIndex) ? lastIndex : undefined;
  const chosenIndex = pickRandom(pool, avoidIndex);

  writeLastIndex(chosenIndex);
  return ALL_PROMPTS[chosenIndex]!;
}
