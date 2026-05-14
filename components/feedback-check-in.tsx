'use client';

import { useState } from 'react';

interface FeedbackCheckInProps {
  /** Initial value — usually the AI's parsed sentiment for this entry. */
  initial: number;
  /** Fires when the user commits a value. Parent persists & recomputes closeness. */
  onConfirm: (value: number) => void;
  /** Fires when the user dismisses without confirming. */
  onDismiss?: () => void;
}

/**
 * Inline self-check that surfaces when an entry looks emotionally charged.
 * Frowny → smiley slider lets the user correct the AI's sentiment read. The
 * confirmed value overrides AI's number and is captured as a correction signal
 * (aiPredictedSentiment vs entry.sentiment) so future parses can calibrate.
 */
export function FeedbackCheckIn({ initial, onConfirm, onDismiss }: FeedbackCheckInProps) {
  const [value, setValue] = useState(initial);

  // Track-color hint at the endpoints — coral → sage gradient implied by the icons.
  const trackBgFrom = 'rgba(200, 85, 61, 0.18)';
  const trackBgTo = 'rgba(111, 125, 99, 0.18)';

  return (
    <div
      className="mt-3 rounded-md px-3 py-3"
      style={{
        background: 'rgba(140, 126, 92, 0.06)',
        border: '0.5px solid var(--border-hair)',
        borderLeft: '2px solid var(--accent-coral)',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className="text-[10px] uppercase tracking-widest text-ink-secondary"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          how did this make you feel?
        </span>
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss check-in"
            className="text-ink-tertiary transition-colors hover:text-ink-primary"
          >
            <i className="ti ti-x" style={{ fontSize: 12 }} />
          </button>
        )}
      </div>

      <p
        className="mt-1 text-[12px] italic leading-snug"
        style={{ fontFamily: 'var(--font-fraunces)', color: '#8C7E5C' }}
      >
        helps the ai read you right next time.
      </p>

      <div className="mt-3 flex items-center gap-3">
        <i
          className="ti ti-mood-sad flex-shrink-0"
          style={{ fontSize: 22, color: 'var(--accent-coral)' }}
          aria-hidden="true"
        />
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="folks-feedback-range flex-1"
          style={{
            background: `linear-gradient(to right, ${trackBgFrom} 0%, ${trackBgTo} 100%)`,
          }}
        />
        <i
          className="ti ti-mood-happy flex-shrink-0"
          style={{ fontSize: 22, color: 'var(--accent-sage)' }}
          aria-hidden="true"
        />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span
          className="text-[10px] uppercase tracking-widest text-ink-tertiary"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {value} / 10
        </span>
        <button
          onClick={() => onConfirm(value)}
          className="text-[11px] uppercase tracking-widest text-accent-coral"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          got it →
        </button>
      </div>
    </div>
  );
}
