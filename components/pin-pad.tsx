'use client';

import { useEffect, useRef } from 'react';

interface PinPadProps {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  error?: boolean;
  autoFocus?: boolean;
}

/**
 * iOS-style passcode input. {length} circles that fill as digits are entered,
 * over an invisible numeric input. Clicking anywhere on the label focuses the
 * input (native `<label>` forwarding) and the device's numeric keyboard pops
 * up on mobile.
 */
export function PinPad({
  value,
  onChange,
  length = 4,
  error = false,
  autoFocus = false,
}: PinPadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <label className="relative inline-block cursor-text">
      <input
        ref={inputRef}
        type="tel"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={length}
        value={value}
        onChange={(e) =>
          onChange(e.target.value.replace(/\D/g, '').slice(0, length))
        }
        autoComplete="off"
        aria-label="Passcode"
        className="absolute inset-0 h-full w-full bg-transparent text-transparent focus:outline-none"
        style={{ caretColor: 'transparent' }}
      />
      {/* Visual dots — pointer-events:none so the input underneath gets
          every tap / click. */}
      <div className="pointer-events-none flex items-center gap-4 px-2 py-3">
        {Array.from({ length }, (_, i) => {
          const filled = i < value.length;
          return (
            <span
              key={i}
              className="block h-3 w-3 rounded-full transition-all"
              style={{
                background: filled
                  ? error
                    ? 'var(--trend-down)'
                    : 'var(--accent-coral)'
                  : 'transparent',
                border: `1px solid ${
                  error ? 'var(--trend-down)' : 'var(--border-hair)'
                }`,
              }}
            />
          );
        })}
      </div>
    </label>
  );
}
