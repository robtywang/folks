'use client';

interface FriendRowProps {
  monogram: string;
  name: string;
  /** Mono caption, e.g. "HEAVY · 10 ENTRIES" */
  caption: string;
  /** CSS animation delay for staggered fade-in. */
  animationDelay?: string;
}

/**
 * Single friend row used in the onboarding screen 4 sample list. Monogram
 * circle + italic name + mono caption row, with a hairline divider below.
 * Reuses the existing `onboarding-fade-in` keyframe (defined in globals.css)
 * so multiple rows can stagger via animationDelay.
 */
export function FriendRow({
  monogram,
  name,
  caption,
  animationDelay = '0ms',
}: FriendRowProps) {
  return (
    <div
      className="onboarding-fade-in"
      style={{
        animationDelay,
        animationFillMode: 'both',
        borderBottom: '0.5px solid var(--border-hair)',
        paddingTop: 12,
        paddingBottom: 12,
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex flex-shrink-0 items-center justify-center"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '0.5px solid var(--border-hair)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-fraunces)',
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--ink-primary)',
            }}
          >
            {monogram}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="italic"
            style={{
              fontFamily: 'var(--font-fraunces)',
              fontSize: 16,
              color: 'var(--ink-primary)',
              lineHeight: 1.2,
            }}
          >
            {name}
          </div>
          <div
            className="mt-0.5"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--ink-tertiary)',
            }}
          >
            {caption}
          </div>
        </div>
      </div>
    </div>
  );
}
