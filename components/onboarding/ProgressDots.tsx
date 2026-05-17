'use client';

interface ProgressDotsProps {
  active: number; // 1-indexed
  total?: number;
}

/**
 * 6-dot progress indicator for the onboarding flow. Active dot fills coral,
 * inactive dots are hairline-bordered. Matches the spec's 6px circles + 8px
 * gap design.
 */
export function ProgressDots({ active, total = 6 }: ProgressDotsProps) {
  return (
    <div
      className="flex items-center"
      style={{ gap: 8 }}
      role="progressbar"
      aria-valuenow={active}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-label={`Step ${active} of ${total}`}
    >
      {Array.from({ length: total }, (_, i) => {
        const isActive = i === active - 1;
        return (
          <span
            key={i}
            className="block rounded-full transition-colors"
            style={{
              width: 6,
              height: 6,
              background: isActive ? 'var(--accent-coral)' : 'var(--border-hair)',
            }}
          />
        );
      })}
    </div>
  );
}
