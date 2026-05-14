'use client';

/**
 * Looping mini-demo of the core folks loop:
 *   compose → attribute → rank update
 *
 * CSS-driven (no video, no JS animation library). All timing lives in
 * onboarding-demo.css keyframes; this component is just the markup. The whole
 * thing is one 9-second loop, infinite.
 */
export function OnboardingDemo() {
  return (
    <div className="folks-demo" aria-hidden="true">
      {/* ─── Compose mock ─────────────────────────────────────────── */}
      <div className="folks-demo-card folks-demo-compose">
        <div className="folks-demo-typed">
          long catch-up with{' '}
          <span className="folks-demo-typed-emphasis">maya</span>, felt really
          seen
          <span className="folks-demo-caret" />
        </div>
        <div className="folks-demo-hairline" />
        <div className="folks-demo-row-spread">
          <span className="folks-demo-save">save →</span>
          <span className="folks-demo-mic" aria-hidden="true">
            <i className="ti ti-microphone" />
          </span>
        </div>
      </div>

      {/* ─── Attribution chip ────────────────────────────────────── */}
      <div className="folks-demo-chip">
        <span className="folks-demo-chip-label">logged to</span>{' '}
        <em className="folks-demo-chip-name">maya</em>
      </div>

      {/* ─── Mini ratings list ───────────────────────────────────── */}
      <div className="folks-demo-card folks-demo-ratings">
        <div className="folks-demo-ratings-label">your circle</div>

        <div className="folks-demo-rank folks-demo-rank-1">
          <span className="folks-demo-rank-num">01</span>
          <span className="folks-demo-rank-name">sarah</span>
          <span className="folks-demo-rank-score">7.2</span>
        </div>

        {/* Maya row — animates from row 3 to row 2, score ticks up */}
        <div className="folks-demo-rank folks-demo-rank-maya">
          <span className="folks-demo-rank-num">
            <span className="folks-demo-rank-num-before">03</span>
            <span className="folks-demo-rank-num-after">02</span>
          </span>
          <span className="folks-demo-rank-name">maya</span>
          <span className="folks-demo-rank-score">
            <span className="folks-demo-score-before">5.2</span>
            <span className="folks-demo-score-after">6.4</span>
          </span>
          <span className="folks-demo-rank-arrow">↑</span>
        </div>

        {/* Alex — gets shifted down when maya rises. Starts at 5.5 so the
            initial ranking is internally consistent (sarah 7.2 > alex 5.5 >
            maya 5.2), then maya overtakes him at 6.4. */}
        <div className="folks-demo-rank folks-demo-rank-alex">
          <span className="folks-demo-rank-num">
            <span className="folks-demo-rank-num-before">02</span>
            <span className="folks-demo-rank-num-after">03</span>
          </span>
          <span className="folks-demo-rank-name">alex</span>
          <span className="folks-demo-rank-score">5.5</span>
        </div>
      </div>
    </div>
  );
}
