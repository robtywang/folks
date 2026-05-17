'use client';

interface PinKeypadProps {
  value: string;
  onChange: (next: string) => void;
  length?: number;
}

/**
 * On-screen 3×4 numeric keypad for setting / confirming a passcode during
 * onboarding. Italic Fraunces digits, no borders or button chrome — tappable
 * type only. Backspace icon (ti-backspace) in the bottom-right; bottom-left
 * cell intentionally blank to match the standard iOS lock-screen layout.
 *
 * Controlled component: pass `value` (the current digit string) and
 * `onChange` (called with the next string when a digit or backspace is
 * tapped). Caller decides when 4 digits is "complete" + what to do.
 */
export function PinKeypad({ value, onChange, length = 4 }: PinKeypadProps) {
  function appendDigit(d: string) {
    if (value.length >= length) return;
    onChange(value + d);
  }
  function backspace() {
    if (value.length === 0) return;
    onChange(value.slice(0, -1));
  }

  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: 'repeat(3, 1fr)',
        rowGap: 8,
        columnGap: 0,
        maxWidth: 280,
        marginLeft: 'auto',
        marginRight: 'auto',
        width: '100%',
      }}
      role="group"
      aria-label="Passcode keypad"
    >
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
        <KeypadCell key={d} onPress={() => appendDigit(d)} ariaLabel={d}>
          {d}
        </KeypadCell>
      ))}
      {/* Bottom row: blank · 0 · backspace */}
      <KeypadCell disabled>{''}</KeypadCell>
      <KeypadCell onPress={() => appendDigit('0')} ariaLabel="0">
        0
      </KeypadCell>
      <KeypadCell onPress={backspace} ariaLabel="Backspace">
        <i
          className="ti ti-backspace"
          style={{ fontSize: 22, color: 'var(--ink-tertiary)' }}
        />
      </KeypadCell>
    </div>
  );
}

function KeypadCell({
  children,
  onPress,
  disabled = false,
  ariaLabel,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-label={ariaLabel}
      className="italic active:opacity-60 transition-opacity"
      style={{
        background: 'transparent',
        border: 'none',
        padding: '14px 0',
        fontFamily: 'var(--font-fraunces)',
        fontSize: 24,
        color: disabled ? 'transparent' : 'var(--ink-primary)',
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 52,
      }}
    >
      {children}
    </button>
  );
}
