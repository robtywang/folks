'use client';

import { useEffect, useState } from 'react';

const EXAMPLES = [
  "elon's been weird since the breakup. don't know if he wants space or wants me to ask.",
  'jamie cancelled again. third time this month. wondering if it’s me.',
  "mom called crying about dad. didn’t know what to say.",
  'katherine remembered my interview today. the small stuff is starting to stack up.',
];

const TYPE_MS = 3500;
const HOLD_MS = 1700;
const CYCLE_MS = TYPE_MS + HOLD_MS;

const TAN = '#B4A689';
const CORAL = '#C8553D';
const INK_MUTED = '#5A5347';

/**
 * Demo for onboarding screen 3 — mirrors the actual compose surface used
 * on home + chat (borderless, hairline below, mic + send action row).
 * Cycles through four longer vent examples using sample names (Elon,
 * Jamie, Mom, Katherine). Each example types in (one step per character
 * via a CSS keyframe), holds, then the next example replaces it via a
 * remount-triggered re-animation.
 */
export function TypingDemo() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % EXAMPLES.length);
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, []);

  const sentence = EXAMPLES[idx]!;
  const stepCount = Math.max(20, sentence.length);
  const typeDuration = TYPE_MS / 1000;

  return (
    <>
      <style jsx>{`
        @keyframes folks-onboarding-type {
          0% {
            width: 0;
          }
          100% {
            width: 100%;
          }
        }
        .folks-type-line {
          display: inline-block;
          overflow: hidden;
          white-space: nowrap;
          vertical-align: bottom;
          max-width: 100%;
        }
      `}</style>

      {/* Typing line — borderless, like the actual compose textarea. */}
      <div
        className="italic"
        style={{
          fontFamily: 'var(--font-fraunces)',
          fontSize: 16,
          color: 'var(--ink-primary)',
          lineHeight: 1.55,
          display: 'flex',
          alignItems: 'center',
          minHeight: 24,
        }}
      >
        {/* key={idx} forces remount so the typing animation restarts on
            each example. animation runs once (forwards fill) per example. */}
        <span
          key={idx}
          className="folks-type-line"
          style={{
            animation: `folks-onboarding-type ${typeDuration}s steps(${stepCount}, end) forwards`,
          }}
        >
          {sentence}
        </span>
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 1.5,
            height: '0.95em',
            background: 'var(--ink-primary)',
            marginLeft: 2,
            animation: 'blink-caret 1.05s steps(1) infinite',
          }}
        />
      </div>

      {/* Hairline under the writing line — matches the real home/chat. */}
      <div
        style={{
          marginTop: 12,
          height: 0.7,
          background: TAN,
          opacity: 0.55,
        }}
      />

      {/* Action row — mirrors the shipped one: 4-bar mic + "tap to speak"
          on the left, "send →" mono coral on the right. */}
      <div
        className="mt-3 flex items-center justify-between"
        style={{ gap: 18 }}
        aria-hidden="true"
      >
        <div className="flex items-center" style={{ gap: 10 }}>
          <svg width="26" height="26" viewBox="0 0 26 26">
            <rect x={12.2} y={9} width="1.6" height="8" rx="0.8" fill={TAN} />
            <rect x={12.2 - 4.5} y={6.5} width="1.6" height="13" rx="0.8" fill={TAN} />
            <rect x={12.2 + 4.5} y={6.5} width="1.6" height="13" rx="0.8" fill={TAN} />
            <rect x={12.2 + 9} y={9} width="1.6" height="8" rx="0.8" fill={TAN} />
          </svg>
          <span
            className="italic"
            style={{
              fontFamily: 'var(--font-fraunces)',
              fontSize: 12,
              color: INK_MUTED,
              lineHeight: 1,
            }}
          >
            tap to speak
          </span>
        </div>
        <span
          className="uppercase"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            fontWeight: 500,
            color: CORAL,
            letterSpacing: '0.12em',
          }}
        >
          send →
        </span>
      </div>
    </>
  );
}
