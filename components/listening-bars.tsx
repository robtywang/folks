'use client';

interface ListeningBarsProps {
  /** Visual size of the bars container. Default 30. */
  size?: number;
  /** Bar fill color. Default coral. */
  color?: string;
}

/**
 * Animated audio-meter bars used as the "listening" graphic while the mic
 * is recording. Four bars scale vertically at different speeds and phases
 * via CSS keyframes (transform-origin centered through transform-box: fill-box
 * so the scaling stays anchored on each bar's midpoint).
 *
 * Shared by home + chat. Inline CSS via styled-jsx keeps the keyframes
 * scoped to this component.
 */
export function ListeningBars({
  size = 30,
  color = '#C8553D',
}: ListeningBarsProps) {
  // Layout values scale with `size`. The 30px reference uses 4 bars at
  // x = 5.2 / 10.2 / 15.2 / 20.2, each 1.8 wide, 15 tall.
  const scale = size / 30;
  const barW = 1.8 * scale;
  const barH = 15 * scale;
  const barY = 7.5 * scale;
  const xs = [5.2, 10.2, 15.2, 20.2].map((x) => x * scale);

  return (
    <>
      <style jsx>{`
        @keyframes folks-bar-pulse-a {
          0%, 100% { transform: scaleY(0.35); }
          50% { transform: scaleY(1); }
        }
        @keyframes folks-bar-pulse-b {
          0%, 100% { transform: scaleY(0.55); }
          30% { transform: scaleY(1); }
          70% { transform: scaleY(0.4); }
        }
        @keyframes folks-bar-pulse-c {
          0%, 100% { transform: scaleY(0.5); }
          25% { transform: scaleY(0.95); }
          60% { transform: scaleY(0.3); }
        }
        @keyframes folks-bar-pulse-d {
          0%, 100% { transform: scaleY(0.4); }
          50% { transform: scaleY(0.85); }
        }
        .listening-bar {
          transform-origin: center;
          transform-box: fill-box;
        }
        .listening-bar.a { animation: folks-bar-pulse-a 0.7s ease-in-out infinite; }
        .listening-bar.b { animation: folks-bar-pulse-b 0.55s ease-in-out infinite; }
        .listening-bar.c { animation: folks-bar-pulse-c 0.85s ease-in-out infinite; }
        .listening-bar.d { animation: folks-bar-pulse-d 0.65s ease-in-out infinite; }
      `}</style>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <rect className="listening-bar a" x={xs[0]} y={barY} width={barW} height={barH} rx={barW / 2} fill={color} />
        <rect className="listening-bar b" x={xs[1]} y={barY} width={barW} height={barH} rx={barW / 2} fill={color} />
        <rect className="listening-bar c" x={xs[2]} y={barY} width={barW} height={barH} rx={barW / 2} fill={color} />
        <rect className="listening-bar d" x={xs[3]} y={barY} width={barW} height={barH} rx={barW / 2} fill={color} />
      </svg>
    </>
  );
}
