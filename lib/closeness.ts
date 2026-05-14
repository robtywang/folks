import type { Entry, Person } from '@/types';
import { db } from './db';

// ── Tuning parameters (see folks-v1-refactor-spec §4) ────────────────────────
const DAY_MS = 24 * 60 * 60 * 1000;
const HALF_LIFE_DAYS = 60;
const RECENT_WINDOW_DAYS = 90;
const PERTURBATION_WINDOW_DAYS = 14;
const MAX_PERTURBATION = 0.5;
const FREQ_SATURATION = 50;
const SAMPLE_SIZE_THRESHOLD = 3;
const DEPTH_TAGS = ['vulnerable', 'honest', 'present', 'supportive'];
const INTENSITY_PIVOT = 5.5;
const MAX_INTENSITY = 4.5; // |sentiment - 5.5| max when sentiment is 1 or 10

// ── Helpers ──────────────────────────────────────────────────────────────────
function daysAgo(timestamp: number, asOfTime: number = Date.now()): number {
  return (asOfTime - timestamp) / DAY_MS;
}
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ── Core: two-axis closeness ─────────────────────────────────────────────────

export interface ClosenessResult {
  /** Long-window, valence-free score 0–10. Measures emotional presence. */
  base: number;
  /** Short-window adjustment, bounded ±MAX_PERTURBATION. */
  perturbation: number;
  /** What the UI displays. clamped 0–10. */
  display: number;
}

/**
 * Baseline closeness. Long window, no valence: how much this person occupies
 * your bandwidth regardless of whether the entries are warm or rough.
 *
 * Intensity = |sentiment - 5.5| so fights and warmth both register; flat 5s
 * score low. Frequency is log-shaped so a 50-entry friend stays distinct
 * from a 10-entry friend. Depth bonus from vulnerable / honest tags.
 */
export function baseClosenessFor(
  entries: Entry[],
  asOfTime: number = Date.now()
): number {
  const valid = entries.filter((e) => e.createdAt <= asOfTime);
  if (valid.length === 0) return 0;

  let weightedIntensity = 0;
  let totalWeight = 0;
  for (const e of valid) {
    const decay = Math.exp(-daysAgo(e.createdAt, asOfTime) / HALF_LIFE_DAYS);
    weightedIntensity += Math.abs(e.sentiment - INTENSITY_PIVOT) * decay;
    totalWeight += decay;
  }
  const intensityScore = totalWeight > 0 ? weightedIntensity / totalWeight : 0;
  const intensityNorm = Math.min(intensityScore / MAX_INTENSITY, 1);

  const recentCount = valid.filter(
    (e) => daysAgo(e.createdAt, asOfTime) <= RECENT_WINDOW_DAYS
  ).length;
  const freqNorm = Math.log(1 + recentCount) / Math.log(FREQ_SATURATION);

  const depthEntries = valid.filter(
    (e) => e.tags && e.tags.some((t) => DEPTH_TAGS.includes(t))
  );
  const depthNorm = depthEntries.length / valid.length;

  // Frequency weighted higher than intensity — "people you write about a lot"
  // is the most reliable closeness signal. Intensity still matters (deep
  // sporadic relationships exist) but doesn't dominate.
  const composite = intensityNorm * 0.3 + freqNorm * 0.55 + depthNorm * 0.15;
  return clamp(composite * 10, 0, 10);
}

/**
 * Short-term sentiment overlay. Bounded so it can swap adjacent ranks but
 * can't punt someone out of their tier — a fight this week shouldn't drop
 * a real close friend to mid-tier.
 */
export function sentimentPerturbation(
  entries: Entry[],
  asOfTime: number = Date.now()
): number {
  const recent = entries.filter(
    (e) =>
      e.createdAt <= asOfTime &&
      daysAgo(e.createdAt, asOfTime) <= PERTURBATION_WINDOW_DAYS
  );
  if (recent.length === 0) return 0;
  const avg = recent.reduce((a, e) => a + e.sentiment, 0) / recent.length;
  const delta = (avg - INTENSITY_PIVOT) * 0.15;
  return clamp(delta, -MAX_PERTURBATION, MAX_PERTURBATION);
}

