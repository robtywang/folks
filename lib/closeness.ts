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
// max positive-side intensity contribution (sentiment 10 - pivot 5.5)
const MAX_POSITIVE_INTENSITY = 4.5;

// Severity → harm. Squared so 3 is 9× worse than 1; recency-decayed.
const SEVERITY_PENALTY_SCALE = 0.4;
const SEVERITY_PENALTY_CAP = -4.0;
const SEVERE_CEILING_LOOKBACK_DAYS = 30;
const SEVERE_CEILING_LEVEL = 3;
const SEVERE_CEILING_VALUE = 3.0;

// ── Helpers ──────────────────────────────────────────────────────────────────
function daysAgo(timestamp: number, asOfTime: number = Date.now()): number {
  return (asOfTime - timestamp) / DAY_MS;
}
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ── Core: two-axis closeness ─────────────────────────────────────────────────

export interface ClosenessResult {
  /** Long-window score 0–10. Positive engagement + frequency + depth. */
  base: number;
  /** Short-window sentiment adjustment, bounded ±MAX_PERTURBATION. */
  perturbation: number;
  /** Harm penalty (≤ 0). Squared severity × recency-decay, summed and capped. */
  severityPenalty: number;
  /** What the UI displays. clamped 0–10, with severe-recent ceiling applied. */
  display: number;
}

/**
 * Baseline closeness. Long window, asymmetric: only POSITIVE engagement adds
 * to the base. Negative sentiment is captured by `sentimentPerturbation` and
 * `severityPenalty` separately. This matches the user's intuition that "Violet
 * hated me" shouldn't bump closeness more than "Violet gave me a cookie."
 *
 * Components:
 *   - Positive intensity: weighted average of max(0, sentiment - 5.5).
 *     Entries at or below 5.5 contribute 0 to base intensity.
 *   - Frequency: log-scaled count of entries in the last 90 days.
 *   - Depth: % of entries carrying vulnerable / honest / present / supportive tags.
 */
export function baseClosenessFor(
  entries: Entry[],
  asOfTime: number = Date.now()
): number {
  const valid = entries.filter((e) => e.createdAt <= asOfTime);
  if (valid.length === 0) return 0;

  let weightedPositive = 0;
  let totalWeight = 0;
  for (const e of valid) {
    const decay = Math.exp(-daysAgo(e.createdAt, asOfTime) / HALF_LIFE_DAYS);
    // Asymmetric: only positive emotion adds to base. Negative is handled
    // by perturbation + severity, not by the long-window base.
    const positiveValence = Math.max(0, e.sentiment - INTENSITY_PIVOT);
    weightedPositive += positiveValence * decay;
    totalWeight += decay;
  }
  const positiveScore = totalWeight > 0 ? weightedPositive / totalWeight : 0;
  const positiveNorm = Math.min(positiveScore / MAX_POSITIVE_INTENSITY, 1);

  const recentCount = valid.filter(
    (e) => daysAgo(e.createdAt, asOfTime) <= RECENT_WINDOW_DAYS
  ).length;
  const freqNorm = Math.log(1 + recentCount) / Math.log(FREQ_SATURATION);

  const depthEntries = valid.filter(
    (e) => e.tags && e.tags.some((t) => DEPTH_TAGS.includes(t))
  );
  const depthNorm = depthEntries.length / valid.length;

  // Frequency-dominant; positive-engagement intensity contributes meaningfully
  // but isn't the lead. Depth provides a small kicker for vulnerable/honest
  // relationships.
  const composite = positiveNorm * 0.3 + freqNorm * 0.55 + depthNorm * 0.15;
  return clamp(composite * 10, 0, 10);
}

/**
 * Sum of severity² × scale × recency-decay across all entries. Returns a
 * non-positive number (0 if no harmful entries). Capped at SEVERITY_PENALTY_CAP
 * so a single severe event can't entirely zero the score; only repeated harm
 * tanks it. Recency-decayed so old severe events fade as positive entries
 * accumulate (people reconcile).
 */
export function severityPenaltyFor(
  entries: Entry[],
  asOfTime: number = Date.now()
): number {
  let raw = 0;
  for (const e of entries) {
    if (e.createdAt > asOfTime) continue;
    const severity = e.severity ?? 0;
    if (severity === 0) continue;
    const decay = Math.exp(-daysAgo(e.createdAt, asOfTime) / HALF_LIFE_DAYS);
    raw += severity * severity * SEVERITY_PENALTY_SCALE * decay;
  }
  return Math.max(-raw, SEVERITY_PENALTY_CAP);
}

/**
 * True if any severity-3 entry exists within the lookback window. Used to
 * apply a hard display ceiling so the rating doesn't lie about how bad things
 * are right now.
 */
export function hasRecentSevere(
  entries: Entry[],
  asOfTime: number = Date.now()
): boolean {
  const cutoff = asOfTime - SEVERE_CEILING_LOOKBACK_DAYS * DAY_MS;
  return entries.some(
    (e) =>
      e.createdAt >= cutoff &&
      e.createdAt <= asOfTime &&
      (e.severity ?? 0) >= SEVERE_CEILING_LEVEL
  );
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
  const severityPenalty = severityPenaltyFor(entries, asOfTime);
  let display = clamp(base + perturbation + severityPenalty, 0, 10);
  // Hard ceiling when a severity-3 event happened recently — the rating
  // should not lie about how bad things are right now.
  if (hasRecentSevere(entries, asOfTime)) {
    display = Math.min(display, SEVERE_CEILING_VALUE);
  }
  return { base, perturbation, severityPenalty, display };
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
