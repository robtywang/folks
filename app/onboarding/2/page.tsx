'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProgressDots } from '@/components/onboarding/ProgressDots';
import { PillButton } from '@/components/onboarding/PillButton';

export default function OnboardingStep2() {
  const router = useRouter();

  return (
    <main className="relative mx-auto flex h-[100svh] w-full max-w-md flex-col px-6 pt-6">
      {/* Back arrow */}
      <header className="flex items-center">
        <Link
          href="/onboarding/1"
          aria-label="Back"
          className="text-ink-secondary transition-colors hover:text-ink-primary"
        >
          <i className="ti ti-arrow-left" style={{ fontSize: 18 }} />
        </Link>
      </header>

      {/* Pitch — type-led, vertically centered. */}
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <h1
          className="italic text-ink-primary"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: 40,
            lineHeight: 1,
          }}
        >
          folks
        </h1>
        <p
          className="italic"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: 17,
            lineHeight: 1.45,
            color: 'var(--ink-secondary)',
            maxWidth: 300,
          }}
        >
          a journal for venting about the people in your life.
        </p>
      </div>

      <div className="flex flex-col items-center gap-6 pb-12">
        <ProgressDots active={2} />
        <PillButton onClick={() => router.push('/onboarding/3')}>
          how it works →
        </PillButton>
      </div>
    </main>
  );
}
