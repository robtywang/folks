'use client';

interface SparklineProps {
  history: number[];
  /** 'up' | 'down' | 'flat' — drives stroke color when `stroke` is unset. */
  direction?: 'up' | 'down' | 'flat';
  /** Explicit CSS color/variable that overrides the direction-based color. */
  stroke?: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
}

/**
 * Inline SVG sparkline. No fill, single hairline stroke, fixed 0–10 vertical
 * scale so different people's lines compare directly. Used in the ratings
 * leaderboard (compact) and the profile trajectory card (wider).
 */
export function Sparkline({
  history,
  direction = 'flat',
  stroke,
  width = 56,
  height = 16,
  strokeWidth = 1.25,
}: SparklineProps) {
  if (history.length < 2) {
    return (
      <span
        aria-hidden="true"
        style={{ display: 'inline-block', width, height }}
      />
    );
  }

  const PAD = 1;
  const points = history
    .map((v, i) => {
      const x = (i / (history.length - 1)) * (width - PAD * 2) + PAD;
      const y = height - PAD - (v / 10) * (height - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const finalStroke =
    stroke ??
    (direction === 'up'
      ? 'var(--trend-up)'
      : direction === 'down'
      ? 'var(--trend-down)'
      : 'var(--ink-tertiary)');

  return (
    <svg
      width={width}
      height={height}
      className="flex-shrink-0"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={finalStroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
