'use client';

interface SentimentSliderProps {
  value: number;
  onChange: (next: number) => void;
}

export function SentimentSlider({ value, onChange }: SentimentSliderProps) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
        const filled = n <= value;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`Set sentiment to ${n}`}
            className="group flex h-5 w-3.5 items-center justify-center"
          >
            <span
              className="block h-2 w-2 rounded-full transition-all group-hover:scale-125"
              style={{
                background: filled
                  ? 'var(--accent-coral)'
                  : 'var(--border-hair)',
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
