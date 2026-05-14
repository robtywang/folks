'use client';

import type { SentimentBucket } from '@/lib/closeness';

interface SentimentTrendProps {
  buckets: SentimentBucket[];
  lifetimeAvg: number | null;
  recentAvg: number | null;
  delta: number | null;
}

/**
 * 12-week sentiment trend mini-chart. Shows only weeks with entries; gaps in
 * the line where the user didn't write about this person. Reference line at
 * sentiment 5.5 (neutral) lets the eye instantly see warmer-than-neutral or
 * cooler-than-neutral. Delta caption summarises the last 4 weeks vs the
 * previous 4 — stable enough to ignore a single quiet week.
 */
export function SentimentTrend({
  buckets,
  lifetimeAvg,
  recentAvg,
  delta,
}: SentimentTrendProps) {
  const filled = buckets
    .map((b, i) => (b.avg !== null ? { x: i, y: b.avg as number } : null))
    .filter((p): p is { x: number; y: number } => p !== null);

  if (filled.length < 1 || lifetimeAvg === null) {
    return (
      <div>
        <div
          className="mb-2 text-[10px] uppercase tracking-widest text-ink-secondary"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          sentiment trend
        </div>
        <p
          className="text-[12px] italic text-ink-tertiary"
          style={{ fontFamily: 'var(--font-fraunces)' }}
        >
          not enough entries yet.
        </p>
      </div>
    );
  }

  const W = 100;
  const H = 36;
  const PAD_X = 1;
  const PAD_Y = 2;
  const totalWeeks = buckets.length;

  const pointAt = (x: number, y: number) => {
    const px =
      totalWeeks <= 1
        ? W / 2
        : (x / (totalWeeks - 1)) * (W - PAD_X * 2) + PAD_X;
    // sentiment 1..10 → top..bottom flipped (10 at top)
    const py = H - PAD_Y - ((y - 1) / 9) * (H - PAD_Y * 2);
    return { x: px, y: py };
  };

  // Group consecutive filled points into segments so gaps don't get drawn as
  // straight lines across missing weeks.
  const segments: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  let lastX = -2;
  for (const p of filled) {
    const xy = pointAt(p.x, p.y);
    if (p.x === lastX + 1 || current.length === 0) {
      current.push(xy);
    } else {
      if (current.length > 0) segments.push(current);
      current = [xy];
    }
    lastX = p.x;
  }
  if (current.length > 0) segments.push(current);

  const refY = pointAt(0, 5.5).y;

  // Delta color + glyph.
  const deltaColor =
    delta === null
      ? 'var(--ink-tertiary)'
      : delta >= 0.3
        ? 'var(--accent-sage)'
        : delta <= -0.3
          ? 'var(--accent-coral)'
          : 'var(--ink-tertiary)';
  const deltaGlyph =
    delta === null
      ? '·'
      : delta >= 0.3
        ? '↑'
        : delta <= -0.3
          ? '↓'
          : '→';
  const deltaText =
    delta === null
      ? 'building baseline'
      : `${deltaGlyph} ${Math.abs(delta).toFixed(1)} vs prior 4 weeks`;

  return (
    <div>
      <div
        className="mb-2 text-[10px] uppercase tracking-widest text-ink-secondary"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        sentiment trend
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H * 2}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {/* Neutral reference (5.5) */}
        <line
          x1={0}
          y1={refY}
          x2={W}
          y2={refY}
          stroke="var(--ink-tertiary)"
          strokeWidth={0.3}
          strokeDasharray="1.2 1.6"
          opacity={0.55}
          vectorEffect="non-scaling-stroke"
        />

        {/* Sentiment line segments */}
        {segments.map((seg, i) => (
          <polyline
            key={i}
            points={seg.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="var(--ink-primary)"
            strokeWidth={0.9}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Dots so single-point weeks are visible */}
        {filled.map((p, i) => {
          const xy = pointAt(p.x, p.y);
          return (
            <circle
              key={i}
              cx={xy.x}
              cy={xy.y}
              r={0.9}
              fill="var(--ink-primary)"
            />
          );
        })}
      </svg>

      <div
        className="mt-2 flex items-center justify-between text-[11px]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        <span className="text-ink-secondary">
          avg {(recentAvg ?? lifetimeAvg).toFixed(1)}
        </span>
        <span style={{ color: deltaColor }}>{deltaText}</span>
      </div>
    </div>
  );
}
