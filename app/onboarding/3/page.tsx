'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setLockPin } from '@/lib/lock';
import { setMeta } from '@/lib/db';
import { PinPad } from '@/components/pin-pad';
import { ProgressIndicator } from '@/components/progress-indicator';

type SubStep = '3a' | '3b' | '3c' | '3d' | '3e';

export default function OnboardingStep3() {
  const router = useRouter();
  const [step, setStep] = useState<SubStep>('3a');
  const [pinFirst, setPinFirst] = useState('');
  const [pinSecond, setPinSecond] = useState('');
  const [hint, setHint] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [saving, setSaving] = useState(false);

  // Advance from 3b → 3c when first pin reaches 4 digits.
  useEffect(() => {
    if (step === '3b' && pinFirst.length === 4) {
      setStep('3c');
      setError(null);
    }
  }, [step, pinFirst]);

  // On 3c, when second pin reaches 4 digits: match → save → 3d, mismatch → shake.
  useEffect(() => {
    if (step !== '3c' || pinSecond.length !== 4) return;
    let cancelled = false;

    (async () => {
      if (pinSecond !== pinFirst) {
        setError("didn't match. try again.");
        setShake(true);
        window.setTimeout(() => {
          if (cancelled) return;
          setPinSecond('');
          setShake(false);
        }, 320);
        return;
      }
      setSaving(true);
      try {
        // Hash + store via existing util (PBKDF2 via Web Crypto, 100k iter).
        await setLockPin(pinFirst);
        if (cancelled) return;
        setStep('3d');
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'failed');
        }
      } finally {
        if (!cancelled) setSaving(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [step, pinSecond, pinFirst]);

  // 3e auto-advances after 1.2s to the welcome / start-writing screen.
  // The first-folk session flag is set there (when user taps "start writing").
  useEffect(() => {
    if (step !== '3e') return;
    const t = window.setTimeout(() => {
      router.push('/onboarding/4');
    }, 1200);
    return () => window.clearTimeout(t);
  }, [step, router]);

  // Clear error when user types again.
  useEffect(() => {
    if (error && (pinFirst.length > 0 || pinSecond.length > 0)) {
      setError(null);
    }
  }, [pinFirst, pinSecond, error]);

  function backFromStep(s: SubStep) {
    switch (s) {
      case '3a':
        router.push('/onboarding/2');
        break;
      case '3b':
        setPinFirst('');
        setError(null);
        setStep('3a');
        break;
      case '3c':
        setPinFirst('');
        setPinSecond('');
        setError(null);
        setStep('3b');
        break;
      // 3d / 3e have no back per spec
    }
  }

  async function saveHintAndAdvance() {
    setSaving(true);
    try {
      // Save hint via the lock module (uses localStorage; PIN already stored).
      const { setHint: setHintFn } = await import('@/lib/lock');
      setHintFn(hint);
      setStep('3e');
    } finally {
      setSaving(false);
    }
  }

  function skipHint() {
    setStep('3e');
  }

  const showBack = step === '3a' || step === '3b' || step === '3c';

  return (
    <main className="mx-auto flex h-[100svh] w-full max-w-md flex-col overflow-hidden px-6 pt-6">
      <header className="flex items-center" style={{ minHeight: '24px' }}>
        {showBack && (
          <button
            onClick={() => backFromStep(step)}
            className="text-[11px] uppercase tracking-widest text-ink-secondary transition-colors hover:text-ink-primary"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            back
          </button>
        )}
      </header>

      {step === '3a' && <StepFraming onAdvance={() => setStep('3b')} />}
      {step === '3b' && (
        <StepEnter
          value={pinFirst}
          onChange={setPinFirst}
        />
      )}
      {step === '3c' && (
        <StepConfirm
          value={pinSecond}
          onChange={setPinSecond}
          error={error}
          shake={shake}
          saving={saving}
        />
      )}
      {step === '3d' && (
        <StepHint
          hint={hint}
          setHint={setHint}
          onSave={saveHintAndAdvance}
          onSkip={skipHint}
          saving={saving}
        />
      )}
      {step === '3e' && <StepConfirmation />}

      {step !== '3e' && (
        <div className="pb-10 pt-6">
          <ProgressIndicator step={3} />
        </div>
      )}
    </main>
  );
}

function StepFraming({ onAdvance }: { onAdvance: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-7 text-center">
      <h1
        className="italic leading-tight text-ink-primary"
        style={{ fontFamily: 'var(--font-fraunces)', fontSize: '36px' }}
      >
        yours, only.
      </h1>
      <div
        className="flex max-w-[320px] flex-col gap-4 leading-snug"
        style={{ fontFamily: 'var(--font-fraunces)' }}
      >
        <p
          className="italic text-ink-primary"
          style={{ fontSize: '17px' }}
        >
          every entry, every name, every score —
          <br />
          stored on this device and nowhere else.
        </p>
        <p
          className="italic"
          style={{ fontSize: '14px', color: '#8C7E5C' }}
        >
          no account, no cloud, no one else can see them.
          set a 4-digit code to lock your circle.
        </p>
      </div>
      <p
        className="italic"
        style={{
          maxWidth: 320,
          fontFamily: 'var(--font-fraunces)',
          fontSize: 16,
          lineHeight: 1.45,
          color: 'var(--ink-secondary)',
        }}
      >
        your folks list takes shape after about a week. write a sentence a
        night — that's all it takes.
      </p>
      <button
        onClick={onAdvance}
        className="text-[16px] text-accent-coral"
        style={{ fontFamily: 'var(--font-fraunces)' }}
      >
        set passcode
      </button>
    </div>
  );
}

function StepEnter({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <div
        className="text-[10px] uppercase tracking-widest text-ink-secondary"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        enter a passcode
      </div>
      <PinPad value={value} onChange={onChange} length={4} autoFocus />
      <p
        className="max-w-[280px] text-[14px] italic leading-snug"
        style={{ fontFamily: 'var(--font-fraunces)', color: '#8C7E5C' }}
      >
        4 digits. you'll need this to open your circle, entries, and journal.
      </p>
      <p
        className="max-w-[280px] text-[13px] italic leading-snug"
        style={{ fontFamily: 'var(--font-fraunces)', color: '#8C7E5C' }}
      >
        your passcode can't be recovered. write it down somewhere.
      </p>
    </div>
  );
}

function StepConfirm({
  value,
  onChange,
  error,
  shake,
  saving,
}: {
  value: string;
  onChange: (v: string) => void;
  error: string | null;
  shake: boolean;
  saving: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <div
        className="text-[10px] uppercase tracking-widest text-ink-secondary"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        re-enter to confirm
      </div>
      <div className={shake ? 'pin-shake' : ''}>
        <PinPad
          value={value}
          onChange={onChange}
          length={4}
          error={!!error}
          autoFocus
        />
      </div>
      {error && (
        <p
          className="text-[12px] italic"
          style={{ fontFamily: 'var(--font-fraunces)', color: '#8C7E5C' }}
        >
          {error}
        </p>
      )}
      {saving && (
        <p
          className="text-[11px] italic"
          style={{ fontFamily: 'var(--font-fraunces)', color: '#8C7E5C' }}
        >
          saving…
        </p>
      )}
    </div>
  );
}

function StepHint({
  hint,
  setHint,
  onSave,
  onSkip,
  saving,
}: {
  hint: string;
  setHint: (v: string) => void;
  onSave: () => void;
  onSkip: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <div
        className="text-[10px] uppercase tracking-widest text-ink-secondary"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        hint (optional)
      </div>
      <p
        className="max-w-[300px] text-[14px] italic leading-snug"
        style={{ fontFamily: 'var(--font-fraunces)', color: '#8C7E5C' }}
      >
        a private reminder, shown after 3 failed unlock attempts. don't put
        your passcode here.
      </p>
      <input
        value={hint}
        onChange={(e) => setHint(e.target.value.slice(0, 60))}
        maxLength={60}
        placeholder="e.g. dog's birthday + reverse"
        className="w-full max-w-[280px] bg-transparent text-center text-[14px] italic text-ink-primary placeholder:text-ink-tertiary focus:outline-none"
        style={{
          fontFamily: 'var(--font-fraunces)',
          borderBottom: '0.5px solid var(--border-hair)',
          paddingBottom: '6px',
        }}
        autoFocus
      />
      <div className="flex items-center gap-6">
        <button
          onClick={onSkip}
          disabled={saving}
          className="text-[14px]"
          style={{ fontFamily: 'var(--font-fraunces)', color: '#8C7E5C' }}
        >
          skip
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="text-[14px] text-accent-coral disabled:opacity-40"
          style={{ fontFamily: 'var(--font-fraunces)' }}
        >
          save
        </button>
      </div>
    </div>
  );
}

function StepConfirmation() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <p
        className="max-w-[320px] italic leading-snug text-ink-primary"
        style={{ fontFamily: 'var(--font-fraunces)', fontSize: '20px' }}
      >
        got it. nothing leaves your device.
      </p>
    </div>
  );
}
