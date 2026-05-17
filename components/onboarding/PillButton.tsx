'use client';

interface PillButtonProps {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  ariaLabel?: string;
}

/**
 * Coral pill button — matches the chat's "send to journal" pill exactly.
 * 200×46 rounded radius 23, italic 14px Fraunces cream label, coral fill,
 * 0.97 press-scale feedback.
 */
export function PillButton({
  onClick,
  disabled = false,
  children,
  ariaLabel,
}: PillButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="active:scale-[0.97] transition-transform disabled:opacity-50"
      style={{
        width: 200,
        height: 46,
        borderRadius: 23,
        background: 'var(--accent-coral)',
        border: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        className="italic"
        style={{
          fontFamily: 'var(--font-fraunces)',
          fontSize: 14,
          color: 'var(--bg-cream)',
        }}
      >
        {children}
      </span>
    </button>
  );
}
