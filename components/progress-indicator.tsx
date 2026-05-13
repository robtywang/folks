'use client';

interface ProgressIndicatorProps {
  step: number;
  total?: number;
}

/** "1 — 4" style mono indicator for the onboarding flow. */
export function ProgressIndicator({ step, total = 4 }: ProgressIndicatorProps) {
  return (
    <div
      className="text-center text-[10px] uppercase tracking-widest text-ink-secondary"
      style={{ fontFamily: 'var(--font-mono)' }}
      aria-label={`Step ${step} of ${total}`}
    >
      {step} — {total}
    </div>
  );
}
