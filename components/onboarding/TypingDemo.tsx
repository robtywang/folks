'use client';

/**
 * Demo for onboarding screen 3 — mirrors the actual compose surface used
 * on home + chat (no card chrome, just a textarea-style line on cream
 * background with a hairline below and the mic / send action row beneath).
 *
 * The text appears character-by-character via a CSS `width` keyframe (no
 * JS timers), with a blinking caret reusing the existing `blink-caret`
 * keyframe from globals.css. The action row reuses the real shipped
 * styling: 4-bar mic SVG + "tap to speak" italic label on the left,
 * "send →" mono coral label on the right.
 */
export function TypingDemo() {
  const sentence = 'had coffee with kate. felt weird.';
  const TAN = '#B4A689';
  const CORAL = '#C8553D';
  const INK_MUTED = '#5A5347';

  return (
    <>
      <style jsx>{`
        @keyframes folks-onboarding-type {
          0% {
            width: 0;
          }
          60%,
          100% {
            width: 100%;
          }
        }
        .folks-type-line {
          display: inline-block;
          overflow: hidden;
          white-space: nowrap;
          vertical-align: bottom;
          animation: folks-onboarding-type 3s steps(33, end) infinite;
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
        <span className="folks-type-line">{sentence}</span>
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

      {/* Action row — exact shape of the real shipped one: 4-bar mic +
          "tap to speak" italic on the left, "send →" mono coral on the
          right. Static (this is a demo, no interactions). */}
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
