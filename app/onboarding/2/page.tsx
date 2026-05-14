'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProgressIndicator } from '@/components/progress-indicator';

export default function OnboardingStep2() {
  const router = useRouter();
  const [ctaVisible, setCtaVisible] = useState(false);

  // CTA appears at 1800ms — after all 3 lines have faded in.
  useEffect(() => {
    const t = window.setTimeout(() => setCtaVisible(true), 1800);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <main className="mx-auto flex h-[100svh] w-full max-w-md flex-col overflow-hidden px-6 pt-6">
      {/* Back link */}
      <header className="flex items-center">
        <Link
          href="/onboarding/1"
          aria-label="Back"
          className="text-[11px] uppercase tracking-widest text-ink-secondary transition-colors hover:text-ink-primary"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          back
        </Link>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-10 text-center">
        <p
          className="onboarding-fade-in italic leading-snug text-ink-primary"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: '22px',
            animationDelay: '0ms',
          }}
        >
          write about your day.
        </p>
        <p
          className="onboarding-fade-in max-w-[280px] italic leading-snug text-ink-primary"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: '22px',
            animationDelay: '600ms',
          }}
        >
          the people you mention
          <br />
          become your circle.
        </p>
        <p
          className="onboarding-fade-in max-w-[280px] italic leading-snug text-ink-primary"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: '22px',
            animationDelay: '1200ms',
          }}
        >
          who's closest reveals
          <br />
          itself over time.
        </p>
      </div>

      <div className="flex flex-col items-center gap-6 pb-10">
        <button
          onClick={() => router.push('/onboarding/3')}
          disabled={!ctaVisible}
          className="text-[16px] text-accent-coral transition-opacity duration-400 disabled:opacity-0"
          style={{ fontFamily: 'var(--font-fraunces)' }}
          aria-hidden={!ctaVisible}
        >
          next →
        </button>
        <ProgressIndicator step={2} />
      </div>
    </main>
  );
}
