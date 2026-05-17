'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { setLockPin } from '@/lib/lock';
import { setMeta } from '@/lib/db';
import { ProgressDots } from '@/components/onboarding/ProgressDots';
import { PinKeypad } from '@/components/onboarding/PinKeypad';

type Phase = 'enter' | 'confirm';

export default function OnboardingStep6() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('enter');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const [saving, setSaving] = useState(false);

  // Step 1 → step 2 when 4 digits entered.
  useEffect(() => {
    if (phase !== 'enter') return;
    if (pin.length !== 4) return;
    // Small delay so the user sees the fourth dot fill before the prompt
    // text changes.
    const t = setTimeout(() => {
      setPhase('confirm');
      setError(false);
    }, 150);
    return () => clearTimeout(t);
  }, [pin, phase]);

  // Step 2 → save or mismatch shake.
  useEffect(() => {
    if (phase !== 'confirm') return;
    if (confirmPin.length !== 4) return;
    if (confirmPin !== pin) {
      setError(true);
      setShake(true);
      const t = setTimeout(() => {
        setShake(false);
        setConfirmPin('');
        setPin('');
        setPhase('enter');
        setError(false);
      }, 320);
      return () => clearTimeout(t);
    }
    // Match — save + complete onboarding + go home.
    setSaving(true);
    (async () => {
      try {
        await setLockPin(pin);
        await setMeta('hasCompletedOnboarding', true);
        router.replace('/');
      } catch (err) {
        console.error('passcode save failed:', err);
        setSaving(false);
        setError(true);
        setShake(true);
        setTimeout(() => {
          setShake(false);
          setConfirmPin('');
          setPin('');
          setPhase('enter');
          setError(false);
        }, 320);
      }
    })();
  }, [confirmPin, pin, phase, router]);

  const value = phase === 'enter' ? pin : confirmPin;
  const setValue = phase === 'enter' ? setPin : setConfirmPin;

  const headline =
    phase === 'enter' ? 'set a 4-digit passcode.' : 'confirm your passcode.';
  const subline =
    'the only thing standing between your journal and the world.';

  return (
    <main className="relative mx-auto flex h-[100svh] w-full max-w-md flex-col px-6 pt-6">
      <header className="flex items-center">
        <Link
          href="/onboarding/5"
          aria-label="Back"
          className="text-ink-secondary transition-colors hover:text-ink-primary"
        >
          <i className="ti ti-arrow-left" style={{ fontSize: 18 }} />
        </Link>
      </header>

      <div className="mt-10 flex flex-col items-center text-center">
        <span
          className="uppercase"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.18em',
            color: 'var(--ink-secondary)',
          }}
        >
          YOUR PASSCODE
        </span>
        <h1
          className="mt-3 italic text-ink-primary"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: 26,
            lineHeight: 1.2,
            maxWidth: 320,
          }}
        >
          {headline}
        </h1>
        <p
          className="mt-4 italic"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: 14,
            lineHeight: 1.45,
            color: 'var(--ink-secondary)',
            maxWidth: 300,
          }}
        >
          {subline}
        </p>
      </div>

      {/* 4 passcode dots */}
      <div
        className={`mt-8 flex items-center justify-center ${shake ? 'pin-shake' : ''}`}
        style={{ gap: 16 }}
      >
        {Array.from({ length: 4 }, (_, i) => {
          const filled = i < value.length;
          return (
            <span
              key={i}
              className="block rounded-full transition-all"
              style={{
                width: 14,
                height: 14,
                background: filled
                  ? error
                    ? 'var(--trend-down)'
                    : 'var(--ink-primary)'
                  : 'transparent',
                border: `1px solid ${
                  error ? 'var(--trend-down)' : 'var(--ink-primary)'
                }`,
              }}
            />
          );
        })}
      </div>

      {/* Keypad */}
      <div className="mt-8 flex-1">
        <PinKeypad value={value} onChange={setValue} length={4} />
      </div>

      <div className="flex flex-col items-center gap-6 pb-12">
        <ProgressDots active={6} />
        {saving && (
          <span
            className="uppercase"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.18em',
              color: 'var(--ink-tertiary)',
            }}
          >
            saving…
          </span>
        )}
      </div>
    </main>
  );
}
