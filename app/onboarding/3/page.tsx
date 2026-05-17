'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProgressDots } from '@/components/onboarding/ProgressDots';
import { PillButton } from '@/components/onboarding/PillButton';
import { TypingDemo } from '@/components/onboarding/TypingDemo';

export default function OnboardingStep3() {
  const router = useRouter();

  return (
    <main className="relative mx-auto flex h-[100svh] w-full max-w-md flex-col px-6 pt-6">
      <header className="flex items-center">
        <Link
          href="/onboarding/2"
          aria-label="Back"
          className="text-ink-secondary transition-colors hover:text-ink-primary"
        >
          <i className="ti ti-arrow-left" style={{ fontSize: 18 }} />
        </Link>
      </header>

      <div className="mt-8 flex flex-1 flex-col">
        <span
          className="uppercase"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.18em',
            color: 'var(--ink-secondary)',
          }}
        >
          STEP ONE
        </span>
        <h1
          className="mt-3 italic text-ink-primary"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: 26,
            lineHeight: 1.2,
          }}
        >
          vent.
          <br />
          about anyone.
        </h1>

        <div className="mt-8">
          <TypingDemo />
        </div>

        <p
          className="mt-5 italic"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: 14,
            lineHeight: 1.45,
            color: 'var(--ink-secondary)',
          }}
        >
          voice or text. folks listens, parses the names, and remembers who
          you&apos;re talking about.
        </p>
      </div>

      <div className="flex flex-col items-center gap-6 pb-12">
        <ProgressDots active={3} />
        <PillButton onClick={() => router.push('/onboarding/4')}>
          next →
        </PillButton>
      </div>
    </main>
  );
}
