'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProgressDots } from '@/components/onboarding/ProgressDots';
import { PillButton } from '@/components/onboarding/PillButton';
import { FriendRow } from '@/components/onboarding/FriendRow';

export default function OnboardingStep4() {
  const router = useRouter();

  return (
    <main className="relative mx-auto flex h-[100svh] w-full max-w-md flex-col px-6 pt-6">
      <header className="flex items-center">
        <Link
          href="/onboarding/3"
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
          STEP TWO
        </span>
        <h1
          className="mt-3 italic text-ink-primary"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: 26,
            lineHeight: 1.2,
          }}
        >
          folks notices.
          <br />
          and tells you.
        </h1>

        {/* Three staggered friend rows */}
        <div className="mt-6">
          <FriendRow
            monogram="K"
            name="Kate"
            caption="HEAVY · 10 ENTRIES"
            animationDelay="400ms"
          />
          <FriendRow
            monogram="M"
            name="Mom"
            caption="HEAVY · 4 ENTRIES"
            animationDelay="700ms"
          />
          <FriendRow
            monogram="D"
            name="Daniel"
            caption="WARM · 6 ENTRIES"
            animationDelay="1000ms"
          />
        </div>

        {/* Sage-tinted "folks's read" card — matches the existing
            "what folks has noticed" treatment on the friend journal. */}
        <div
          className="onboarding-fade-in mt-6 rounded-md"
          style={{
            animationDelay: '1600ms',
            animationFillMode: 'both',
            background: 'rgba(79, 160, 64, 0.07)',
            borderLeft: '2px solid var(--accent-sage)',
            padding: '12px 14px',
          }}
        >
          <span
            className="uppercase"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.12em',
              color: 'var(--ink-secondary)',
            }}
          >
            FOLKS&apos;S READ ON KATE
          </span>
          <p
            className="mt-2 italic"
            style={{
              fontFamily: 'var(--font-fraunces)',
              fontSize: 14,
              lineHeight: 1.5,
              color: 'var(--ink-primary)',
            }}
          >
            she reaches out in small emergencies and then turns cold in the
            room. most days with her end in some quiet form of hurt.
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-6 pb-12">
        <ProgressDots active={4} />
        <PillButton onClick={() => router.push('/onboarding/5')}>
          next →
        </PillButton>
      </div>
    </main>
  );
}