export function closenessFor(
  entries: Entry[],
  asOfTime: number = Date.now()
): ClosenessResult {
  const base = baseClosenessFor(entries, asOfTime);
  const perturbation = sentimentPerturbation(entries, asOfTime);
  const display = clamp(base + perturbation, 0, 10);
  return { base, perturbation, display };
}

// ── Sample-size states ───────────────────────────────────────────────────────

export type ClosenessState =
  | { status: 'forming'; entryCount: number }
  | { status: 'stable'; result: ClosenessResult };

export function closenessState(entries: Entry[]): ClosenessState {
  if (entries.length < SAMPLE_SIZE_THRESHOLD) {
    return { status: 'forming', entryCount: entries.length };
  }
  return { status: 'stable', result: closenessFor(entries) };
}

// ── Trajectory ───────────────────────────────────────────────────────────────

export interface Trajectory {
  now: ClosenessResult;
  /** Display-score delta vs 7 days ago. Picks up acute weekly shifts. */
  trendShort: number;
  /** Base-score delta vs 30 days ago. Picks up slow drift. */
  trendLong: number;
}

export function trajectoryFor(entries: Entry[]): Trajectory {
  const now = closenessFor(entries);
  const weekAgo = closenessFor(entries, Date.now() - 7 * DAY_MS);
  const monthAgo = closenessFor(entries, Date.now() - 30 * DAY_MS);
  return {
    now,
    trendShort: now.display - weekAgo.display,
    trendLong: now.base - monthAgo.base,
  };
}

/**
 * One-line plain-language reason for the current trend. Empty string when
 * nothing notable is happening — UI just shows the arrow + score.
 */
export function trendReason(entries: Entry[], trendShort: number): string {
  if (entries.length === 0) return '';
  const recent = entries.filter((e) => daysAgo(e.createdAt) <= 14);
  const daysSinceLast = entries.reduce(
    (min, e) => Math.min(min, daysAgo(e.createdAt)),
    Infinity
  );

  if (recent.length === 0 && daysSinceLast > 21) {
    return `${Math.round(daysSinceLast)} days since last entry`;
  }
  if (recent.length >= 3 && trendShort > 0.2) {
    const avg = recent.reduce((a, e) => a + e.sentiment, 0) / recent.length;
    if (avg > 6.5) return `${recent.length} entries this week, mostly warm`;
    if (avg < 4.5) return `${recent.length} entries this week, mostly heavy`;
    return `${recent.length} entries this week`;
  }
  if (trendShort < -0.2 && recent.length > 0) {
    return 'rough stretch passing';
  }
  return '';
}

// ── Sparkline history ────────────────────────────────────────────────────────

/**
 * Sample closeness display score backward in time. Used for sparklines.
 * Default 4 weekly points; profile trajectory card uses 9 weekly points
 * (≈ 60 days) for a richer arc.
 */
export function closenessHistory(
  entries: Entry[],
  points: number = 4,
  stepDays: number = 7
): number[] {
  const now = Date.now();
  const result: number[] = [];
  for (let i = points - 1; i >= 0; i--) {
    const asOf = now - i * stepDays * DAY_MS;
    result.push(closenessFor(entries, asOf).display);
  }
  return result;
}

// ── Sentiment trend ──────────────────────────────────────────────────────────

export interface SentimentBucket {
  /** Unix ms at the start of the week. */
  weekStart: number;
  /** Mean sentiment across entries in this week, or null if no entries. */
  avg: number | null;
  /** Count of entries that contributed. */
  count: number;
}

export interface SentimentTrend {
  buckets: SentimentBucket[];
  /** Mean sentiment across all entries (lifetime). */
  lifetimeAvg: number | null;
  /** Mean sentiment across last 4 buckets with data. */
  recentAvg: number | null;
  /** recentAvg − (mean of prior 4 buckets with data). null if not enough data. */
  delta: number | null;
}

/**
 * Bucket entries into weekly averages, oldest-first. Empty weeks have
 * `avg: null` so the renderer can draw a gap. Reports a delta between the most
 * recent 4 weeks of data and the 4 before that — a stable comparison that's
 * resilient to a quiet week or two.
 */
