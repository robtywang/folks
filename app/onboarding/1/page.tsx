'use client';

import { useRouter } from 'next/navigation';
import { ProgressDots } from '@/components/onboarding/ProgressDots';
import { PillButton } from '@/components/onboarding/PillButton';

export default function OnboardingStep1() {
  const router = useRouter();

  return (
    <main className="relative mx-auto flex h-[100svh] w-full max-w-md flex-col px-6 pt-10">
      {/* Wordmark — small at top, centered. */}
      <div
        className="text-center italic text-ink-primary"
        style={{ fontFamily: 'var(--font-fraunces)', fontSize: 28 }}
      >
        folks
      </div>

      {/* Hero quote, vertically centered. */}
      <div className="flex flex-1 flex-col items-center justify-center gap-7 text-center">
        <p
          className="italic text-ink-primary"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: 28,
            lineHeight: 1.2,
            maxWidth: 300,
          }}
        >
          Write hard and clear about what hurts.
        </p>
        <span
          className="uppercase"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.2em',
            color: 'var(--ink-tertiary)',
          }}
        >
          — Ernest Hemingway
        </span>
      </div>

      {/* Bottom controls — progress dots + pill button. */}
      <div className="flex flex-col items-center gap-6 pb-12">
        <ProgressDots active={1} />
        <PillButton onClick={() => router.push('/onboarding/2')}>
          begin →
        </PillButton>
      </div>
    </main>
  );
}
