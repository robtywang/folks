'use client';

import { useRouter } from 'next/navigation';
import { ProgressIndicator } from '@/components/progress-indicator';

export default function OnboardingStep1() {
  const router = useRouter();

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pt-6">
      {/* Top spacer ~30% */}
      <div style={{ flex: '0 0 30%' }} aria-hidden="true" />

      {/* Center content */}
      <div className="flex flex-col items-center text-center">
        <h1
          className="italic leading-none text-ink-primary"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: '64px',
          }}
        >
          folks
        </h1>
        <p
          className="mt-6 max-w-[280px] text-[18px] italic leading-snug"
          style={{
            fontFamily: 'var(--font-fraunces)',
            color: '#8C7E5C',
          }}
        >
          find out who your real best friends are.
        </p>
      </div>

      {/* Bottom-third tappable CTA area */}
      <button
        onClick={() => router.push('/onboarding/2')}
        className="absolute bottom-0 left-0 right-0 flex flex-col items-center justify-center gap-6"
        style={{ height: '33%' }}
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
