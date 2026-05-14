'use client';

import { useEffect, useRef, useState } from 'react';
import { verifyPin, setUnlocked, getHint } from '@/lib/lock';
import { wipeEverything } from '@/lib/save-entry';
import { PinPad } from './pin-pad';

interface LockScreenProps {
  title?: string;
  onUnlock: () => void;
}

export function LockScreen({
  title = 'this section is locked',
  onUnlock,
}: LockScreenProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [hint, setHintValue] = useState<string | null>(null);

  // Refs instead of state — these must NOT trigger re-renders.
  // `verifying` prevents concurrent re-entries.
  // `onUnlockRef` shields against the parent re-creating onUnlock on every render.
  const verifying = useRef(false);
  const onUnlockRef = useRef(onUnlock);
  useEffect(() => {
    onUnlockRef.current = onUnlock;
  }, [onUnlock]);

  useEffect(() => {
    setHintValue(getHint());
  }, []);

  // Auto-verify once 4 digits are entered. Depends ONLY on `pin` — anything
  // else in the deps array could re-fire the effect mid-verify and cancel the
  // in-flight result before it gets applied.
  useEffect(() => {
    if (pin.length !== 4) return;
    if (verifying.current) return;
    verifying.current = true;
    let cancelled = false;

    (async () => {
      try {
        const ok = await verifyPin(pin);
        if (cancelled) return;
        if (ok) {
          setUnlocked();
          onUnlockRef.current();
        } else {
          setError(true);
          setAttempts((a) => a + 1);
          window.setTimeout(() => {
            if (cancelled) return;
            setPin('');
            setError(false);
          }, 600);
        }
      } finally {
        verifying.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pin]);

  async function handleWipe() {
    setWiping(true);
    try {
      await wipeEverything();
      // Hard reload — clears in-memory state and lands the user on a fresh
      // first-run experience (will redirect to onboarding).
      window.location.replace('/');
    } catch (err) {
      console.error('Wipe failed:', err);
      setWiping(false);
    }
  }

  const showHint = attempts >= 3 && hint && hint.length > 0;
  // Always show the forgot path. folks is local-only — there's no server
  // recovery, so hiding the only escape hatch just leaves users stuck. The
  // wipe still requires a separate confirmation screen so accidental taps
  // are caught.
  const showForgot = true;

  // Confirmation overlay state — replaces the lock UI when active.
  if (confirmWipe) {
    return (
      <main className="mx-auto flex h-[100svh] w-full max-w-md flex-col items-center justify-center overflow-hidden px-6 pb-20">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full"
          style={{
            background: 'rgba(200, 85, 61, 0.08)',
            border: '0.5px solid var(--accent-coral)',
          }}
        >
          <i
            className="ti ti-trash"
            style={{ fontSize: 22, color: 'var(--accent-coral)' }}
            aria-hidden="true"
          />
        </div>
        <h1
          className="mt-5 text-center text-[20px] italic leading-snug text-ink-primary"
          style={{ fontFamily: 'var(--font-fraunces)' }}
        >
          forgot your passcode?
        </h1>
        <p
          className="mt-3 max-w-[280px] text-center text-[13px] italic leading-snug"
          style={{
            fontFamily: 'var(--font-fraunces)',
            color: '#8C7E5C',
          }}
        >
          your data lives only on this device. there's no way to recover the
          passcode — but you can wipe everything and start fresh.
        </p>
        <p
          className="mt-2 max-w-[280px] text-center text-[12px] italic leading-snug"
          style={{
            fontFamily: 'var(--font-fraunces)',
            color: '#8C7E5C',
          }}
        >
          this erases all entries, people, and your passcode. cannot be undone.
        </p>
        <div className="mt-6 flex items-center gap-5">
          <button
            onClick={() => setConfirmWipe(false)}
            disabled={wiping}
            className="text-[11px] uppercase tracking-widest text-ink-secondary"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            cancel
          </button>
          <button
            onClick={handleWipe}
            disabled={wiping}
            className="rounded-full px-5 py-2 text-[12px] uppercase tracking-widest text-white disabled:opacity-40"
            style={{
              background: 'var(--accent-coral)',
              fontFamily: 'var(--font-mono)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.2), 0 4px 12px rgba(200, 85, 61, 0.25)',
            }}
          >
            {wiping ? 'erasing…' : 'erase everything'}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex h-[100svh] w-full max-w-md flex-col items-center justify-center overflow-hidden px-6 pb-24">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{
          background: 'rgba(140, 126, 92, 0.08)',
          border: '0.5px solid var(--border-hair)',
        }}
      >
        <i
          className="ti ti-lock text-ink-primary"
          style={{ fontSize: 22 }}
          aria-hidden="true"
        />
      </div>

      <h1
        className="mt-5 text-center text-[22px] italic leading-snug text-ink-primary"
        style={{ fontFamily: 'var(--font-fraunces)' }}
      >
        {title}
      </h1>
      <p
        className="mt-2 text-center text-[12px] uppercase tracking-widest text-ink-tertiary"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        enter your 4-digit passcode
      </p>

      <div className={`mt-8 ${error ? 'pin-shake' : ''}`}>
        <PinPad value={pin} onChange={setPin} length={4} error={error} autoFocus />
      </div>

      {error && (
        <div
          className="mt-3 text-[12px] italic"
          style={{ fontFamily: 'var(--font-fraunces)', color: '#8C7E5C' }}
        >
          wrong passcode
        </div>
      )}

      {showHint && (
        <p
          className="mt-4 max-w-[280px] text-center text-[12px] italic leading-snug"
          style={{ fontFamily: 'var(--font-fraunces)', color: '#8C7E5C' }}
        >
          hint: {hint}
        </p>
      )}

      {showForgot && (
        <button
          onClick={() => setConfirmWipe(true)}
          className="mt-8 text-center text-[12px] italic leading-snug transition-opacity hover:opacity-70"
          style={{ fontFamily: 'var(--font-fraunces)', color: '#8C7E5C' }}
        >
          forgot passcode?
        </button>
      )}
    </main>
  );
}
