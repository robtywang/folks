'use client';

/**
 * Demo compose card for onboarding screen 3. Mimics the actual compose UI:
 * a typed sentence appears character-by-character via a CSS `width` keyframe
 * (no JS timers per spec), with a blinking caret reusing the existing
 * `blink-caret` keyframe from globals.css. Bottom of the card has the same
 * mic-left / coral-send-right affordance as the live chat.
 */
export function TypingDemo() {
  const sentence = 'had coffee with kate. felt weird.';
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

      <div
        className="rounded-md"
        style={{
          border: '0.5px solid var(--border-hair)',
          background: 'rgba(217, 207, 188, 0.18)',
          padding: '14px 16px',
        }}
      >
        {/* Typed sentence + caret. The line clips its own width via the
            keyframe; the caret is appended after and stays at the visible
            edge as the line grows. */}
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

        {/* Hairline + action row */}
        <div
          style={{
            marginTop: 12,
            height: 0.7,
            background: 'var(--border-hair)',
            opacity: 0.55,
          }}
        />
        <div
          className="mt-3 flex items-center justify-between"
          aria-hidden="true"
        >
          <i
            className="ti ti-microphone"
            style={{ fontSize: 18, color: 'var(--ink-tertiary)' }}
          />
          <span
            className="block"
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: 'var(--accent-coral)',
            }}
          />
        </div>
      </div>
    </>
  );
}