export function sentimentHistory(
  entries: Entry[],
  weeks: number = 12
): SentimentTrend {
  if (entries.length === 0) {
    return { buckets: [], lifetimeAvg: null, recentAvg: null, delta: null };
  }
  const now = Date.now();
  // Anchor the last bucket to "this week" so weekStart aligns to start of
  // the rolling 7-day window. We bucket by floor((now - createdAt) / 7d).
  const buckets: SentimentBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    buckets.push({
      weekStart: now - i * 7 * DAY_MS,
      avg: null,
      count: 0,
    });
  }
  const totalByBucket = new Array(weeks).fill(0);
  for (const e of entries) {
    const daysAgoVal = (now - e.createdAt) / DAY_MS;
    if (daysAgoVal < 0 || daysAgoVal >= weeks * 7) continue;
    const bucketIndex = weeks - 1 - Math.floor(daysAgoVal / 7);
    if (bucketIndex < 0 || bucketIndex >= weeks) continue;
    totalByBucket[bucketIndex] += e.sentiment;
    buckets[bucketIndex].count += 1;
  }
  for (let i = 0; i < weeks; i++) {
    if (buckets[i].count > 0) {
      buckets[i].avg = totalByBucket[i] / buckets[i].count;
    }
  }

  const lifetimeAvg =
    entries.reduce((s, e) => s + e.sentiment, 0) / entries.length;

  const populated = buckets.filter((b) => b.avg !== null);
  const lastFour = populated.slice(-4);
  const priorFour = populated.slice(-8, -4);
  const recentAvg =
    lastFour.length > 0
      ? lastFour.reduce((s, b) => s + (b.avg as number), 0) / lastFour.length
      : null;
  const priorAvg =
    priorFour.length > 0
      ? priorFour.reduce((s, b) => s + (b.avg as number), 0) / priorFour.length
      : null;
  const delta =
    recentAvg !== null && priorAvg !== null ? recentAvg - priorAvg : null;

  return { buckets, lifetimeAvg, recentAvg, delta };
}

// ── Per-entry impact ─────────────────────────────────────────────────────────

/**
 * For each entry, what did adding it do to the displayed closeness score?
 * Returns a map of entry.id → delta. Lets the profile show "this entry
 * pushed closeness +0.4" badges next to each row, giving users an
 * event-driven view of the otherwise snapshot-based algorithm.
 */
export function entryImpacts(entries: Entry[]): Map<string, number> {
  const result = new Map<string, number>();
  if (entries.length === 0) return result;
  const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt);
  let prevScore = 0;
  for (let i = 0; i < sorted.length; i++) {
    const upTo = sorted.slice(0, i + 1);
    // Use the entry's own createdAt as "now" so recency decay is computed
    // against the moment that entry was logged — not today, which would
    // unfairly punish old entries.
    const score = closenessFor(upTo, sorted[i].createdAt).display;
    result.set(sorted[i].id, score - prevScore);
    prevScore = score;
  }
  return result;
}

// ── Person record persistence ────────────────────────────────────────────────

export function closeness(entries: Entry[]): number {
  return closenessFor(entries).display;
}

export async function recomputePerson(personId: string): Promise<void> {
  const person = await db.people.get(personId);
  if (!person) return;
  const entries = await db.entries
    .where('personId')
    .equals(personId)
    .toArray();
  if (entries.length === 0) return;

  const traj = trajectoryFor(entries);

  await db.people.update(personId, {
    closenessScore: traj.now.display,
    closenessTrend: traj.trendShort,
    entryCount: entries.length,
    avgSentiment:
      entries.reduce((s, e) => s + e.sentiment, 0) / entries.length,
    lastInteraction: Math.max(...entries.map((e) => e.createdAt)),
  });
}

export async function recomputeAll(): Promise<void> {
  const people = await db.people.toArray();
  await Promise.all(people.map((p) => recomputePerson(p.id)));
}

// ── Cadence (used in profile footer) ─────────────────────────────────────────

export interface Cadence {
  lastInteraction: number | null;
  avgIntervalDays: number | null;
  total: number;
}

export function cadenceFor(entries: Entry[]): Cadence {
  if (entries.length === 0) {
    return { lastInteraction: null, avgIntervalDays: null, total: 0 };
  }
  const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt);
  const first = sorted[0]!.createdAt;
  const last = sorted[sorted.length - 1]!.createdAt;
  const avgIntervalDays =
    entries.length >= 2 ? (last - first) / DAY_MS / (entries.length - 1) : null;
  return {
    lastInteraction: last,
    avgIntervalDays,
    total: entries.length,
  };
}
