'use client';

import { useRouter } from 'next/navigation';
import { ProgressIndicator } from '@/components/progress-indicator';

const STEP4_SESSION_KEY = 'folks_onboarding_step_4';

export default function OnboardingStep4() {
  const router = useRouter();

  function startWriting() {
    try {
      sessionStorage.setItem(STEP4_SESSION_KEY, 'true');
    } catch {}
    router.push('/');
  }

  return (
    <main className="relative mx-auto flex h-[100svh] w-full max-w-md flex-col overflow-hidden px-6 pt-6">
      {/* Top spacer ~30% */}
      <div style={{ flex: '0 0 30%' }} aria-hidden="true" />

      <div className="flex flex-col items-center text-center">
        <div
          className="text-[10px] uppercase tracking-widest text-ink-secondary"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          welcome
        </div>
        <h1
          className="mt-3 italic leading-tight text-ink-primary"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: '32px',
          }}
        >
          journal your
          <br />
          thoughts.
        </h1>
        <p
          className="mt-5 max-w-[300px] text-[16px] italic leading-snug"
          style={{
            fontFamily: 'var(--font-fraunces)',
            color: '#8C7E5C',
          }}
        >
          write about anyone, anything. who you saw, what felt warm, what felt
          off. one sentence is enough — folks reads the rest.
        </p>
      </div>

      {/* Bottom-third tappable CTA */}
      <button
        onClick={startWriting}
        className="absolute bottom-0 left-0 right-0 flex flex-col items-center justify-center gap-6"
        style={{ height: '33%' }}
        aria-label="Start writing"
      >
        <span
          className="text-[16px] text-accent-coral"
          style={{ fontFamily: 'var(--font-fraunces)' }}
        >
          start writing →
        </span>
        <ProgressIndicator step={4} />
      </button>
    </main>
  );
}
