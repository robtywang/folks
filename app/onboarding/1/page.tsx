'use client';

import { useRouter } from 'next/navigation';
import { ProgressIndicator } from '@/components/progress-indicator';

export default function OnboardingStep1() {
  const router = useRouter();

  return (
    <main className="relative mx-auto flex h-[100svh] w-full max-w-md flex-col overflow-hidden px-6 pt-6">
      {/* Top spacer */}
      <div style={{ flex: '0 0 22%' }} aria-hidden="true" />

      {/* The hook — atmospheric italic copy, no wordmark yet */}
      <div className="flex flex-col items-center text-center">
        <p
          className="italic leading-tight text-ink-primary"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: '32px',
            lineHeight: 1.18,
            maxWidth: 320,
          }}
        >
          your 1am thoughts.
        </p>
        <p
          className="mt-5 italic leading-snug"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: '17px',
            lineHeight: 1.45,
            color: '#5A5347',
            maxWidth: 280,
          }}
        >
          the things you&apos;d say at 1am — written down.
        </p>
      </div>

      {/* Bottom-third tappable CTA */}
      <button
        onClick={() => router.push('/onboarding/2')}
        className="absolute bottom-0 left-0 right-0 flex flex-col items-center justify-center gap-6"
        style={{ height: '30%' }}
        aria-label="Begin onboarding"
      >
        <span
          className="text-[16px] text-accent-coral"
          style={{ fontFamily: 'var(--font-fraunces)' }}
        >
          begin →
        </span>
        <ProgressIndicator step={1} />
      </button>
    </main>
  );
}
